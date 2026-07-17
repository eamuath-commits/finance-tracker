import React, { useState, useMemo, useEffect, useRef } from 'react';
import api, { API_URL } from '../utils/api';
import { formatCurrency, selectClass, Modal } from '../components/UI';
import TransactionDetailModal from '../components/TransactionDetailModal';
import TransactionSelectorModal from '../components/TransactionSelectorModal';
import { CATEGORY_ICONS, CATEGORY_COLORS, CategoryHeader, CategorySectionWrapper } from './categoryStyles';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download, Link2, LinkIcon, Unlink, CheckCircle, Eye, List, LayoutGrid, PlusCircle, ArrowUpRight, Clock, DollarSign, MessageSquare, Box } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';
import { useConfirm } from './ConfirmProvider';


// Compact inline filter select — the shared selectClass is w-full, which made
// these four dropdowns each take a full row and stack.
const compactSelect = "bg-slate-800 border border-slate-600 rounded-lg text-xs text-gray-300 px-2.5 py-2 outline-none focus:border-blue-500 transition";

const ObligationsPayments = ({ obligations, history, monthOffset, onEdit, onDelete, onRefresh, forecast }) => {
    const confirm = useConfirm();
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
    const [expandedSms, setExpandedSms] = useState(null);
    const [payMenuId, setPayMenuId] = useState(null); // which item's pay menu is open
    const payMenuRef = useRef(null);

    // Close pay menu on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (payMenuRef.current && !payMenuRef.current.contains(e.target)) {
                setPayMenuId(null);
            }
        };
        if (payMenuId) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [payMenuId]);

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

    // Compute forecast budget total for obligations without PAID records this month
    const plannedBudgetTotal = useMemo(() => {
        if (selectedYear === 'All' || selectedMonth === 'All') return 0;
        const billingMonth = `${selectedYear}-${selectedMonth}`;

        const oblsWithPayments = new Set(sorted.map(s => s.obligation_id));

        // Build forecast lookup from API data
        const forecastLookup = {};
        if (forecast && forecast.obligations) {
            forecast.obligations.forEach(f => { forecastLookup[f.id] = f.forecast_amount || 0; });
        }

        // Build BUDGET entries lookup for this month
        const budgetLookup = {};
        Object.entries(history).forEach(([oblId, records]) => {
            records.forEach(r => {
                if (r.status !== 'BUDGET') return;
                const bm = (r.billing_month || '').substring(0, 7);
                if (bm === billingMonth) {
                    budgetLookup[oblId] = r.amount || 0;
                }
            });
        });

        let total = 0;
        obligations.forEach(obl => {
            if (oblsWithPayments.has(obl.id)) return;
            if (selectedCategory !== 'All' && obl.category !== selectedCategory) return;

            // Priority: manual BUDGET entry > forecast API > obligation default
            if (budgetLookup[obl.id] !== undefined) {
                total += budgetLookup[obl.id];
            } else if (forecastLookup[obl.id] !== undefined) {
                total += forecastLookup[obl.id];
            } else {
                total += obl.amount || 0;
            }
        });

        return total;
    }, [obligations, history, forecast, sorted, selectedYear, selectedMonth, selectedCategory]);

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

    const totalBudget = plannedBudgetTotal;
    let totalLabel = "Total Amount";
    let totalDisplay = visiblePaid + totalBudget;
    let totalSubtext = (
        <div className="flex flex-col gap-0.5 mt-1">
            <span className="text-white font-semibold">{obligations.length} Obligations</span>
            <span className="flex items-center gap-1 text-[10px] opacity-80">
                <span className="text-emerald-400">{formatCurrency(visiblePaid)} Paid</span>
                <span>·</span>
                <span className="text-blue-400">{formatCurrency(totalBudget)} Budget</span>
            </span>
        </div>
    );

    if (selectedStatus === 'Paid') {
        totalLabel = "Total Paid";
        totalDisplay = visiblePaid;
        totalSubtext = <span className="text-emerald-400 font-semibold">{sorted.length} Records</span>;
    } else if (selectedStatus === 'BUDGET') {
        totalLabel = "Total Budgeted";
        totalDisplay = totalBudget;
        totalSubtext = <span className="text-blue-400 font-semibold">{obligations.length} Obligations</span>;
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
                api.get(`${API_URL}/payments/${payment.id}/suggested-transactions`).catch(() => ({ data: [] })),
                api.get(`${API_URL}/payments/${payment.id}/transactions`).catch(() => ({ data: [] }))
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
            await api.post(`${API_URL}/payments/${linkingPayment.id}/link-transaction?transaction_id=${transactionId}`);
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
            await api.post(`${API_URL}/payments/${linkingPayment.id}/transactions`, {
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
        if (!(await confirm({ title: 'Unlink Transaction', message: 'Remove the link to this transaction?', variant: 'danger', confirmText: 'Remove' }))) return;

        try {
            await api.delete(`${API_URL}/payments/${paymentId}/unlink-transaction`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error unlinking:", err);
            alert(err.response?.data?.detail || 'Failed to unlink transaction');
        }
    };

    // Unlink a single transaction from a payment (for multi-link junction table)
    const handleUnlinkSingleTransaction = async (paymentId, transactionId) => {
        if (!(await confirm({ title: 'Unlink Transaction', message: 'Remove the link to this transaction?', variant: 'danger', confirmText: 'Remove' }))) return;

        try {
            await api.delete(`${API_URL}/payments/${paymentId}/transactions/${transactionId}`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Error unlinking transaction:", err);
            alert("Failed to unlink transaction");
        }
    };

    // --- Pay & Link: Create payment + auto-link best match + open modal for verification ---
    const handlePayAndLink = async (obl, billingMonth, plannedAmount) => {
        try {
            // Create a payment record for this obligation+month
            const payAmount = plannedAmount || obl.amount || 0;
            const payRes = await api.post(`${API_URL}/obligations/${obl.id}/pay`, {
                amount: payAmount,
                billing_month: billingMonth,
                status: 'Paid',
                payment_date: new Date().toISOString()
            });

            const newPayment = payRes.data;
            if (newPayment?.id) {
                let didAutoLink = false;

                // Try to auto-link the best matching transaction
                try {
                    const suggestRes = await api.get(`${API_URL}/payments/${newPayment.id}/suggested-transactions`);
                    const suggestions = suggestRes.data || [];
                    const bestMatch = suggestions.length > 0 ? suggestions[0] : null;
                    if (bestMatch && bestMatch.score >= 80 && !bestMatch.already_linked) {
                        await api.post(`${API_URL}/payments/${newPayment.id}/transactions`, {
                            transaction_ids: [bestMatch.transaction_id],
                            link_source: 'auto'
                        });
                        didAutoLink = true;
                    }
                } catch (suggestErr) {
                    console.warn('Could not auto-link transaction:', suggestErr);
                }

                // If auto-linked, update payment source to 'auto'
                if (didAutoLink) {
                    try {
                        await api.put(`${API_URL}/obligations/history/${newPayment.id}`, {
                            source: 'auto',
                            note: `Auto-linked to best match`
                        });
                    } catch (e) { /* non-critical */ }
                }

                // Build a payment-like object and open the link modal for verification
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

    // --- Mark Paid: Create payment without linking ---
    const handleMarkPaid = async (obl, billingMonth, plannedAmount) => {
        try {
            const payAmount = plannedAmount || obl.amount || 0;
            await api.post(`${API_URL}/obligations/${obl.id}/pay`, {
                amount: payAmount,
                billing_month: billingMonth,
                status: 'Paid',
                payment_date: new Date().toISOString()
            });
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Error marking as paid:', err);
            alert('Failed to mark as paid');
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

    // --- Unified allItems: paid + planned (used by both Envelope and Table views) ---
    const allItems = useMemo(() => {
        if (selectedYear === 'All' || selectedMonth === 'All') return [];

        const billingMonth = `${selectedYear}-${selectedMonth}`;
        const oblsWithPayments = new Set(sorted.map(s => s.obligation_id));

        const items = [];

        // Add paid items from sorted
        sorted.forEach(item => {
            items.push({ type: 'payment', ...item });
        });

        // Add planned obligations (no payment record yet)
        const forecastLookup = {};
        if (forecast && forecast.obligations) {
            forecast.obligations.forEach(f => { forecastLookup[f.id] = f.forecast_amount || 0; });
        }

        // Build a lookup for BUDGET entries per obligation for this month
        const budgetLookup = {};
        const oblMap = {};
        obligations.forEach(o => { oblMap[o.id] = o; });
        Object.entries(history).forEach(([oblId, records]) => {
            records.forEach(r => {
                if (r.status !== 'BUDGET') return;
                const bm = (r.billing_month || '').substring(0, 7);
                if (bm === billingMonth) {
                    budgetLookup[oblId] = r.amount || 0;
                }
            });
        });

        obligations.forEach(obl => {
            if (oblsWithPayments.has(obl.id)) return;
            if (selectedCategory !== 'All' && obl.category !== selectedCategory) return;

            // Priority: manual BUDGET entry > forecast API > obligation default
            const plannedAmount = budgetLookup[obl.id] !== undefined
                ? budgetLookup[obl.id]
                : (forecastLookup[obl.id] !== undefined
                    ? forecastLookup[obl.id]
                    : (obl.amount || 0));

            items.push({
                type: 'planned',
                id: `planned-${obl.id}`,
                obligation_id: obl.id,
                oblName: obl.name,
                oblCategory: obl.category,
                amount: plannedAmount,
                billing_month: billingMonth + '-01',
                billing_month_sort: billingMonth + '-01',
                status: 'Budget',
                obl: obl
            });
        });

        // Sort: budgets first, then by category, then by name
        items.sort((a, b) => {
            const aPaid = a.type === 'payment';
            const bPaid = b.type === 'payment';
            if (aPaid !== bPaid) return aPaid ? 1 : -1;
            const catA = (a.oblCategory || 'Other');
            const catB = (b.oblCategory || 'Other');
            if (catA !== catB) return catA.localeCompare(catB);
            return (a.oblName || '').localeCompare(b.oblName || '');
        });

        return items;
    }, [sorted, obligations, forecast, selectedYear, selectedMonth, selectedCategory]);

    // --- Group allItems by category for the category-section view ---
    const groupedAllItems = useMemo(() => {
        const groups = {};
        allItems.forEach(item => {
            const cat = item.oblCategory || 'Other';
            if (!groups[cat]) groups[cat] = { paid: [], planned: [] };
            if (item.type === 'payment') {
                groups[cat].paid.push(item);
            } else {
                groups[cat].planned.push(item);
            }
        });
        return Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, items]) => ({
                category: cat,
                items: [...items.planned, ...items.paid], // Budget first, then paid
                paidCount: items.paid.length,
                plannedCount: items.planned.length,
                totalAmount: [...items.paid, ...items.planned].reduce((s, i) => s + (i.amount || 0), 0)
            }));
    }, [allItems]);

    const [collapsedCategories, setCollapsedCategories] = useState(new Set());
    const toggleCategory = (cat) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    };

    return (
        <div className="animate-fade-in-up space-y-4">
            {/* Summary Cards — matches Manager tab gradient style */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-900/30 to-slate-900/90 backdrop-blur-sm border border-blue-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">{totalLabel}</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(totalDisplay)}</p>
                    <div className="text-[10px] text-blue-400/60 mt-1">{totalSubtext}</div>
                </div>

                <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900/90 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Paid</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(visiblePaid)}</p>
                    <p className="text-[10px] text-emerald-400/60 mt-1">{sorted.length} payment records</p>
                </div>

                <div className="bg-gradient-to-br from-amber-900/20 to-slate-900/90 backdrop-blur-sm border border-amber-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold mb-1">Left to pay</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(totalBudget)}</p>
                    <p className="text-[10px] text-amber-400/60 mt-1">{allItems.filter(i => i.type === 'planned').length} pending obligations</p>
                </div>
            </div>

            {/* Progress: how much of this month's commitment is paid */}
            {selectedYear !== 'All' && selectedMonth !== 'All' && totalDisplay > 0 && (
                <div className="px-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                        <span>{months.find(m => m.value === selectedMonth)?.label} {selectedYear} — {allItems.filter(i => i.type === 'payment').length} of {allItems.length} paid</span>
                        <span className="font-mono">{Math.round((visiblePaid / totalDisplay) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (visiblePaid / totalDisplay) * 100)}%` }} />
                    </div>
                </div>
            )}

            {/* Toolbar — matches Manager tab */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-800/80 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition w-48"
                        />
                    </div>
                    <select className={compactSelect} value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                        <option value="All">All Years</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select className={compactSelect} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                        <option value="All">All Months</option>
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select className={compactSelect} value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                        <option value="All">All Status</option>
                        <option value="Paid">Paid</option>
                        <option value="BUDGET">Budget</option>
                    </select>
                    <select className={compactSelect} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                        <option value="All">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Category-Grouped Obligations */}
            {(selectedYear === 'All' || selectedMonth === 'All') ? (
                <div className="text-center py-16 text-slate-500">
                    <Filter className="mx-auto mb-3 opacity-20" size={36} />
                    <p className="text-sm">Select a specific month to see all obligations</p>
                </div>
            ) : groupedAllItems.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                    <Box size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No obligations found for this period</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groupedAllItems.map(group => {
                        const isCollapsed = collapsedCategories.has(group.category);
                        return (
                            <CategorySectionWrapper key={group.category} category={group.category}>
                                <CategoryHeader
                                    category={group.category}
                                    count={group.items.length}
                                    isCollapsed={isCollapsed}
                                    onToggle={() => toggleCategory(group.category)}
                                    rightContent={
                                        <span className="font-mono text-[11px] text-slate-400">
                                            {formatCurrency(group.totalAmount)}
                                        </span>
                                    }
                                />

                                {!isCollapsed && (
                                        <div className="overflow-x-auto mobile-scroll">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-800/30">
                                                <tr className="text-[8px] uppercase font-bold text-slate-500">
                                                    <th className="px-3 md:px-4 py-1.5 min-w-[100px]">Name</th>
                                                    <th className="px-3 py-1.5 text-center">Status</th>
                                                    <th className="px-3 py-1.5 text-right">Amount</th>
                                                    <th className="px-3 py-1.5 hidden md:table-cell">Transaction</th>
                                                    <th className="px-3 py-1.5 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map((item, idx) => {
                                                    const isPaid = item.type === 'payment';
                                                    const isPlanned = item.type === 'planned';

                                                    return (
                                                        <tr key={`${item.id}-${idx}`} className={`border-b border-slate-700/20 hover:bg-slate-800/50 transition-colors group ${isPlanned ? 'bg-amber-900/5' : ''}`}>
                                                            {/* Name */}
                                                            <td className="px-4 py-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-medium text-white text-[12px] truncate">{item.oblName}</span>
                                                                </div>
                                                                {item.note && <div className="text-[9px] text-slate-500 italic truncate max-w-[200px]">{item.note}</div>}
                                                            </td>

                                                            {/* Status */}
                                                            <td className="px-3 py-2 text-center">
                                                                {isPaid ? (
                                                                    <div className="flex flex-col items-center gap-1">
                                                                        <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 text-[9px] px-2 py-0.5 rounded-full border border-emerald-500/25 font-bold uppercase tracking-wider">
                                                                            <CheckCircle size={9} /> Paid
                                                                        </span>
                                                                        {item.source === 'auto' ? (
                                                                            <span className="inline-flex items-center gap-0.5 bg-cyan-500/15 text-cyan-400 text-[8px] px-1.5 py-0.5 rounded-full border border-cyan-500/25 font-bold uppercase tracking-wider">
                                                                                ⚡Auto
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-0.5 bg-slate-500/10 text-slate-400 text-[8px] px-1.5 py-0.5 rounded-full border border-slate-500/20 font-bold uppercase tracking-wider">
                                                                                ✋ Manual
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[9px] px-2 py-0.5 rounded-full border border-amber-500/25 font-bold uppercase tracking-wider">
                                                                        <Clock size={9} /> Budget
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* Amount */}
                                                            <td className={`px-3 py-2 text-right font-mono text-[12px] font-medium ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                {item.amount > 0 ? formatCurrency(item.amount) : '—'}
                                                            </td>

                                                            {/* Transaction */}
                                                            <td className="px-3 py-2 hidden md:table-cell">
                                                                {isPlanned ? (
                                                                    <div className="relative" ref={payMenuId === `${item.id}-${idx}` ? payMenuRef : null}>
                                                                        <button
                                                                            onClick={() => setPayMenuId(payMenuId === `${item.id}-${idx}` ? null : `${item.id}-${idx}`)}
                                                                            className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] px-2.5 py-1 rounded font-bold uppercase tracking-wider transition flex items-center gap-1"
                                                                        >
                                                                            <DollarSign size={9} /> Pay
                                                                        </button>
                                                                        {payMenuId === `${item.id}-${idx}` && (
                                                                            <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                                                                                <button
                                                                                    onClick={() => { setPayMenuId(null); handlePayAndLink(item.obl, item.billing_month, item.amount); }}
                                                                                    className="w-full px-3 py-2 text-left text-[10px] text-white hover:bg-blue-600/30 transition flex items-center gap-2 border-b border-slate-700"
                                                                                >
                                                                                    <DollarSign size={11} className="text-blue-400" /> Pay & Link Transaction
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => { setPayMenuId(null); handleMarkPaid(item.obl, item.billing_month, item.amount); }}
                                                                                    className="w-full px-3 py-2 text-left text-[10px] text-white hover:bg-emerald-600/30 transition flex items-center gap-2"
                                                                                >
                                                                                    <CheckCircle size={11} className="text-emerald-400" /> Mark as Paid
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : item.linked_transactions && item.linked_transactions.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {item.linked_transactions.map(tx => (
                                                                            <div key={tx.id} className="flex items-center gap-1.5 bg-purple-500/15 text-purple-400 text-[9px] px-2 py-1 rounded-lg border border-purple-500/25">
                                                                                <button
                                                                                    onClick={() => { setSelectedTransaction(tx); setShowTransactionDetail(true); }}
                                                                                    className="hover:text-purple-200 flex items-center gap-1 text-left"
                                                                                    title="View transaction details"
                                                                                >
                                                                                    <Eye size={10} />
                                                                                    <span className="font-medium">{tx.merchant?.substring(0, 25) || 'Unknown'}</span>
                                                                                    <span className="text-purple-300/60 font-mono text-[8px]">{formatCurrency(tx.amount)}</span>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleUnlinkSingleTransaction(item.id, tx.id)}
                                                                                    className="text-purple-500/50 hover:text-red-400 transition ml-0.5"
                                                                                    title="Unlink"
                                                                                >
                                                                                    <Unlink size={9} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                        <button onClick={() => openLinkModal(item)} className="text-slate-500 hover:text-purple-400 text-[9px] px-1 transition">+ Link</button>
                                                                    </div>
                                                                ) : item.transaction_id ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <button
                                                                            onClick={() => { setSelectedTransaction(item.linked_transaction); setShowTransactionDetail(true); }}
                                                                            className="bg-purple-500/15 text-purple-400 text-[9px] px-2 py-1 rounded-lg border border-purple-500/25 flex items-center gap-1.5 hover:bg-purple-500/25 transition text-left"
                                                                            title="View transaction details"
                                                                        >
                                                                            <Eye size={10} />
                                                                            <span className="font-medium">{item.linked_transaction?.merchant?.substring(0, 25) || 'Linked'}</span>
                                                                            {item.linked_transaction?.amount && (
                                                                                <span className="text-purple-300/60 font-mono text-[8px]">{formatCurrency(item.linked_transaction.amount)}</span>
                                                                            )}
                                                                        </button>
                                                                        <button onClick={() => handleUnlinkTransaction(item.id)} className="text-slate-500/50 hover:text-red-400 transition" title="Unlink">
                                                                            <Unlink size={10} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => openLinkModal(item)}
                                                                        className="bg-slate-700/50 hover:bg-purple-600/50 text-slate-400 hover:text-purple-300 text-[9px] px-2 py-1 rounded border border-slate-600 hover:border-purple-500 font-bold uppercase tracking-wider transition flex items-center gap-1"
                                                                    >
                                                                        <DollarSign size={9} /> Link
                                                                    </button>
                                                                )}
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="px-3 py-2 text-right">
                                                                {isPaid && (
                                                                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition">
                                                                        <button
                                                                            onClick={() => onEdit(item)}
                                                                            className="text-slate-500 hover:text-blue-400 p-1 rounded transition"
                                                                            title="Edit Payment"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => onDelete(item)}
                                                                            className="text-slate-500 hover:text-red-400 p-1 rounded transition"
                                                                            title="Delete Payment"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        </div>
                                )}
                            </CategorySectionWrapper>
                        );
                    })}
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
                                        <div className="flex-1 min-w-0 mr-3">
                                            <div className="text-white font-semibold text-sm flex items-center gap-1.5">
                                                {tx.merchant || 'Unknown'}
                                                {tx.raw_sms_content && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedSms(prev => prev === tx.transaction_id ? null : tx.transaction_id);
                                                        }}
                                                        className={`p-0.5 rounded transition ${expandedSms === tx.transaction_id ? 'text-blue-400 bg-blue-500/20' : 'text-slate-500 hover:text-blue-400 hover:bg-slate-600/50'}`}
                                                        title="View SMS"
                                                    >
                                                        <MessageSquare size={13} />
                                                    </button>
                                                )}
                                            </div>
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
                                    {/* Expandable SMS Content */}
                                    {expandedSms === tx.transaction_id && tx.raw_sms_content && (
                                        <div className="mt-2 border-t border-slate-600/30 pt-2">
                                            <div className="bg-slate-900/80 rounded-lg p-2.5">
                                                <div className="text-[9px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1">
                                                    <MessageSquare size={9} /> SMS Content
                                                </div>
                                                <p className="text-slate-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                                                    {tx.raw_sms_content}
                                                </p>
                                            </div>
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
