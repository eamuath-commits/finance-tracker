import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass, selectClass } from '../components/UI';
import { CheckCircle, XCircle, History, Calendar, Trash2, ArrowRight, Pencil, Banknote, Home, Zap, Utensils, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Box } from 'lucide-react';

const Obligations = () => {
    const [obligations, setObligations] = useState([]);
    const [history, setHistory] = useState({});
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showObligationModal, setShowObligationModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [selectedHistory, setSelectedHistory] = useState([]);
    const [viewingHistoryId, setViewingHistoryId] = useState(null);

    // Forms
    // Default billing_month to today YYYY-MM-DD for safety, though we override it
    const [obligationForm, setObligationForm] = useState({ name: '', amount: '', due_day: '', category: '' });
    const [paymentForm, setPaymentForm] = useState({ id: null, amount: '', note: '', billing_month: new Date().toISOString().split('T')[0] });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchObligations = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            setObligations(res.data);

            const historyData = {};
            await Promise.all(res.data.map(async (obl) => {
                const hRes = await axios.get(`${API_URL}/obligations/${obl.id}/history`);
                historyData[obl.id] = hRes.data;
            }));
            setHistory(historyData);
        } catch (error) {
            console.error("Error fetching obligations", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchObligations();
    }, []);

    // --- Helpers ---
    const getMonthStatus = (obl, offset) => {
        const now = new Date();
        // Billing Cycle Logic: Cycle starts on the 23rd.
        // If today is < 23rd, we are still considered to be in the Previous Month's cycle logic for "Current".
        // e.g. Jan 15 (< 23) -> effectively Dec cycle is "Current" (offset 0).
        // Jan 24 (>= 23) -> effectively Jan cycle is "Current" (offset 0).

        let baseYear = now.getFullYear();
        let baseMonth = now.getMonth();

        if (now.getDate() < 23) {
            baseMonth -= 1;
        }

        const targetDate = new Date(baseYear, baseMonth + offset, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        // Format YYYY-MM-01 for predictable API usage
        const billingDateStr = `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-01`;

        const payments = history[obl.id] || [];

        // Helper to check if a payment matches a specific month/year
        const isMatch = (p, m, y) => {
            if (p.billing_month) {
                const [py, pm] = p.billing_month.split('-').map(Number);
                return (pm - 1) === m && py === y;
            }
            let d = new Date(p.payment_date);
            return d.getMonth() === m && d.getFullYear() === y;
        };

        const payment = payments.find(p => isMatch(p, targetMonth, targetYear));

        // Smart Amount Logic:
        // Use actual payment if exists.
        // Else, find the MOST RECENT payment that occurred BEFORE this target month.
        // Smart Amount Logic:
        // Use actual payment if exists.
        // Else, find the MOST RECENT payment that occurred BEFORE this target month.
        let displayAmount = null;

        if (payment) {
            displayAmount = payment.amount;
        } else if (offset < 0) {
            // Only look for past history "guesses" if we are looking at a PAST month
            const pastPayments = payments.filter(p => {
                let d = new Date(p.billing_month || p.payment_date);
                return d < targetDate;
            });

            if (pastPayments.length > 0) {
                pastPayments.sort((a, b) => new Date(b.billing_month || b.payment_date) - new Date(a.billing_month || a.payment_date));
                displayAmount = pastPayments[0].amount;
            }
        }

        // Default to obligation amount for current/future unpaid months
        if (displayAmount === null && offset >= 0) {
            displayAmount = obl.amount;
        }

        return {
            label: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            shortLabel: targetDate.toLocaleDateString('en-US', { month: 'short' }),
            monthIndex: targetMonth,
            billingDateStr: billingDateStr,
            isPaid: !!payment,
            amount: displayAmount, // Now returns Smart Amount
            date: payment ? payment.payment_date : null,
            paymentId: payment ? payment.id : null
        };
    };

    const getNextDueDate = (day) => {
        if (!day) return "Not set";
        const now = new Date();
        const date = new Date(now.getFullYear(), now.getMonth(), day);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // --- Handlers ---
    const handleSaveObligation = async (e) => {
        e.preventDefault();

        const payload = {
            name: obligationForm.name,
            amount: parseFloat(obligationForm.amount || 0),
            category: obligationForm.category,
            due_day: parseInt(obligationForm.due_day || 1)
        };

        try {
            if (editingId) {
                await axios.put(`${API_URL}/obligations/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/obligations/`, payload);
            }
            setShowObligationModal(false);
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
            fetchObligations();
        } catch (err) { alert('Error saving obligation'); }
    };

    const handleDeleteObligation = async () => {
        if (!editingId) return;
        if (!confirm("Are you sure?")) return;
        try {
            await axios.delete(`${API_URL}/obligations/${editingId}`);
            setShowObligationModal(false);
            setEditingId(null);
            fetchObligations();
        } catch (err) { alert('Error deleting'); }
    };

    // Open Custom Payment Modal
    // Updated to accept amount override
    // Open Custom Payment Modal
    // Updated to accept amount override and history entry for editing
    const openPaymentModal = (obl, targetMonthStr = null, defaultAmount = null, historyEntry = null) => {
        const now = new Date();
        const defaultMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;

        if (historyEntry) {
            // Editing existing payment
            setPaymentForm({
                id: obl.id,
                historyId: historyEntry.id, // Track we are editing this history
                name: obl.name,
                amount: historyEntry.amount,
                note: historyEntry.note || "",
                billing_month: historyEntry.billing_month || targetMonthStr
            });
        } else {
            // New Payment
            setPaymentForm({
                id: obl.id,
                historyId: null,
                name: obl.name,
                amount: defaultAmount !== null ? defaultAmount : obl.amount,
                note: "Manual Payment",
                billing_month: targetMonthStr || defaultMonthStr
            });
        }
        setShowPaymentModal(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!paymentForm.id) return;

        try {
            if (paymentForm.historyId) {
                // UPDATE existing record
                await axios.put(`${API_URL}/obligations/history/${paymentForm.historyId}`, {
                    payment_date: new Date().toISOString(), // Optional: keep original date? Used prefers update to today usually? Let's check user intent. Usually standard is to update amount only. But we can update date too.
                    amount: parseFloat(paymentForm.amount || 0),
                    billing_month: paymentForm.billing_month,
                    note: paymentForm.note
                });
            } else {
                // CREATE new record
                await axios.post(`${API_URL}/obligations/${paymentForm.id}/pay`, {
                    payment_date: new Date().toISOString(),
                    amount: parseFloat(paymentForm.amount || 0),
                    billing_month: paymentForm.billing_month,
                    note: paymentForm.note
                });
            }
            setShowPaymentModal(false);

            // If viewing history, update that list too
            if (viewingHistoryId) {
                const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
                setSelectedHistory(hRes.data);
            }

            fetchObligations();
        } catch (err) { alert("Error processing payment"); }
    };

    // ... existing helpers ...



    // Replace manual grid content with unified component usage in map:
    // This is too complex for one regex replacement. I will stick to minimal targeted replacements.



    const handleAddPastPayment = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        // Always assume "Today" for payment_date when manually adding history
        const pDate = new Date();

        // Construct Billing Month String directly (YYYY-MM-01) to avoid Timezone Shifts
        const bYear = formData.get('billing_year');
        const bMonthIndex = parseInt(formData.get('billing_month_idx')) + 1; // 1-12
        const bMonthStr = `${bYear}-${bMonthIndex.toString().padStart(2, '0')}-01`;

        try {
            await axios.post(`${API_URL}/obligations/${viewingHistoryId}/pay`, {
                payment_date: pDate.toISOString(),
                amount: parseFloat(formData.get('amount') || 0),
                billing_month: bMonthStr,
                note: formData.get('note') || "Manual History Log"
            });

            const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
            setSelectedHistory(hRes.data);
            fetchObligations();
            e.target.reset();
        } catch (err) { alert("Error adding record"); }
    };

    const handleDeleteHistory = async (historyId) => {
        if (!confirm("Are you sure you want to delete this payment record?")) return;
        try {
            await axios.delete(`${API_URL}/obligations/history/${historyId}`);

            if (viewingHistoryId) {
                const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
                setSelectedHistory(hRes.data);
            }
            fetchObligations();
        } catch (err) { alert("Error deleting history"); }
    };

    const openObligationModal = (obl = null) => {
        if (obl) {
            setEditingId(obl.id);
            setObligationForm({
                name: obl.name,
                amount: obl.amount,
                due_day: obl.due_day,
                category: obl.category
            });
        } else {
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
        }
        setShowObligationModal(true);
    };

    const openHistory = (oblId) => {
        setViewingHistoryId(oblId);
        setSelectedHistory(history[oblId] || []);
        setShowHistoryModal(true);
    };

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    const currentHistoryObligation = obligations.find(o => o.id === viewingHistoryId) || {};

    // UI Constants for Dropdowns
    const today = new Date();
    const currentYear = today.getFullYear();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Obligation Manager</h1>
                    <p className="text-gray-400">Track bills via Billing Cycles.</p>
                </div>
                <button
                    onClick={() => openObligationModal(null)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition"
                >
                    <span className="text-xl">+</span> Add New
                </button>
            </div>

            {/* Global Stats Summaries */}
            {(() => {
                const getStats = (items) => {
                    let prevPaid = 0;
                    let currentBudget = 0;
                    let currentPaid = 0;

                    items.forEach(obl => {
                        const prev = getMonthStatus(obl, -1);
                        const curr = getMonthStatus(obl, 0);
                        if (prev.amount) prevPaid += prev.amount;
                        if (curr.amount) currentBudget += curr.amount;
                        if (curr.isPaid && curr.amount) currentPaid += curr.amount;
                    });

                    return { prevPaid, currentBudget, currentPaid };
                };

                // Filter Logic
                const creditCards = obligations.filter(o => o.category === 'Credit Card');
                const loans = obligations.filter(o => ['Loan', 'Auto Loan'].includes(o.category));
                const subscriptions = obligations.filter(o => ['Subscription', 'Tech & Subscriptions'].includes(o.category));

                // Liabilities = Everything else (excluding Loans, Credit Cards, and Subscriptions)
                const liabilities = obligations.filter(o => !['Loan', 'Auto Loan', 'Credit Card', 'Subscription', 'Tech & Subscriptions'].includes(o.category));

                const globalStats = getStats(obligations);
                const liabilityStats = getStats(liabilities);
                const loanStats = getStats(loans);
                const creditCardStats = getStats(creditCards);
                const subscriptionStats = getStats(subscriptions);

                // Compact Summary Card Renderer
                const renderSummaryCard = (title, stats, accentColor, Icon) => {
                    const progress = stats.currentBudget > 0 ? (stats.currentPaid / stats.currentBudget) * 100 : 0;

                    return (
                        <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg relative overflow-hidden group hover:border-[${accentColor}]/50 transition flex flex-col justify-between h-32`}>
                            {/* subtle bg tint */}
                            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none opacity-10" style={{ backgroundColor: accentColor }}></div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-2">
                                    <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }}></span>
                                        {title}
                                    </h2>
                                    {Icon && <Icon size={14} className="text-gray-600" />}
                                </div>

                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl font-bold text-white">{formatCurrency(stats.currentPaid)}</span>
                                    <span className="text-gray-600 text-[10px]">/ {formatCurrency(stats.currentBudget)}</span>
                                </div>
                            </div>

                            <div className="relative z-10 mt-auto">
                                <div className="w-full bg-slate-700 h-1 rounded-full mb-2 overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, backgroundColor: accentColor }}></div>
                                </div>

                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-500">Prev: {formatCurrency(stats.prevPaid)}</span>
                                    <span style={{ color: accentColor }}>{progress.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                    );
                };

                return (
                    { renderSummaryCard("Total Overview", globalStats, "#3b82f6", Landmark)
            }
                        {renderSummaryCard("Liabilities", liabilityStats, "#f97316", Zap)}
            {renderSummaryCard("Loans", loanStats, "#a855f7", Car)}
            {renderSummaryCard("Credit Cards", creditCardStats, "#ec4899", CreditCard)}
            {renderSummaryCard("Subscriptions", subscriptionStats, "#06b6d4", Smartphone)}
        </div>
    );
})()}

{/* CATEGORY ICON MAPPING */ }
{
    (() => {
        const CATEGORY_ICONS = {
            "Salary": <Banknote size={20} className="text-emerald-400" />,
            "House": <Home size={20} className="text-blue-400" />,
            "Utilities": <Zap size={20} className="text-yellow-400" />,
            "Auto Loan": <Car size={20} className="text-red-400" />,
            "Food & Groceries": <Utensils size={20} className="text-orange-400" />,
            "Transport": <Car size={20} className="text-red-400" />,
            "Insurance": <Shield size={20} className="text-purple-400" />,
            "Subscription": <Smartphone size={20} className="text-cyan-400" />,
            "Tech & Subscriptions": <Smartphone size={20} className="text-cyan-400" />,
            "Loan": <Landmark size={20} className="text-rose-400" />,
            "Credit Card": <CreditCard size={20} className="text-pink-400" />,
            "Pay Later": <Clock size={20} className="text-amber-400" />,
            "Other": <Box size={20} className="text-gray-400" />
        };

        // Group Obligations
        const grouped = obligations.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});

        // Calculate Category Stats
        const getCategoryStats = (items) => {
            let prevPaid = 0;
            let currentBudget = 0;
            let currentPaid = 0;

            items.forEach(obl => {
                const prev = getMonthStatus(obl, -1);
                const curr = getMonthStatus(obl, 0);

                // Prev month paid tally (assuming we only care about what was actually paid?)
                // User said "sum of previouse month". Assuming total bill amount of previous month.
                if (prev.amount) prevPaid += prev.amount;

                // Current Budget = Expected bills
                if (curr.amount) currentBudget += curr.amount;

                // Paid so far
                if (curr.isPaid && curr.amount) currentPaid += curr.amount;
            });

            return { prevPaid, currentBudget, currentPaid };
        };

        return Object.entries(grouped).map(([category, items]) => {
            const stats = getCategoryStats(items);

            return (
                <div key={category} className="mb-8">
                    {/* Section Header */}
                    <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
                        <div className="flex items-center gap-2">
                            {CATEGORY_ICONS[category] || <Box size={20} className="text-gray-400" />}
                            <h2 className="text-xl font-bold text-slate-200">{category}</h2>
                            <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-700">{items.length}</span>
                        </div>

                        {/* Budget Badges */}
                        <div className="flex gap-4 text-xs">
                            <div className="flex flex-col items-end">
                                <span className="text-gray-500 uppercase font-semibold">Prev Total</span>
                                <span className="text-gray-300 font-mono">{formatCurrency(stats.prevPaid)}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-blue-400 uppercase font-semibold">Budget</span>
                                <span className="text-blue-200 font-mono">{formatCurrency(stats.currentBudget)}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-green-400 uppercase font-semibold">Paid</span>
                                <span className="text-green-200 font-mono">{formatCurrency(stats.currentPaid)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-4">
                        {items.map(obl => {
                            const monthMinus3 = getMonthStatus(obl, -3);
                            const monthMinus2 = getMonthStatus(obl, -2);
                            const prevMonth = getMonthStatus(obl, -1);
                            const currMonth = getMonthStatus(obl, 0);

                            return (
                                <div key={obl.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition group relative">
                                    {/* Compact Card Header */}
                                    <div className="bg-slate-900/40 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{obl.name}</h3>
                                            <span className="text-[10px] text-gray-500">Day: {obl.due_day}</span>
                                        </div>
                                        <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition">
                                            <button onClick={() => openHistory(obl.id)}><History size={14} className="text-gray-400 hover:text-white" /></button>
                                            <button onClick={() => openObligationModal(obl)}><EditIcon size={14} className="text-gray-400 hover:text-white" /></button>
                                        </div>
                                    </div>

                                    {/* Compact 4-Month Grid */}
                                    <div className="grid grid-cols-4 divide-x divide-slate-700 text-xs">
                                        {/* Helper Render Function */}
                                        {[monthMinus3, monthMinus2, prevMonth].map((m, idx) => (
                                            <div key={idx} className="p-2 flex flex-col items-center justify-center relative hover:bg-slate-700/30 transition group/cell">
                                                <span className="text-[9px] uppercase font-bold text-gray-600 mb-0.5">{m.shortLabel}</span>
                                                {m.isPaid ? (
                                                    <div className="text-center group-hover/cell:opacity-20 transition">
                                                        <CheckCircle size={14} className="text-green-500/50 mx-auto" />
                                                        <span className="font-mono text-gray-400">{formatCurrency(m.amount)}</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-center">
                                                        <span className="font-mono text-gray-500 block mb-1">{m.amount !== null ? formatCurrency(m.amount) : "-"}</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openPaymentModal(obl, m.billingDateStr, m.amount || obl.amount); }}
                                                            className="text-[9px] bg-blue-900/40 text-blue-300 px-1.5 rounded hover:bg-blue-800 transition"
                                                        >
                                                            Pay
                                                        </button>
                                                    </div>
                                                )}
                                                {/* History Edit Overlay for Paid Items */}
                                                {m.isPaid && (
                                                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/cell:opacity-100 bg-slate-800/90 transition z-10">
                                                        <button onClick={() => openPaymentModal(obl, m.billingDateStr, null, { id: m.paymentId, amount: m.amount, billing_month: m.billingDateStr })} className="p-1 hover:text-blue-400"><Pencil size={12} /></button>
                                                        <button onClick={() => handleDeleteHistory(m.paymentId)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {/* Current Month (Highlighted) */}
                                        <div className="p-2 flex flex-col items-center justify-center bg-slate-700/10 relative group/curr">
                                            <span className="text-[9px] uppercase font-bold text-blue-400 mb-0.5">{currMonth.shortLabel}</span>
                                            {currMonth.isPaid ? (
                                                <div className="text-center relative">
                                                    <CheckCircle size={16} className="text-green-400 mx-auto mb-0.5" />
                                                    <span className="font-bold font-mono text-white block">{formatCurrency(currMonth.amount)}</span>
                                                    <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/curr:opacity-100 bg-slate-800/90 transition z-10">
                                                        <button onClick={() => openPaymentModal(obl, currMonth.billingDateStr, null, { id: currMonth.paymentId, amount: currMonth.amount, billing_month: currMonth.billingDateStr })} className="p-1 hover:text-blue-400"><Pencil size={12} /></button>
                                                        <button onClick={() => handleDeleteHistory(currMonth.paymentId)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center w-full relative">
                                                    <div className="flex items-center justify-center gap-1 mb-1 relative">
                                                        <span className="font-bold font-mono text-white text-sm">{formatCurrency(currMonth.amount)}</span>
                                                        <button onClick={() => openObligationModal(obl)} className="text-gray-600 hover:text-white"><Pencil size={10} /></button>
                                                    </div>
                                                    <button
                                                        onClick={() => openPaymentModal(obl, currMonth.billingDateStr, currMonth.amount)}
                                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1 px-2 rounded flex items-center justify-center gap-1"
                                                    >
                                                        Pay
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        })()
    }
                </div >
            )
}

{/* --- PAYMENT MODAL --- */ }
{
    showPaymentModal && (
        <Modal title={`Pay Bill: ${paymentForm.name}`} onClose={() => setShowPaymentModal(false)}>
            <form onSubmit={submitPayment} className="space-y-4">
                <div className="bg-blue-900/20 p-3 rounded border border-blue-900/50 mb-4">
                    <p className="text-sm text-blue-200">Select which <strong>Month</strong> you are paying for.</p>
                </div>

                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">For Month</label>
                    <div className="grid grid-cols-2 gap-3">
                        <select
                            className={`${selectClass} text-sm w-full`}
                            value={parseInt(paymentForm.billing_month.split('-')[1]) - 1}
                            onChange={e => {
                                const parts = paymentForm.billing_month.split('-');
                                const newMonth = (parseInt(e.target.value) + 1).toString().padStart(2, '0');
                                setPaymentForm({ ...paymentForm, billing_month: `${parts[0]}-${newMonth}-01` });
                            }}
                        >
                            {months.map((m, idx) => (
                                <option key={idx} value={idx}>{m}</option>
                            ))}
                        </select>
                        <select
                            className={`${selectClass} text-sm w-full`}
                            value={parseInt(paymentForm.billing_month.split('-')[0])}
                            onChange={e => {
                                const parts = paymentForm.billing_month.split('-');
                                setPaymentForm({ ...paymentForm, billing_month: `${e.target.value}-${parts[1]}-01` });
                            }}
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Amount</label>
                    <input type="number" step="0.01" className={inputClass} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                    <p className="text-xs text-gray-500 mt-1">Optional. Leave empty for 0.</p>
                </div>

                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Note</label>
                    <input type="text" className={inputClass} value={paymentForm.note} onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
                </div>

                <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded font-bold shadow-lg mt-4">
                    Confirm Payment
                </button>
            </form>
        </Modal>
    )
}

{/* Obligation Modal (Edit/Add) */ }
{
    showObligationModal && (
        <Modal title={editingId ? "Edit Obligation" : "Add Obligation"} onClose={() => setShowObligationModal(false)}>
            <form onSubmit={handleSaveObligation} className="space-y-4">
                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Name</label>
                    <input type="text" placeholder="e.g. Rent" required className={inputClass} value={obligationForm.name} onChange={e => setObligationForm({ ...obligationForm, name: e.target.value })} />
                </div>
                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Amount</label>
                    <input type="number" placeholder="SAR" step="0.01" className={inputClass} value={obligationForm.amount} onChange={e => setObligationForm({ ...obligationForm, amount: e.target.value })} />
                </div>
                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Due Day</label>
                    <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="1-31"
                        required
                        className={inputClass}
                        value={obligationForm.due_day}
                        onChange={e => setObligationForm({ ...obligationForm, due_day: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">Day of the month (1-31) for this bill.</p>
                </div>
                <div>
                    <label className="text-gray-400 text-xs uppercase mb-1 block">Category</label>
                    <select className={selectClass} value={obligationForm.category} onChange={e => setObligationForm({ ...obligationForm, category: e.target.value })}>
                        <option value="">Select Category...</option>
                        <option value="Salary">Salary</option>
                        <option value="House">House</option>
                        <option value="Utilities">Utilities</option>
                        <option value="Food">Food & Groceries</option>
                        <option value="Transport">Transport</option>
                        <option value="Insurance">Insurance</option>
                        <option value="Tech">Tech & Subscriptions</option>
                        <option value="Subscription">Subscription</option>
                        <option value="Loan">Loan</option>
                        <option value="Auto Loan">Auto Loan</option>
                        <option value="Credit Card">Credit Card</option>
                        <option value="Pay Later">Pay Later</option>
                        <option value="Other">Other</option>


                    </select>
                </div>
                <div className="flex gap-2 mt-6">
                    <button type="submit" className="flex-1 bg-blue-600 text-white p-3 rounded hover:bg-blue-500 font-bold shadow-lg">{editingId ? "Save Changes" : "Create"}</button>
                    {editingId && <button type="button" onClick={handleDeleteObligation} className="bg-red-900/80 text-red-200 p-3 rounded hover:bg-red-800 font-bold"><Trash2 size={20} /></button>}
                </div>
            </form>
        </Modal>
    )
}

{/* History Modal */ }
{
    showHistoryModal && (
        <Modal title={`History: ${currentHistoryObligation.name}`} onClose={() => setShowHistoryModal(false)}>
            <div className="bg-slate-700/50 p-4 rounded-lg mb-6 border border-slate-600">
                <div className="flex items-center gap-2 mb-3 text-blue-300">
                    <Calendar size={16} />
                    <h4 className="text-sm font-bold uppercase tracking-wide">Log Payment Record</h4>
                </div>
                <form onSubmit={handleAddPastPayment} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className="text-[10px] uppercase text-gray-400 block mb-1">For Month</label>
                        <div className="grid grid-cols-2 gap-2">
                            <select name="billing_month_idx" className={`${selectClass} text-sm w-full`} defaultValue={today.getMonth()}>
                                {months.map((m, idx) => (
                                    <option key={idx} value={idx}>{m}</option>
                                ))}
                            </select>
                            <select name="billing_year" className={`${selectClass} text-sm w-full`} defaultValue={currentYear}>
                                {years.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-3">
                        <div><input type="number" name="amount" defaultValue={currentHistoryObligation.amount} placeholder="Amount" step="0.01" className={`${inputClass} text-sm`} /></div>
                        <div><input type="text" name="note" placeholder="Note (Optional)" className={`${inputClass} text-sm`} /></div>
                    </div>

                    <button type="submit" className="col-span-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold py-2 rounded uppercase tracking-wider transition">+ Add Record</button>
                </form>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {selectedHistory.map(h => (
                    <div key={h.id} className="bg-slate-800 p-3 rounded flex justify-between items-center border border-slate-700">
                        <div>
                            <p className="text-white font-medium text-sm">
                                {h.billing_month ? (() => {
                                    const [y, m] = h.billing_month.split('-').map(Number);
                                    const date = new Date(y, m - 1, 1);
                                    // Format: "December 2025" or similar
                                    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                })() : 'Auto Log'}
                            </p>
                        </div>
                        <div className="text-right flex flex-col items-end">
                            <div className="flex items-center gap-3">
                                <p className="text-green-400 font-bold text-sm">{formatCurrency(h.amount)}</p>
                                <button onClick={() => handleDeleteHistory(h.id)} className="text-slate-500 hover:text-red-400 transition" title="Delete Record">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {h.note && <p className="text-xs text-gray-500">{h.note}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    )
}
        </div >
    );
};

export default Obligations;
