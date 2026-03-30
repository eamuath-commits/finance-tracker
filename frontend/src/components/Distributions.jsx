import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { formatCurrency, selectClass } from './UI';
import TransactionDetailModal from './TransactionDetailModal';
import TransactionSelectorModal from './TransactionSelectorModal';
import ConfirmDialog from './ConfirmDialog';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download, Link2, LinkIcon, Unlink, CheckCircle, Trash2, Eye, ArrowUpRight, Clock, LayoutGrid, List, PlusCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const Distributions = ({ accounts }) => {
    const [transfers, setTransfers] = useState([]);
    const [allocationPreview, setAllocationPreview] = useState(null);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString().padStart(2, '0'));
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [selectedTarget, setSelectedTarget] = useState('All');
    const [viewMode, setViewMode] = useState('envelope'); // 'envelope' or 'table'

    // Link Modal State

    const [showMultiLinkModal, setShowMultiLinkModal] = useState(false);
    const [linkingTransfer, setLinkingTransfer] = useState(null);

    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [linkedTransactionIds, setLinkedTransactionIds] = useState([]);

    // Transaction Detail Modal State
    const [showTransactionDetail, setShowTransactionDetail] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    // Confirm Dialog State
    const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

    useEffect(() => {
        fetchTransfers();
    }, []);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const [distRes, previewRes] = await Promise.all([
                axios.get(`${API_URL}/distributions`),
                fetchAllocationPreview()
            ]);
            setTransfers(distRes.data);
        } catch (error) {
            console.error("Failed to fetch payroll transfers:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllocationPreview = async () => {
        try {
            // Find income/source account
            const incomeAcc = accounts.find(a => a.is_income);
            if (!incomeAcc) return;

            // Calculate month_offset from selected year/month
            const now = new Date();
            let offset = 0;
            if (selectedYear !== 'All' && selectedMonth !== 'All') {
                const targetDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1);
                offset = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
            }

            const res = await axios.post(`${API_URL}/allocation/preview`, {
                source_account_id: incomeAcc.id,
                month_offset: offset
            });
            setAllocationPreview(res.data);
        } catch (error) {
            console.error("Failed to fetch allocation preview:", error);
        }
    };

    // Re-fetch preview when month/year filter changes
    useEffect(() => {
        if (accounts.length > 0 && selectedYear !== 'All' && selectedMonth !== 'All') {
            fetchAllocationPreview();
        }
    }, [selectedYear, selectedMonth, accounts]);

    const formatMonthDisplay = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length < 2) return dateStr;
        const year = parts[0].substring(2);
        const monthNum = parseInt(parts[1], 10);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[monthNum - 1]}-${year}`;
    };

    // Prepare filter options
    const { years, targetAccounts } = useMemo(() => {
        const uniqueYears = new Set();
        const uniqueTargets = new Set();

        transfers.forEach(t => {
            if (t.billing_month) {
                uniqueYears.add(t.billing_month.split('-')[0]);
            }
            if (t.target_account_name) {
                uniqueTargets.add(t.target_account_name);
            }
        });

        uniqueYears.add(currentDate.getFullYear().toString());

        return {
            years: Array.from(uniqueYears).sort().reverse(),
            targetAccounts: Array.from(uniqueTargets).sort()
        };
    }, [transfers]);

    // Filter
    const filtered = transfers.filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
            (item.target_account_name || '').toLowerCase().includes(term) ||
            (item.source_account_name || '').toLowerCase().includes(term) ||
            (item.note || '').toLowerCase().includes(term)
        );

        const itemYear = item.billing_month?.split('-')[0];
        const itemMonth = item.billing_month?.split('-')[1];

        const matchesYear = selectedYear === 'All' || itemYear === selectedYear;
        const matchesMonth = selectedMonth === 'All' || itemMonth === selectedMonth;
        const matchesTarget = selectedTarget === 'All' || item.target_account_name === selectedTarget;

        const isLinked = item.transaction_id != null || (item.linked_transactions && item.linked_transactions.length > 0);
        const matchesStatus = selectedStatus === 'All' ||
            (selectedStatus === 'Linked' && isLinked) ||
            (selectedStatus === 'Pending' && !isLinked);

        return matchesSearch && matchesYear && matchesMonth && matchesTarget && matchesStatus;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Calculate totals
    const totalAmount = sorted.reduce((sum, item) => sum + (item.amount || 0), 0);
    const linkedCount = sorted.filter(t => t.transaction_id).length;
    const pendingCount = sorted.filter(t => !t.transaction_id && (!t.linked_transactions || t.linked_transactions.length === 0)).length;

    // Envelope grouping - merge real distributions with planned allocations
    const groupedByEnvelope = useMemo(() => {
        const groups = {};

        // Add real distribution records
        sorted.forEach(item => {
            const key = item.target_account_id || 'unknown';
            if (!groups[key]) {
                groups[key] = {
                    target_account_id: key,
                    target_account_name: item.target_account_name || 'Unknown',
                    items: [],
                    plannedItems: []
                };
            }
            groups[key].items.push(item);
        });

        // Add planned items from allocation preview (only for current month filter)
        // Skip envelopes that already have real distribution records
        if (allocationPreview && selectedYear !== 'All' && selectedMonth !== 'All') {
            const filterMonth = `${selectedYear}-${selectedMonth}`;
            if (allocationPreview.billing_month === filterMonth) {
                allocationPreview.allocations.forEach(alloc => {
                    if (alloc.status === 'pending') {
                        const key = alloc.target_account_id;
                        // Only show as planned if NO distribution record exists for this envelope
                        if (groups[key] && groups[key].items.length > 0) return;

                        if (!groups[key]) {
                            groups[key] = {
                                target_account_id: key,
                                target_account_name: alloc.target_account_name || 'Unknown',
                                items: [],
                                plannedItems: []
                            };
                        }
                        groups[key].plannedItems.push(alloc);
                    }
                });
            }
        }

        return Object.values(groups)
            .filter(g => g.items.length > 0 || g.plannedItems.length > 0)
            .sort((a, b) => a.target_account_name.localeCompare(b.target_account_name));
    }, [sorted, allocationPreview, selectedYear, selectedMonth]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={12} className="text-slate-600" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUp size={12} className="text-blue-400" /> :
            <ArrowDown size={12} className="text-blue-400" />;
    };

    const months = [
        { value: '01', label: 'January' }, { value: '02', label: 'February' },
        { value: '03', label: 'March' }, { value: '04', label: 'April' },
        { value: '05', label: 'May' }, { value: '06', label: 'June' },
        { value: '07', label: 'July' }, { value: '08', label: 'August' },
        { value: '09', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' }
    ];

    // Link functions
    const openLinkModal = async (transfer) => {
        setLinkingTransfer(transfer);
        setLoadingSuggestions(true);
        setLinkedTransactionIds([]);

        try {
            const linkedRes = await axios.get(`${API_URL}/distributions/${transfer.id}/transactions`).catch(() => ({ data: [] }));
            setLinkedTransactionIds(linkedRes.data.map(tx => tx.id));
        } catch (err) {
            console.error("Error fetching linked transactions:", err);
        } finally {
            setLoadingSuggestions(false);
        }

        // Go directly to the full TransactionSelectorModal
        setShowMultiLinkModal(true);
    };

    // Create distribution for an entire envelope (all planned obligations for a target account), then open link modal
    const handleCreateAndLink = async (plannedItems, targetAccountId) => {
        try {
            const incomeAcc = accounts.find(a => a.is_income);
            if (!incomeAcc) return alert('No source income account found');

            const billingMonth = `${selectedYear}-${selectedMonth}`;

            // Calculate correct month_offset
            const now = new Date();
            const targetDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1);
            const offset = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());

            // Create ONE distribution for all obligations in this envelope
            const oblIds = plannedItems.map(p => p.obligation_id);
            await axios.post(`${API_URL}/allocation/execute`, {
                source_account_id: incomeAcc.id,
                month_offset: offset,
                obligation_ids: oblIds
            });

            // Re-fetch to get the new distribution
            const distRes = await axios.get(`${API_URL}/distributions`);
            setTransfers(distRes.data);

            // Find the newly created distribution for this target account + month
            const newDist = distRes.data.find(d =>
                d.target_account_id === targetAccountId &&
                d.billing_month === billingMonth &&
                !d.transaction_id &&
                (!d.linked_transactions || d.linked_transactions.length === 0)
            );

            if (newDist) {
                openLinkModal(newDist);
            }

            // Refresh preview
            await fetchAllocationPreview();
        } catch (err) {
            console.error('Error creating distribution:', err);
            alert('Failed to create distribution record');
        }
    };

    const handleLinkTransaction = async (transactionId) => {
        if (!linkingTransfer) return;

        try {
            await axios.post(`${API_URL}/distributions/${linkingTransfer.id}/link?transaction_id=${transactionId}`);
            setShowLinkModal(false);
            setLinkingTransfer(null);
            fetchTransfers();
        } catch (err) {
            console.error("Error linking transaction:", err);
            alert("Failed to link transaction");
        }
    };

    const handleMultiLink = async (transactionIds) => {
        if (!linkingTransfer || !transactionIds.length) return;

        try {
            await axios.post(`${API_URL}/distributions/${linkingTransfer.id}/transactions`, {
                transaction_ids: transactionIds
            });
            setShowMultiLinkModal(false);
            setLinkingTransfer(null);
            fetchTransfers();
        } catch (err) {
            console.error("Error linking transactions:", err);
            alert("Failed to link transactions");
        }
    };

    const handleUnlinkTransaction = (transferId) => {
        setConfirmDialog({
            open: true,
            title: 'Unlink Transaction',
            message: 'Remove the link to this transaction?',
            onConfirm: async () => {
                try {
                    await axios.put(`${API_URL}/distributions/${transferId}`, { transaction_id: null });
                    fetchTransfers();
                } catch (err) {
                    console.error("Error unlinking:", err);
                }
                setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
            }
        });
    };

    // Unlink a single transaction from a distribution (for multi-link junction table)
    const handleUnlinkSingleTransaction = (distributionId, transactionId) => {
        setConfirmDialog({
            open: true,
            title: 'Unlink Transaction',
            message: 'Remove the link to this transaction?',
            onConfirm: async () => {
                try {
                    await axios.delete(`${API_URL}/distributions/${distributionId}/transactions/${transactionId}`);
                    fetchTransfers();
                } catch (err) {
                    console.error("Error unlinking transaction:", err);
                    alert("Failed to unlink transaction");
                }
                setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
            }
        });
    };

    const handleDelete = (transferId) => {
        setConfirmDialog({
            open: true,
            title: 'Delete Distribution',
            message: 'Are you sure you want to delete this distribution record?',
            onConfirm: async () => {
                try {
                    await axios.delete(`${API_URL}/distributions/${transferId}`);
                    fetchTransfers();
                } catch (error) {
                    console.error("Failed to delete transfer:", error);
                }
                setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
            }
        });
    };

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
                <div className="animate-pulse text-gray-400">Loading distributions...</div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up space-y-4">
            {/* Top Stats & Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Summary Card */}
                <div className="bg-gradient-to-br from-purple-900/50 to-slate-900 border border-purple-800/30 p-4 rounded-xl flex flex-col justify-center relative">
                    <p className="text-purple-300 text-xs uppercase font-bold tracking-wider mb-1">Total Transferred</p>
                    <p className="text-2xl font-mono font-bold text-white">{formatCurrency(totalAmount)}</p>
                    <div className="text-xs text-slate-500 mt-1">
                        <div className="flex flex-col gap-0.5 mt-1">
                            <span className="text-white font-semibold">{sorted.length} Records</span>
                            <span className="flex items-center gap-1 text-[10px] opacity-80">
                                <span className="text-emerald-400">{linkedCount} Distributed</span>
                                <span>·</span>
                                <span className="text-amber-400">{pendingCount} Pending</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Filters Area */}
                <div className="md:col-span-3 bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                            <Filter size={14} /> Filter Transfers
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900/50 p-0.5 rounded-lg">
                            <button
                                onClick={() => setViewMode('envelope')}
                                className={`p-1.5 rounded transition ${viewMode === 'envelope' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}
                                title="Envelope View"
                            >
                                <LayoutGrid size={14} />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded transition ${viewMode === 'table' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}
                                title="Table View"
                            >
                                <List size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {/* Search */}
                        <div className="relative md:col-span-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-xs focus:outline-none focus:border-blue-500 transition"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Year Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                        >
                            <option value="All">All Years</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        {/* Month Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            <option value="All">All Months</option>
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>

                        {/* Status Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="All">All Status</option>
                            <option value="Linked">Distributed</option>
                            <option value="Pending">Pending</option>
                        </select>

                        {/* Target Account Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedTarget}
                            onChange={(e) => setSelectedTarget(e.target.value)}
                        >
                            <option value="All">All Accounts</option>
                            {targetAccounts.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Envelope View */}
            {viewMode === 'envelope' && (
                <div className="space-y-4">
                    {groupedByEnvelope.length > 0 ? groupedByEnvelope.map(group => {
                        const groupTotal = group.items.reduce((s, i) => s + (i.amount || 0), 0);
                        const plannedTotal = group.plannedItems.reduce((s, i) => s + (i.amount || 0), 0);
                        const groupLinked = group.items.filter(i => i.transaction_id || (i.linked_transactions && i.linked_transactions.length > 0)).length;
                        const totalItems = group.items.length + group.plannedItems.length;
                        const allDone = groupLinked === totalItems && group.plannedItems.length === 0;

                        return (
                            <div key={group.target_account_id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-lg">
                                {/* Envelope Header */}
                                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-700/30">
                                    <div className="flex items-center gap-2">
                                        <ArrowUpRight size={14} className={allDone ? "text-emerald-400" : "text-slate-500"} />
                                        <span className="text-white font-semibold text-sm">{group.target_account_name}</span>
                                        <span className="text-[9px] text-slate-500 font-mono">
                                            ({totalItems} item{totalItems > 1 ? 's' : ''})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-slate-400 font-mono">
                                            Total: <span className="text-purple-400 font-semibold">{formatCurrency(groupTotal + plannedTotal)}</span>
                                        </span>
                                        {group.items.length > 0 && (
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                <span className="text-emerald-400">{groupLinked}</span>/{group.items.length} distributed
                                            </span>
                                        )}
                                        {group.plannedItems.length > 0 && (
                                            <span className="text-[10px] text-amber-400 font-mono">
                                                {group.plannedItems.length} planned
                                            </span>
                                        )}
                                        {allDone ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30 uppercase">
                                                <CheckCircle size={10} /> Distributed
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-lg border border-blue-500/30 uppercase">
                                                <Clock size={10} /> Pending
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Distribution Items + Planned Items */}
                                <div className="divide-y divide-slate-700/30">
                                    {/* Real distribution records */}
                                    {group.items.map(item => {
                                        const isLinked = item.transaction_id || (item.linked_transactions && item.linked_transactions.length > 0);
                                        return (
                                            <div key={item.id} className={`px-4 py-3 flex items-center justify-between gap-4 ${isLinked ? 'bg-emerald-900/5' : 'hover:bg-slate-700/20'} transition`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-emerald-400 font-mono font-medium text-sm">{formatCurrency(item.amount)}</span>
                                                        {item.obligation_name && (
                                                            <span className="text-blue-300 text-xs">{item.obligation_name}</span>
                                                        )}
                                                        {item.note && (
                                                            <span className="text-slate-500 text-[10px] italic truncate max-w-[200px]">{item.note}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Linked transactions */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {item.linked_transactions && item.linked_transactions.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.linked_transactions.map(tx => (
                                                                <div key={tx.id} className="flex items-center gap-1 bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded border border-purple-500/30">
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedTransaction(tx);
                                                                            setShowTransactionDetail(true);
                                                                        }}
                                                                        className="font-mono hover:text-purple-200 flex items-center gap-1"
                                                                    >
                                                                        <Eye size={9} />
                                                                        {tx.merchant?.substring(0, 10) || tx.id.substring(0, 6)}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUnlinkSingleTransaction(item.id, tx.id)}
                                                                        className="text-purple-500 hover:text-red-400 transition"
                                                                    >
                                                                        <Unlink size={9} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : item.transaction_id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedTransaction(item.linked_transaction);
                                                                    setShowTransactionDetail(true);
                                                                }}
                                                                className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded border border-purple-500/30 font-mono flex items-center gap-1 hover:bg-purple-500/30 transition"
                                                            >
                                                                <Eye size={9} />
                                                                {item.transaction_id.substring(0, 8)}
                                                            </button>
                                                            <button
                                                                onClick={() => handleUnlinkTransaction(item.id)}
                                                                className="text-slate-500 hover:text-red-400 transition"
                                                            >
                                                                <Unlink size={12} />
                                                            </button>
                                                        </div>
                                                    ) : null}

                                                    <button
                                                        onClick={() => openLinkModal(item)}
                                                        className="bg-slate-700/50 hover:bg-purple-600/50 text-slate-400 hover:text-purple-300 text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-purple-500 font-bold uppercase tracking-wider transition flex items-center gap-1"
                                                    >
                                                        <LinkIcon size={10} /> Distribute
                                                    </button>

                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-1 rounded transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Planned envelope summary (no distribution record yet) */}
                                    {group.plannedItems.length > 0 && (
                                        <div className="px-4 py-3 border-l-2 border-l-amber-500/40 bg-amber-900/5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-amber-400 font-mono font-semibold text-sm">{formatCurrency(plannedTotal)}</span>
                                                        <span className="text-[8px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase">
                                                            Planned
                                                        </span>
                                                        <span className="text-[9px] text-slate-500">
                                                            {group.plannedItems.length} obligation{group.plannedItems.length > 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {group.plannedItems.map(p => (
                                                            <span key={p.obligation_id} className="text-[9px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">
                                                                {p.obligation_name} ({formatCurrency(p.amount)})
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleCreateAndLink(group.plannedItems, group.target_account_id)}
                                                    className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 hover:text-amber-200 text-[10px] px-3 py-1.5 rounded border border-amber-500/30 hover:border-amber-400 font-bold uppercase tracking-wider transition flex items-center gap-1.5 flex-shrink-0"
                                                >
                                                    <PlusCircle size={11} /> Create & Link
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="text-center py-16 text-slate-500">
                            <Filter className="opacity-20 mx-auto mb-3" size={48} />
                            <p>No distributions found matching your filters.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase font-bold backdrop-blur-sm">
                            <tr>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('billing_month')}>
                                    <div className="flex items-center gap-1">Month {getSortIcon('billing_month')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-700">
                                    <div className="flex items-center gap-1">Obligation</div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('target_account_name')}>
                                    <div className="flex items-center gap-1">Target Account {getSortIcon('target_account_name')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-700">Status</th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center gap-1">Amount {getSortIcon('amount')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-700">Transaction</th>
                                <th className="px-4 py-4 border-b border-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {sorted.length > 0 ? sorted.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-700/30 transition text-slate-300">
                                    <td className="px-4 py-3 text-purple-300 font-mono text-xs">
                                        {formatMonthDisplay(item.billing_month)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.obligation_name ? (
                                            <span className="text-blue-300 text-xs font-medium">{item.obligation_name}</span>
                                        ) : (
                                            <span className="text-slate-600 text-xs italic">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-white">{item.target_account_name}</div>
                                        {item.note && <div className="text-[10px] text-slate-500 italic truncate max-w-[200px]">{item.note}</div>}
                                    </td>

                                    <td className="px-4 py-3">
                                        {(item.linked_transactions && item.linked_transactions.length > 0) || item.transaction_id ? (
                                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded border border-emerald-500/30 font-bold uppercase tracking-wider">Distributed</span>
                                        ) : (
                                            <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-1 rounded border border-amber-500/30 font-bold uppercase tracking-wider">Pending</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-emerald-400 font-medium">
                                        {formatCurrency(item.amount)}
                                    </td>

                                    {/* Linked Transaction Column */}
                                    <td className="px-4 py-3">
                                        {item.linked_transactions && item.linked_transactions.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {item.linked_transactions.map(tx => (
                                                    <div key={tx.id} className="flex items-center gap-1 bg-purple-500/20 text-purple-400 text-[10px] px-2 py-1 rounded border border-purple-500/30">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedTransaction(tx);
                                                                setShowTransactionDetail(true);
                                                            }}
                                                            className="font-mono hover:text-purple-200 flex items-center gap-1"
                                                        >
                                                            <Eye size={10} />
                                                            {tx.merchant?.substring(0, 12) || tx.id.substring(0, 8)}...
                                                        </button>
                                                        <button
                                                            onClick={() => handleUnlinkSingleTransaction(item.id, tx.id)}
                                                            className="text-purple-500 hover:text-red-400 transition ml-1"
                                                        >
                                                            <Unlink size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => openLinkModal(item)}
                                                    className="text-slate-500 hover:text-purple-400 text-[10px] px-1 py-1 transition"
                                                >
                                                    + Distribute
                                                </button>
                                            </div>
                                        ) : item.transaction_id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedTransaction(item.linked_transaction);
                                                        setShowTransactionDetail(true);
                                                    }}
                                                    className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-1 rounded border border-purple-500/30 font-mono flex items-center gap-1 hover:bg-purple-500/30 hover:border-purple-400 transition cursor-pointer"
                                                >
                                                    <Eye size={10} />
                                                    {item.transaction_id.substring(0, 8)}...
                                                </button>
                                                <button
                                                    onClick={() => handleUnlinkTransaction(item.id)}
                                                    className="text-slate-500 hover:text-red-400 transition"
                                                >
                                                    <Unlink size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => openLinkModal(item)}
                                                className="bg-slate-700/50 hover:bg-purple-600/50 text-slate-400 hover:text-purple-300 text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-purple-500 font-bold uppercase tracking-wider transition flex items-center gap-1"
                                            >
                                                <LinkIcon size={10} /> Distribute
                                            </button>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-1.5 rounded transition-all duration-200"
                                            title="Delete Transfer"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Filter className="opacity-20" size={48} />
                                            <span>No distributions found matching your filters.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* Transaction Linking Modal (with SMS viewing & multi-select) */}
            <TransactionSelectorModal
                isOpen={showMultiLinkModal}
                onClose={() => {
                    setShowMultiLinkModal(false);
                    setLinkingTransfer(null);
                }}
                onSelect={handleMultiLink}
                currentLinked={linkedTransactionIds}
                title={`Link Transactions to ${linkingTransfer?.target_account_name || 'Distribution'}`}
                filters={{ accountId: linkingTransfer?.source_account_id || '' }}
                expectedAmount={linkingTransfer?.amount || null}
            />

            {/* Transaction Detail Modal */}
            <TransactionDetailModal
                isOpen={showTransactionDetail}
                onClose={() => {
                    setShowTransactionDetail(false);
                    setSelectedTransaction(null);
                }}
                transaction={selectedTransaction}
            />

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmDialog.open}
                title={confirmDialog.title}
                message={confirmDialog.message}
                onConfirm={confirmDialog.onConfirm}
                onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null })}
            />
        </div>
    );
};

export default Distributions;
