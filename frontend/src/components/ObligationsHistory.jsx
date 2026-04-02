import React, { useState, useMemo, useEffect } from 'react';
import { formatCurrency, selectClass, Modal } from '../components/UI';
import TransactionDetailModal from '../components/TransactionDetailModal';
import TransactionSelectorModal from '../components/TransactionSelectorModal';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download, Link2, LinkIcon, Unlink, CheckCircle, Eye, List, LayoutGrid, PlusCircle, ArrowUpRight, Clock, DollarSign } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const ObligationsPayments = ({ obligations, history, monthOffset, onEdit, onDelete, onRefresh }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'billing_month', direction: 'desc' });
    const [viewMode, setViewMode] = useState('envelope'); // 'envelope' or 'table'

    // Link Modal State
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showMultiLinkModal, setShowMultiLinkModal] = useState(false); // New multi-select modal
    const [linkingPayment, setLinkingPayment] = useState(null);
    const [suggestedTransactions, setSuggestedTransactions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [linkedTransactionIds, setLinkedTransactionIds] = useState([]); // Already linked tx IDs

    // Transaction Detail Modal State
    const [showTransactionDetail, setShowTransactionDetail] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const formatMonthDisplay = (dateStr) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length < 2) return dateStr;
        const year = parts[0].substring(2);
        const monthNum = parseInt(parts[1], 10);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[monthNum - 1]}-${year}`;
    };

    // Filters - Sync with parent monthOffset
    const computeMonthFromOffset = (offset) => {
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return {
            year: target.getFullYear().toString(),
            month: (target.getMonth() + 1).toString().padStart(2, '0')
        };
    };

    const initial = monthOffset !== undefined ? computeMonthFromOffset(monthOffset) : { year: 'All', month: 'All' };
    const [selectedYear, setSelectedYear] = useState(initial.year);
    const [selectedMonth, setSelectedMonth] = useState(initial.month);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');

    // Sync with parent month navigation arrows
    useEffect(() => {
        if (monthOffset !== undefined) {
            const { year, month } = computeMonthFromOffset(monthOffset);
            setSelectedYear(year);
            setSelectedMonth(month);
        }
    }, [monthOffset]);

    // 1. Flatten Data & Prepare Options
    const { allHistory, years, categories } = useMemo(() => {
        const flattened = [];
        const uniqueYears = new Set();
        const uniqueCategories = new Set();
        const oblMap = {};

        obligations.forEach(o => oblMap[o.id] = o);

        // Process Actual Payment Records
        Object.entries(history).forEach(([oblId, records]) => {
            const obl = oblMap[oblId] || { name: 'Unknown', category: 'Unknown' };
            records.forEach(r => {
                const bMonth = r.billing_month || r.payment_date.split('T')[0];
                const year = bMonth.split('-')[0];

                uniqueYears.add(year);
                if (obl.category) uniqueCategories.add(obl.category);

                // Only include PAID payments, not BUDGET
                if (r.status === 'BUDGET') return; // Skip budget entries

                flattened.push({
                    ...r,
                    oblName: obl.name,
                    oblCategory: obl.category,
                    billing_month_sort: bMonth,
                    year: year,
                    month: bMonth.split('-')[1],
                    status: 'Paid'
                });
            });
        });

        uniqueYears.add(new Date().getFullYear().toString());

        return {
            allHistory: flattened,
            years: Array.from(uniqueYears).sort().reverse(),
            categories: Array.from(uniqueCategories).sort()
        };
    }, [obligations, history, selectedYear, selectedMonth, selectedStatus]);

    // 2. Filter
    const filtered = allHistory.filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
            item.oblName.toLowerCase().includes(term) ||
            (item.note && item.note.toLowerCase().includes(term)) ||
            (item.oblCategory && item.oblCategory.toLowerCase().includes(term))
        );

        const matchesYear = selectedYear === 'All' || item.year === selectedYear;
        const matchesMonth = selectedMonth === 'All' || item.month === selectedMonth;
        const matchesCategory = selectedCategory === 'All' || item.oblCategory === selectedCategory;
        const matchesStatus = selectedStatus === 'All' || item.status === selectedStatus;

        return matchesSearch && matchesYear && matchesMonth && matchesCategory && matchesStatus;
    });

    // 3. Sort
    const sorted = [...filtered].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    // 4. Calculate Total
    const visiblePaid = sorted.reduce((sum, item) => item.status === 'Paid' ? sum + (item.amount || 0) : sum, 0);
    const visibleBudget = sorted.filter(p => p.status === 'BUDGET').reduce((sum, p) => sum + (p.amount || 0), 0);

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

    let totalLabel = "Total Amount";
    let totalDisplay = visiblePaid + visibleBudget;
    let totalSubtext = (
        <div className="flex flex-col gap-0.5 mt-1">
            <span className="text-white font-semibold">{sorted.length} Records</span>
            <span className="flex items-center gap-1 text-[10px] opacity-80">
                <span className="text-emerald-400">{formatCurrency(visiblePaid)} Paid</span>
                <span>·</span>
                <span className="text-blue-400">{formatCurrency(visibleBudget)} Budget</span>
            </span>
        </div>
    );

    if (selectedStatus === 'Paid') {
        totalLabel = "Total Paid";
        totalDisplay = visiblePaid;
        totalSubtext = <span className="text-emerald-400 font-semibold">{sorted.length} Records</span>;
    } else if (selectedStatus === 'BUDGET') {
        totalLabel = "Total Budgeted";
        totalDisplay = visibleBudget;
        totalSubtext = <span className="text-blue-400 font-semibold">{sorted.length} Records</span>;
    }

    const handleExport = () => {
        const exportData = sorted.map(item => ({
            "Payment ID": item.id,
            "Obligation": item.oblName,
            "Category": item.oblCategory,
            "Billing Month": item.billing_month,
            "Year": item.year,
            "Month Label": item.month,
            "Paid Amount": item.status === 'Paid' ? (item.amount || 0) : 0,
            "Budget Amount": item.status === 'BUDGET' ? (item.amount || 0) : 0,
            "Status": item.status,
            "Paid Date": item.payment_date,
            "Note": item.note,
            "Transaction ID": item.transaction_id || ''
        }));

        const filename = `payments_export_${selectedYear}_${selectedStatus}.csv`;
        exportToCSV(exportData, filename);
    };

    // --- Link Transaction Functions ---
    const openLinkModal = async (payment) => {
        setLinkingPayment(payment);
        setShowLinkModal(true);
        setLoadingSuggestions(true);
        setSuggestedTransactions([]);

        try {
            // Fetch suggestions AND existing linked transactions
            const [suggestRes, linkedRes] = await Promise.all([
                axios.get(`${API_URL}/payments/${payment.id}/suggested-transactions`).catch(() => ({ data: [] })),
                axios.get(`${API_URL}/payments/${payment.id}/transactions`).catch(() => ({ data: [] }))
            ]);
            setSuggestedTransactions(suggestRes.data);
            setLinkedTransactionIds(linkedRes.data.map(tx => tx.id));
        } catch (err) {
            console.error("Error fetching suggestions:", err);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Open the multi-select modal from suggested modal
    const openMultiLinkModal = () => {
        setShowLinkModal(false);
        setShowMultiLinkModal(true);
    };

    const handleLinkTransaction = async (transactionId) => {
        if (!linkingPayment) return;

        try {
            await axios.post(`${API_URL}/payments/${linkingPayment.id}/link-transaction?transaction_id=${transactionId}`);
            setShowLinkModal(false);
            setLinkingPayment(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error linking transaction:", err);
            alert("Failed to link transaction");
        }
    };

    // Handle multi-link from TransactionSelectorModal
    const handleMultiLink = async (transactionIds) => {
        if (!linkingPayment || !transactionIds.length) return;

        try {
            await axios.post(`${API_URL}/payments/${linkingPayment.id}/transactions`, {
                transaction_ids: transactionIds
            });
            setShowMultiLinkModal(false);
            setLinkingPayment(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error linking transactions:", err);
            alert("Failed to link transactions");
        }
    };

    const handleUnlinkTransaction = async (paymentId) => {
        if (!confirm("Remove the link to this transaction?")) return;

        try {
            await axios.delete(`${API_URL}/payments/${paymentId}/unlink-transaction`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error unlinking:", err);
        }
    };

    // Unlink a single transaction from a payment (for multi-link junction table)
    const handleUnlinkSingleTransaction = async (paymentId, transactionId) => {
        if (!confirm("Remove the link to this transaction?")) return;

        try {
            await axios.delete(`${API_URL}/payments/${paymentId}/transactions/${transactionId}`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error unlinking transaction:", err);
            alert("Failed to unlink transaction");
        }
    };

    // --- Pay & Link: Create payment + open link modal ---
    const handlePayAndLink = async (obl, billingMonth) => {
        try {
            // Create a payment record for this obligation+month
            const payRes = await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                amount: obl.amount || 0,
                billing_month: billingMonth,
                status: 'Paid',
                payment_date: new Date().toISOString()
            });

            const newPayment = payRes.data;
            if (newPayment?.id) {
                // Build a payment-like object and open the link modal immediately
                // Do NOT call onRefresh() here — it re-renders and loses modal state
                const paymentObj = {
                    id: newPayment.id,
                    obligation_id: obl.id,
                    oblName: obl.name,
                    amount: newPayment.amount || obl.amount || 0,
                    billing_month: billingMonth
                };
                openLinkModal(paymentObj);
            }
        } catch (err) {
            console.error('Error creating payment:', err);
            alert('Failed to create payment record');
        }
    };

    // --- Envelope grouping by category ---
    const groupedByCategory = useMemo(() => {
        if (selectedYear === 'All' || selectedMonth === 'All') return [];

        const billingMonth = `${selectedYear}-${selectedMonth}`;
        const oblMap = {};
        obligations.forEach(o => oblMap[o.id] = o);

        const groups = {};

        // Group existing payment records by category
        sorted.forEach(item => {
            const cat = item.oblCategory || 'Other';
            if (!groups[cat]) {
                groups[cat] = {
                    category: cat,
                    items: [],
                    plannedItems: []
                };
            }
            groups[cat].items.push(item);
        });

        // Add planned obligations (those without payment records for this month)
        const oblsWithPayments = new Set(sorted.map(s => s.obligation_id));
        obligations.forEach(obl => {
            if (oblsWithPayments.has(obl.id)) return;
            if (selectedCategory !== 'All' && obl.category !== selectedCategory) return;

            const cat = obl.category || 'Other';
            if (!groups[cat]) {
                groups[cat] = {
                    category: cat,
                    items: [],
                    plannedItems: []
                };
            }
            groups[cat].plannedItems.push(obl);
        });

        return Object.values(groups)
            .filter(g => g.items.length > 0 || g.plannedItems.length > 0)
            .sort((a, b) => a.category.localeCompare(b.category));
    }, [sorted, obligations, selectedYear, selectedMonth, selectedCategory]);

    return (
        <div className="animate-fade-in-up space-y-4">
            {/* Top Stats & Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Summary Card */}
                <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 border border-blue-800/30 p-4 rounded-xl flex flex-col justify-center relative">
                    <p className="text-blue-300 text-xs uppercase font-bold tracking-wider mb-1">{totalLabel}</p>
                    <p className="text-2xl font-mono font-bold text-white">{formatCurrency(totalDisplay)}</p>
                    <div className="text-xs text-slate-500 mt-1">{totalSubtext}</div>
                </div>

                {/* Filters Area */}
                <div className="md:col-span-3 bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                            <Filter size={14} /> Filter Payments
                        </div>
                        <div className="flex gap-2">
                            <div className="flex bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                                <button
                                    onClick={() => setViewMode('envelope')}
                                    className={`text-xs px-2.5 py-1.5 flex items-center gap-1 transition ${viewMode === 'envelope' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <LayoutGrid size={12} /> Envelope
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`text-xs px-2.5 py-1.5 flex items-center gap-1 transition ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    <List size={12} /> Table
                                </button>
                            </div>
                            <button
                                onClick={handleExport}
                                className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
                                title="Export to CSV"
                            >
                                <Download size={14} /> Export
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
                            <option value="Paid">Paid</option>
                            <option value="BUDGET">Budget</option>
                        </select>

                        {/* Category Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            <option value="All">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Obligations List View */}
            {viewMode === 'envelope' && (
                <div className="space-y-2">
                    {(() => {
                        // Build a unified list: all obligations with their payment status for the selected month
                        if (selectedYear === 'All' || selectedMonth === 'All') {
                            return (
                                <div className="text-center py-20 text-slate-500">
                                    <Filter className="mx-auto mb-3 opacity-20" size={36} />
                                    <p className="text-sm">Select a specific month to see all obligations</p>
                                </div>
                            );
                        }

                        const billingMonth = `${selectedYear}-${selectedMonth}`;
                        const oblsWithPayments = new Set(sorted.map(s => s.obligation_id));
                        
                        // Combine: paid items + planned (no payment yet)
                        const allItems = [];

                        // Add paid/budgeted items from sorted
                        sorted.forEach(item => {
                            allItems.push({ type: 'payment', ...item });
                        });

                        // Add planned obligations (no payment record yet)
                        obligations.forEach(obl => {
                            if (oblsWithPayments.has(obl.id)) return;
                            if (selectedCategory !== 'All' && obl.category !== selectedCategory) return;

                            // Look up the planned amount for this obligation:
                            // 1. First check for a BUDGET entry for this month (set in Forecast tab)
                            // 2. Fall back to most recent PAID amount (matches Forecast API logic)
                            // 3. Fall back to obligation base amount
                            const oblHistory = history[obl.id] || [];
                            const budgetEntry = oblHistory.find(r =>
                                r.status === 'BUDGET' && (r.billing_month || '').startsWith(billingMonth)
                            );

                            let plannedAmount;
                            if (budgetEntry) {
                                plannedAmount = budgetEntry.amount;
                            } else {
                                // Use the most recent PAID amount (same as Forecast API)
                                const paidEntries = oblHistory
                                    .filter(r => r.status === 'Paid' || r.status === 'PAID')
                                    .sort((a, b) => (b.billing_month || '').localeCompare(a.billing_month || ''));
                                plannedAmount = paidEntries.length > 0 ? paidEntries[0].amount : (obl.amount || 0);
                            }

                            allItems.push({
                                type: 'planned',
                                id: `planned-${obl.id}`,
                                obligation_id: obl.id,
                                oblName: obl.name,
                                oblCategory: obl.category,
                                amount: plannedAmount,
                                billing_month: billingMonth + '-01',
                                status: 'Budget',
                                obl: obl
                            });
                        });

                        // Sort: budgets first, then by category, then by name
                        allItems.sort((a, b) => {
                            const aPaid = a.type === 'payment';
                            const bPaid = b.type === 'payment';
                            if (aPaid !== bPaid) return aPaid ? 1 : -1; // Unpaid first
                            const catA = (a.oblCategory || 'Other');
                            const catB = (b.oblCategory || 'Other');
                            if (catA !== catB) return catA.localeCompare(catB);
                            return (a.oblName || '').localeCompare(b.oblName || '');
                        });

                        if (allItems.length === 0) {
                            return (
                                <div className="text-center py-20 text-slate-500">
                                    <Filter className="mx-auto mb-3 opacity-20" size={36} />
                                    <p className="text-sm">No obligations found for this month</p>
                                </div>
                            );
                        }

                        // Summary stats
                        const totalPaid = allItems.filter(i => i.type === 'payment').length;
                        const totalBudget = allItems.length - totalPaid;

                        return (
                            <>
                                {/* Quick summary bar */}
                                <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30 mb-2">
                                    <span className="text-slate-400 text-xs">
                                        {allItems.length} obligation{allItems.length > 1 ? 's' : ''}
                                    </span>
                                    <div className="flex items-center gap-3 text-[10px] font-mono">
                                        <span className="text-emerald-400">
                                            <CheckCircle size={10} className="inline mr-0.5" />{totalPaid} paid
                                        </span>
                                        <span className="text-amber-400">
                                            <Clock size={10} className="inline mr-0.5" />{totalBudget} budget
                                        </span>
                                    </div>
                                </div>

                                {/* Obligations list */}
                                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-lg divide-y divide-slate-700/30">
                                    {allItems.map(item => {
                                        const isPaid = item.type === 'payment';
                                        const isPlanned = item.type === 'planned';
                                        const hasLinkedTx = item.transaction_id || (item.linked_transactions && item.linked_transactions.length > 0);

                                        return (
                                            <div key={item.id} className={`px-4 py-3 flex items-center justify-between gap-4 transition ${isPaid ? 'bg-emerald-900/5' : isPlanned ? 'bg-amber-900/5 border-l-2 border-l-amber-500/40' : 'hover:bg-slate-700/20'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {/* Status badge */}
                                                        {isPaid ? (
                                                            <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase whitespace-nowrap">
                                                                <CheckCircle size={8} className="inline mr-0.5" />Paid
                                                            </span>
                                                        ) : (
                                                            <span className="text-[8px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase whitespace-nowrap">
                                                                <Clock size={8} className="inline mr-0.5" />Budget
                                                            </span>
                                                        )}

                                                        {/* Obligation name */}
                                                        <span className="text-white font-semibold text-sm truncate">{item.oblName}</span>

                                                        {/* Category badge */}
                                                        {item.oblCategory && (
                                                            <span className="text-[8px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{item.oblCategory}</span>
                                                        )}

                                                        {/* Amount */}
                                                        <span className="text-emerald-400 font-mono font-medium text-sm ml-auto mr-2">
                                                            {item.amount > 0 ? formatCurrency(item.amount) : '—'}
                                                        </span>
                                                    </div>

                                                    {/* Linked transactions (if any) */}
                                                    {item.linked_transactions && item.linked_transactions.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1.5 ml-14">
                                                            {item.linked_transactions.map(tx => (
                                                                <div key={tx.id} className="flex items-center gap-1 bg-purple-500/10 text-purple-400 text-[9px] px-1.5 py-0.5 rounded">
                                                                    <button
                                                                        onClick={() => { setSelectedTransaction(tx); setShowTransactionDetail(true); }}
                                                                        className="font-mono hover:text-purple-200 flex items-center gap-0.5"
                                                                    >
                                                                        <Eye size={8} /> {tx.merchant?.substring(0, 15) || tx.id.substring(0, 8)}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUnlinkSingleTransaction(item.id, tx.id)}
                                                                        className="text-purple-500 hover:text-red-400 transition"
                                                                    >
                                                                        <Unlink size={8} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {isPlanned ? (
                                                        <button
                                                            onClick={() => handlePayAndLink(item.obl, item.billing_month)}
                                                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold uppercase tracking-wider transition flex items-center gap-1 shadow-sm"
                                                        >
                                                            <DollarSign size={10} /> Pay
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => openLinkModal(item)}
                                                                className="bg-slate-700/50 hover:bg-purple-600/50 text-slate-400 hover:text-purple-300 text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-purple-500 font-bold uppercase tracking-wider transition flex items-center gap-1"
                                                            >
                                                                <DollarSign size={10} /> Pay
                                                            </button>
                                                            <button
                                                                onClick={() => onDelete(item)}
                                                                className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-1 rounded transition-all"
                                                                title="Delete"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase font-bold backdrop-blur-sm">
                            <tr>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('billing_month_sort')}>
                                    <div className="flex items-center gap-1">Month {getSortIcon('billing_month_sort')}</div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('oblName')}>
                                    <div className="flex items-center gap-1">Name {getSortIcon('oblName')}</div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('status')}>
                                    <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
                                </th>
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
                                    <td className="px-4 py-3 text-blue-300 font-mono text-xs">
                                        {formatMonthDisplay(item.billing_month)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-white">{item.oblName}</div>
                                        {item.note && <div className="text-[10px] text-slate-500 italic truncate max-w-[150px]">{item.note}</div>}
                                    </td>

                                    <td className="px-4 py-3">
                                        {item.status === 'Paid' ? (
                                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded border border-emerald-500/30 font-bold uppercase tracking-wider">Paid</span>
                                        ) : (
                                            <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-1 rounded border border-blue-500/30 font-bold uppercase tracking-wider">Budget</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 font-mono text-emerald-400 font-medium">
                                        {formatCurrency(item.amount)}
                                    </td>

                                    {/* Linked Transaction Column */}
                                    <td className="px-4 py-3">
                                        {/* Check for new multi-link first, fallback to legacy single-link */}
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
                                                            title="View transaction details"
                                                        >
                                                            <Eye size={10} />
                                                            {tx.merchant?.substring(0, 12) || tx.id.substring(0, 8)}...
                                                        </button>
                                                        <button
                                                            onClick={() => handleUnlinkSingleTransaction(item.id, tx.id)}
                                                            className="text-purple-500 hover:text-red-400 transition ml-1"
                                                            title="Unlink this transaction"
                                                        >
                                                            <Unlink size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => openLinkModal(item)}
                                                    className="text-slate-500 hover:text-purple-400 text-[10px] px-1 py-1 transition"
                                                    title="Pay more"
                                                >
                                                    + Pay
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
                                                    title="View transaction details"
                                                >
                                                    <Eye size={10} />
                                                    {item.transaction_id.substring(0, 8)}...
                                                </button>
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
                                                <DollarSign size={10} /> Pay
                                            </button>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(item)}
                                            className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white p-1.5 rounded transition-all duration-200"
                                            title={item.status === 'Paid' ? "Edit Payment" : "Make Payment"}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                        <button
                                            onClick={() => onDelete(item)}
                                            className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-1.5 rounded transition-all duration-200"
                                            title="Delete Payment"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <Filter className="opacity-20" size={48} />
                                        <span>No payments found matching your filters.</span>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* Link Transaction Modal */}
            <Modal isOpen={showLinkModal} title="Link to Transaction" onClose={() => setShowLinkModal(false)}>
                <div className="space-y-4">
                    {linkingPayment && (
                        <div className="bg-slate-700/50 p-3 rounded-lg text-sm">
                            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Payment</div>
                            <div className="text-white font-semibold">{linkingPayment.oblName}</div>
                            <div className="text-emerald-400 font-mono">{formatCurrency(linkingPayment.amount)}</div>
                            <div className="text-slate-500 text-xs">{formatMonthDisplay(linkingPayment.billing_month)}</div>
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
                                    key={tx.transaction_id}
                                    className={`p-3 rounded-lg border cursor-pointer transition ${tx.already_linked
                                        ? 'bg-emerald-500/10 border-emerald-500/30'
                                        : 'bg-slate-700/50 border-slate-600 hover:border-purple-500 hover:bg-purple-500/10'
                                        }`}
                                    onClick={() => !tx.already_linked && handleLinkTransaction(tx.transaction_id)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-white font-semibold text-sm">{tx.merchant || 'Unknown'}</div>
                                            <div className="text-slate-400 text-xs">
                                                {tx.date ? new Date(tx.date).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-emerald-400 font-mono text-sm">{formatCurrency(tx.amount)}</div>
                                            {tx.already_linked ? (
                                                <span className="text-emerald-400 text-[10px] flex items-center gap-1 justify-end">
                                                    <CheckCircle size={10} /> Linked
                                                </span>
                                            ) : (
                                                <div className="text-[10px] text-purple-400">
                                                    Score: {tx.score}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {tx.reasons && tx.reasons.length > 0 && (
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {tx.reasons.map(r => (
                                                <span key={r} className="bg-slate-600/50 text-slate-400 text-[9px] px-1.5 py-0.5 rounded">
                                                    {r.replace('_', ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <LinkIcon className="mx-auto mb-2 opacity-30" size={32} />
                            <div>No matching transactions found.</div>
                            <div className="text-xs mt-1">Try adjusting the payment date or amount.</div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={openMultiLinkModal}
                            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                        >
                            <List size={14} /> Browse All Transactions
                        </button>
                        <button
                            onClick={() => setShowLinkModal(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Multi-Select Transaction Linking Modal */}
            <TransactionSelectorModal
                isOpen={showMultiLinkModal}
                onClose={() => {
                    setShowMultiLinkModal(false);
                    setLinkingPayment(null);
                }}
                onSelect={handleMultiLink}
                currentLinked={linkedTransactionIds}
                title={`Link Transactions to ${linkingPayment?.oblName || 'Payment'}`}
                expectedAmount={linkingPayment?.amount || null}
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
        </div>
    );
};

export default ObligationsPayments;
