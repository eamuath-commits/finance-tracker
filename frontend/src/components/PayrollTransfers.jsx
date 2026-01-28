import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { formatCurrency, selectClass, Modal } from './UI';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download, Link2, LinkIcon, Unlink, CheckCircle, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const PayrollTransfers = ({ accounts }) => {
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString().padStart(2, '0'));
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [selectedTarget, setSelectedTarget] = useState('All');

    // Link Modal State
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkingTransfer, setLinkingTransfer] = useState(null);
    const [suggestedTransactions, setSuggestedTransactions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    useEffect(() => {
        fetchTransfers();
    }, []);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/payroll-transfers`);
            setTransfers(res.data);
        } catch (error) {
            console.error("Failed to fetch payroll transfers:", error);
        } finally {
            setLoading(false);
        }
    };

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

        const isLinked = item.transaction_id != null;
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
    const pendingCount = sorted.filter(t => !t.transaction_id).length;

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
        setShowLinkModal(true);
        setLoadingSuggestions(true);
        setSuggestedTransactions([]);

        try {
            const res = await axios.get(`${API_URL}/payroll-transfers/${transfer.id}/matches`);
            setSuggestedTransactions(res.data);
        } catch (err) {
            console.error("Error fetching suggestions:", err);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleLinkTransaction = async (transactionId) => {
        if (!linkingTransfer) return;

        try {
            await axios.post(`${API_URL}/payroll-transfers/${linkingTransfer.id}/link?transaction_id=${transactionId}`);
            setShowLinkModal(false);
            setLinkingTransfer(null);
            fetchTransfers();
        } catch (err) {
            console.error("Error linking transaction:", err);
            alert("Failed to link transaction");
        }
    };

    const handleUnlinkTransaction = async (transferId) => {
        if (!confirm("Remove the link to this transaction?")) return;

        try {
            await axios.put(`${API_URL}/payroll-transfers/${transferId}`, { transaction_id: null });
            fetchTransfers();
        } catch (err) {
            console.error("Error unlinking:", err);
        }
    };

    const handleDelete = async (transferId) => {
        if (!confirm("Delete this payroll transfer record?")) return;
        try {
            await axios.delete(`${API_URL}/payroll-transfers/${transferId}`);
            fetchTransfers();
        } catch (error) {
            console.error("Failed to delete transfer:", error);
        }
    };

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
                <div className="animate-pulse text-gray-400">Loading payroll transfers...</div>
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
                                <span className="text-emerald-400">{linkedCount} Linked</span>
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
                            <option value="Linked">Linked</option>
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

            {/* Table */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase font-bold backdrop-blur-sm">
                            <tr>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('billing_month')}>
                                    <div className="flex items-center gap-1">Month {getSortIcon('billing_month')}</div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('target_account_name')}>
                                    <div className="flex items-center gap-1">Target Account {getSortIcon('target_account_name')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-700">Status</th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center gap-1">Amount {getSortIcon('amount')}</div>
                                </th>
                                <th className="px-4 py-4 border-b border-slate-700">Linked Transaction</th>
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
                                        <div className="font-semibold text-white">{item.target_account_name}</div>
                                        {item.note && <div className="text-[10px] text-slate-500 italic truncate max-w-[200px]">{item.note}</div>}
                                    </td>

                                    <td className="px-4 py-3">
                                        {item.transaction_id ? (
                                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded border border-emerald-500/30 font-bold uppercase tracking-wider">Linked</span>
                                        ) : (
                                            <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-1 rounded border border-amber-500/30 font-bold uppercase tracking-wider">Pending</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-emerald-400 font-medium">
                                        {formatCurrency(item.amount)}
                                    </td>

                                    {/* Linked Transaction Column */}
                                    <td className="px-4 py-3">
                                        {item.transaction_id ? (
                                            <div className="flex items-center gap-2">
                                                <span className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-1 rounded border border-purple-500/30 font-mono flex items-center gap-1">
                                                    <Link2 size={10} />
                                                    {item.transaction_id.substring(0, 8)}...
                                                </span>
                                                <button
                                                    onClick={() => handleUnlinkTransaction(item.id)}
                                                    className="text-slate-500 hover:text-red-400 transition"
                                                    title="Unlink transaction"
                                                >
                                                    <Unlink size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => openLinkModal(item)}
                                                className="bg-slate-700/50 hover:bg-purple-600/50 text-slate-400 hover:text-purple-300 text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-purple-500 font-bold uppercase tracking-wider transition flex items-center gap-1"
                                            >
                                                <LinkIcon size={10} /> Link
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
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Filter className="opacity-20" size={48} />
                                            <span>No payroll transfers found matching your filters.</span>
                                            <span className="text-xs">Use the Payday Distributor to execute transfers.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Link Transaction Modal */}
            <Modal isOpen={showLinkModal} title="Link to Transaction" onClose={() => setShowLinkModal(false)}>
                <div className="space-y-4">
                    {linkingTransfer && (
                        <div className="bg-slate-700/50 p-3 rounded-lg text-sm">
                            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Payroll Transfer</div>
                            <div className="text-white font-semibold">{linkingTransfer.target_account_name}</div>
                            <div className="text-emerald-400 font-mono">{formatCurrency(linkingTransfer.amount)}</div>
                            <div className="text-slate-500 text-xs">{formatMonthDisplay(linkingTransfer.billing_month)}</div>
                        </div>
                    )}

                    <div className="text-slate-400 text-xs uppercase font-bold">Suggested Transactions</div>

                    {loadingSuggestions ? (
                        <div className="text-center py-8 text-slate-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            Finding matching transactions...
                        </div>
                    ) : suggestedTransactions.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {suggestedTransactions.map(tx => (
                                <div
                                    key={tx.id}
                                    className="p-3 rounded-lg border cursor-pointer transition bg-slate-700/50 border-slate-600 hover:border-purple-500 hover:bg-purple-500/10"
                                    onClick={() => handleLinkTransaction(tx.id)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-white font-semibold text-sm">{tx.merchant || 'Transfer'}</div>
                                            <div className="text-slate-400 text-xs">
                                                {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-emerald-400 font-mono text-sm">{formatCurrency(tx.amount)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <LinkIcon className="mx-auto mb-2 opacity-30" size={32} />
                            <div>No matching transactions found.</div>
                            <div className="text-xs mt-1">The transfer may have been auto-linked already.</div>
                        </div>
                    )}

                    <button
                        onClick={() => setShowLinkModal(false)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition"
                    >
                        Cancel
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default PayrollTransfers;
