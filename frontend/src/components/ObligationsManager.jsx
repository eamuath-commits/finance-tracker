import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, Modal } from './UI';
import {
    CheckCircle, Circle, Box, Home, Zap, Car, Shield, Smartphone,
    Landmark, CreditCard, Clock, Utensils, Banknote, Edit2, Link,
    ChevronDown, ChevronRight, Plus, Search, Download, TrendingUp,
    AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { exportToCSV } from '../utils/csvExport';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

// --- Category Icons ---
const CATEGORY_ICONS = {
    "Salary": <Banknote size={16} className="text-emerald-400" />,
    "House": <Home size={16} className="text-blue-400" />,
    "Utilities": <Zap size={16} className="text-yellow-400" />,
    "Auto Loan": <Car size={16} className="text-red-400" />,
    "Food & Groceries": <Utensils size={16} className="text-orange-400" />,
    "Transport": <Car size={16} className="text-red-400" />,
    "Insurance": <Shield size={16} className="text-purple-400" />,
    "Subscription": <Smartphone size={16} className="text-cyan-400" />,
    "Subscriptions": <Smartphone size={16} className="text-cyan-400" />,
    "Tech & Subscriptions": <Smartphone size={16} className="text-cyan-400" />,
    "Loan": <Landmark size={16} className="text-rose-400" />,
    "Credit Card": <CreditCard size={16} className="text-pink-400" />,
    "Pay Later": <Clock size={16} className="text-amber-400" />,
    "Personal Expense": <Box size={16} className="text-slate-400" />,
    "School": <Landmark size={16} className="text-indigo-400" />,
    "Other": <Box size={16} className="text-gray-400" />
};

const CATEGORY_COLORS = {
    "Salary": "border-emerald-500/40",
    "House": "border-blue-500/40",
    "Utilities": "border-yellow-500/40",
    "Auto Loan": "border-red-500/40",
    "Food & Groceries": "border-orange-500/40",
    "Insurance": "border-purple-500/40",
    "Subscription": "border-cyan-500/40",
    "Subscriptions": "border-cyan-500/40",
    "Loan": "border-rose-500/40",
    "Credit Card": "border-pink-500/40",
    "Pay Later": "border-amber-500/40",
    "Personal Expense": "border-slate-500/40",
    "School": "border-indigo-500/40",
    "Other": "border-gray-500/40"
};

// --- Month Name Helper ---
const getMonthName = (offset) => {
    const date = new Date();
    date.setMonth(date.getMonth() + offset);
    return date.toLocaleString('en-US', { month: 'short' });
};

// --- Status Badge ---
const StatusBadge = ({ status }) => {
    if (status.isPaid) {
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
                <CheckCircle size={12} className="text-emerald-400" />
                <span className="text-xs font-mono font-medium text-emerald-300">{formatCurrency(status.amount)}</span>
            </div>
        );
    }
    if (status.status === 'BUDGET' && status.amount) {
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                <Circle size={12} className="text-amber-400" />
                <span className="text-xs font-mono text-amber-300">{formatCurrency(status.amount)}</span>
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1 px-2 py-1 opacity-30">
            <Circle size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">—</span>
        </div>
    );
};

// --- Obligation Row ---
const ObligationRow = ({ obl, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay, openObligationModal, match, onLinkPayment }) => {
    const prevMonth = getMonthStatus(obl, monthOffset - 1);
    const currMonth = getMonthStatus(obl, monthOffset);

    const initialAmount = currMonth.amount !== null ? currMonth.amount :
        (prevMonth.amount !== null ? prevMonth.amount : "");
    const [payAmount, setPayAmount] = useState(initialAmount);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        const newVal = currMonth.amount !== null ? currMonth.amount :
            (prevMonth.amount !== null ? prevMonth.amount : "");
        setPayAmount(newVal);
    }, [currMonth.amount, prevMonth.amount, monthOffset]);

    const handlePay = () => {
        let val = parseFloat(payAmount);
        if (isNaN(val) && prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
        openPaymentModal(obl, currMonth.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let val = parseFloat(payAmount);
            if (isNaN(val) && prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
            handleQuickPay(obl.id, val, currMonth.billingDateStr, "BUDGET");
        }
    };

    const isOverdue = !currMonth.isPaid && !currMonth.status && obl.due_day && obl.due_day < new Date().getDate() && monthOffset === 0;

    return (
        <tr className={`border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors group ${isOverdue ? 'bg-red-950/10' : ''}`}>
            {/* Name */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            {obl.provider && (
                                <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">{obl.provider}</span>
                            )}
                            {obl.provider && <span className="text-slate-600 text-[9px]">·</span>}
                            <span className="font-medium text-white text-sm truncate">{obl.name}</span>
                            {isOverdue && (
                                <span className="flex items-center gap-0.5 text-[8px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full border border-red-500/20 uppercase">
                                    <AlertTriangle size={8} /> Overdue
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>

            {/* Due Day */}
            <td className="px-3 py-3 text-center">
                <span className="text-xs font-mono text-slate-400">{obl.due_day}</span>
            </td>

            {/* Previous Month */}
            <td className="px-2 py-3 text-center">
                <StatusBadge status={prevMonth} />
            </td>

            {/* Current Month */}
            <td className="px-2 py-3 text-center">
                {currMonth.isPaid ? (
                    <StatusBadge status={currMonth} />
                ) : (
                    <div className="flex flex-col items-center">
                        {isEditing ? (
                            <input
                                autoFocus
                                type="number"
                                className="bg-slate-900 border border-blue-500/50 rounded-lg text-center text-white text-xs py-1.5 px-2 w-24 font-mono focus:border-blue-400 outline-none transition shadow-lg shadow-blue-500/10"
                                placeholder="0.00"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => setIsEditing(false)}
                            />
                        ) : (
                            <div
                                onClick={() => setIsEditing(true)}
                                className="bg-slate-800/80 border border-slate-700/50 hover:border-slate-500 rounded-lg text-center text-white text-xs py-1.5 px-2 w-24 font-mono cursor-text transition"
                            >
                                {payAmount ? formatCurrency(payAmount) : <span className="text-slate-600 text-[10px]">Set amount</span>}
                            </div>
                        )}
                    </div>
                )}
            </td>

            {/* Actions */}
            <td className="px-3 py-3">
                <div className="flex items-center justify-end gap-2">
                    {/* Auto-Match */}
                    {!currMonth.isPaid && match && match.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onLinkPayment(obl, match); }}
                            className="flex items-center gap-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-1.5 rounded-lg border border-blue-500/30 whitespace-nowrap hover:bg-blue-800 animate-pulse shadow-sm transition"
                            title={`Found matching transaction: ${match[0].merchant} (${formatCurrency(match[0].amount)})`}
                        >
                            <Link size={10} />
                            <span>{formatCurrency(match[0].amount)}</span>
                        </button>
                    )}

                    {/* Pay/Paid */}
                    {currMonth.isPaid ? (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg uppercase">Paid</span>
                    ) : (
                        <button
                            onClick={handlePay}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition hover:shadow-blue-500/20"
                        >
                            Pay
                        </button>
                    )}

                    {/* Edit */}
                    <button
                        onClick={() => openObligationModal(obl)}
                        className="opacity-0 group-hover:opacity-100 bg-slate-700/50 hover:bg-blue-600 text-slate-400 hover:text-white p-1.5 rounded-lg transition"
                        title="Edit"
                    >
                        <Edit2 size={12} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

// --- Category Section (Collapsible) ---
const CategorySection = ({ category, obligations, getMonthStatus, monthOffset, monthNames, openPaymentModal, handleQuickPay, openObligationModal, matches, onLinkPayment }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Category stats
    const catStats = useMemo(() => {
        let budget = 0, paid = 0, paidCount = 0;
        obligations.forEach(obl => {
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);
            if (curr.status === 'BUDGET' && curr.amount) budget += curr.amount;
            else if (prev.amount) budget += prev.amount;
            else if (curr.isPaid && curr.amount) budget += curr.amount;
            if (curr.isPaid && curr.amount) { paid += curr.amount; paidCount++; }
        });
        return { budget, paid, paidCount, total: obligations.length };
    }, [obligations, getMonthStatus, monthOffset]);

    const borderColor = CATEGORY_COLORS[category] || "border-gray-500/40";

    return (
        <div className={`bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg border-l-2 ${borderColor} transition-all duration-300`}>
            {/* Category Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                        <ChevronRight size={14} className="text-slate-500" />
                    </div>
                    {CATEGORY_ICONS[category] || <Box size={16} />}
                    <h3 className="text-white font-bold text-xs uppercase tracking-wider">{category}</h3>
                    <span className="px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded-full text-[10px] font-mono">{obligations.length}</span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                    {catStats.paidCount > 0 && (
                        <span className="text-emerald-400 font-mono">{catStats.paidCount}/{catStats.total} paid</span>
                    )}
                    {catStats.budget > 0 && (
                        <span className="text-slate-400 font-mono">{formatCurrency(catStats.budget)}</span>
                    )}
                </div>
            </button>

            {/* Table */}
            {!isCollapsed && (
                <div className="animate-fade-in">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-slate-800/30">
                            <tr className="text-[9px] uppercase font-bold text-slate-500">
                                <th className="px-4 py-2 w-[30%]">Name</th>
                                <th className="px-3 py-2 text-center w-[8%]">Day</th>
                                <th className="px-2 py-2 text-center w-[18%]">{monthNames[0]}</th>
                                <th className="px-2 py-2 text-center w-[18%]">{monthNames[1]} <span className="text-blue-400">(now)</span></th>
                                <th className="px-3 py-2 text-right w-[26%]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {obligations.map(obl => (
                                <ObligationRow
                                    key={obl.id}
                                    obl={obl}
                                    getMonthStatus={getMonthStatus}
                                    monthOffset={monthOffset}
                                    openPaymentModal={openPaymentModal}
                                    handleQuickPay={handleQuickPay}
                                    openObligationModal={openObligationModal}
                                    match={matches[obl.id]}
                                    onLinkPayment={onLinkPayment}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// --- Progress Ring SVG ---
const ProgressRing = ({ percent, size = 48, strokeWidth = 4 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
    const isOver = percent > 100;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={strokeWidth} />
            <circle
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={isOver ? '#ef4444' : percent >= 100 ? '#10b981' : '#3b82f6'}
                strokeWidth={strokeWidth} strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset}
                className="transition-all duration-700 ease-out"
            />
            <text
                x={size / 2} y={size / 2}
                textAnchor="middle" dominantBaseline="central"
                className="fill-current text-white font-bold"
                fontSize={size * 0.22}
                transform={`rotate(90 ${size / 2} ${size / 2})`}
            >
                {Math.round(percent)}%
            </text>
        </svg>
    );
};


// --- Main Component ---
const ObligationsManager = ({ obligations, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay, openObligationModal }) => {
    const monthNames = [getMonthName(monthOffset - 1), getMonthName(monthOffset)];

    // Search
    const [searchTerm, setSearchTerm] = useState('');

    // Match state
    const [matches, setMatches] = useState({});
    const [rejectedMatches, setRejectedMatches] = useState(new Set());
    const [verifyMatch, setVerifyMatch] = useState(null);

    // Filter by search
    const filteredObligations = useMemo(() => {
        if (!searchTerm) return obligations;
        const q = searchTerm.toLowerCase();
        return obligations.filter(o =>
            o.name.toLowerCase().includes(q) ||
            (o.provider && o.provider.toLowerCase().includes(q)) ||
            (o.category && o.category.toLowerCase().includes(q))
        );
    }, [obligations, searchTerm]);

    // Monthly status from new API
    const [monthlyStatus, setMonthlyStatus] = useState(null);
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await axios.get(`${API_URL}/obligations/monthly-status?month_offset=${monthOffset}`);
                setMonthlyStatus(res.data);
            } catch (e) { console.error('Failed to fetch monthly status', e); }
        };
        fetchStatus();
    }, [obligations, monthOffset]);

    // Fetch matches using bulk endpoint
    useEffect(() => {
        const fetchMatches = async () => {
            try {
                const res = await axios.get(`${API_URL}/obligations/all-matches`);
                if (res.data) {
                    // Filter out rejected matches
                    const filtered = {};
                    for (const [oblId, txMatches] of Object.entries(res.data)) {
                        const valid = txMatches.filter(tx => !rejectedMatches.has(tx.transaction_id));
                        if (valid.length > 0) filtered[oblId] = valid;
                    }
                    setMatches(filtered);
                }
            } catch (e) { console.error('Failed to fetch matches', e); }
        };
        const timer = setTimeout(fetchMatches, 500);
        return () => clearTimeout(timer);
    }, [obligations, monthOffset, rejectedMatches]);

    const executeLinkPayment = async (obl, tx) => {
        try {
            const today = new Date();
            const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
            const billingDateStr = `${targetMonth.getFullYear()}-${(targetMonth.getMonth() + 1).toString().padStart(2, '0')}-01`;
            const txId = tx.transaction_id || tx.id;
            const txDate = tx.date || tx.timestamp;
            await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                payment_date: txDate, billing_month: billingDateStr,
                amount: tx.amount, note: `Linked to: ${tx.merchant}`,
                status: "PAID", transaction_id: txId
            });
            window.location.reload();
        } catch (e) { alert("Linking failed: " + (e.response?.data?.detail || e.message)); }
    };

    const handleLinkPayment = (obl, matchArray) => {
        if (!matchArray || matchArray.length === 0) return;
        setVerifyMatch({ obl, tx: matchArray[0], allMatches: matchArray });
    };

    const handleRejectMatch = () => {
        if (!verifyMatch) return;
        const rejectedTxId = verifyMatch.tx.transaction_id || verifyMatch.tx.id;
        const remaining = verifyMatch.allMatches.slice(1);
        setRejectedMatches(prev => { const s = new Set(prev); s.add(rejectedTxId); return s; });
        setMatches(prev => {
            const updated = { ...prev };
            if (remaining.length > 0) updated[verifyMatch.obl.id] = remaining;
            else delete updated[verifyMatch.obl.id];
            return updated;
        });
        if (remaining.length > 0) setVerifyMatch({ ...verifyMatch, tx: remaining[0], allMatches: remaining });
        else setVerifyMatch(null);
    };

    // Group by Category
    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    const sortedCategories = Object.keys(grouped).sort();

    // Summary Stats
    const stats = useMemo(() => {
        let totalBudget = 0, totalPaid = 0, paidCount = 0, unpaidCount = 0;
        obligations.forEach(obl => {
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);
            let expected = 0;
            if (curr.status === 'BUDGET' && curr.amount) expected = curr.amount;
            else if (prev.amount) expected = prev.amount;
            else if (curr.isPaid && curr.amount) expected = curr.amount;
            totalBudget += expected;
            if (curr.isPaid && curr.amount) { totalPaid += curr.amount; paidCount++; }
            else unpaidCount++;
        });
        const progress = totalBudget > 0 ? (totalPaid / totalBudget) * 100 : 0;
        return { totalBudget, totalPaid, remaining: totalBudget - totalPaid, paidCount, unpaidCount, progress, isOver: totalPaid > totalBudget };
    }, [obligations, getMonthStatus, monthOffset]);

    // Month label
    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() + monthOffset);
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Export
    const handleExport = () => {
        const rows = obligations.map(obl => {
            const curr = getMonthStatus(obl, monthOffset);
            return {
                Category: obl.category || 'Other',
                Provider: obl.provider || '',
                Name: obl.name,
                'Due Day': obl.due_day,
                Amount: curr.amount || '',
                Status: curr.isPaid ? 'PAID' : (curr.status || 'PENDING')
            };
        });
        exportToCSV(rows, `obligations_${monthLabel.replace(' ', '_')}.csv`);
    };

    const matchCount = Object.keys(matches).length;
    const overdueObls = monthlyStatus?.obligations?.filter(o => o.is_overdue) || [];

    return (
        <div className="animate-fade-in space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Budget */}
                <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Budget</p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(stats.totalBudget)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{obligations.length} obligations</p>
                </div>

                {/* Paid */}
                <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900/90 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-emerald-500 uppercase tracking-wider font-semibold mb-1">Paid</p>
                    <p className="text-2xl font-bold text-emerald-400 font-mono">{formatCurrency(stats.totalPaid)}</p>
                    <p className="text-[10px] text-emerald-500/60 mt-1">{stats.paidCount} of {obligations.length} paid</p>
                </div>

                {/* Remaining */}
                <div className={`bg-gradient-to-br ${stats.isOver ? 'from-red-900/20' : 'from-amber-900/20'} to-slate-900/90 backdrop-blur-sm border ${stats.isOver ? 'border-red-500/20' : 'border-amber-500/20'} rounded-xl p-4 shadow-lg`}>
                    <p className={`text-[10px] ${stats.isOver ? 'text-red-500' : 'text-amber-500'} uppercase tracking-wider font-semibold mb-1`}>
                        {stats.isOver ? 'Over Budget' : 'Remaining'}
                    </p>
                    <p className={`text-2xl font-bold font-mono ${stats.isOver ? 'text-red-400' : 'text-amber-400'}`}>
                        {stats.isOver ? '+' : ''}{formatCurrency(Math.abs(stats.remaining))}
                    </p>
                    <p className={`text-[10px] ${stats.isOver ? 'text-red-500/60' : 'text-amber-500/60'} mt-1`}>{stats.unpaidCount} pending</p>
                </div>

                {/* Progress */}
                <div className="bg-gradient-to-br from-blue-900/20 to-slate-900/90 backdrop-blur-sm border border-blue-500/20 rounded-xl p-4 shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-blue-500 uppercase tracking-wider font-semibold mb-1">Progress</p>
                        <p className="text-sm text-white font-medium">{monthLabel}</p>
                        {matchCount > 0 && (
                            <p className="text-[10px] text-blue-400 mt-1 animate-pulse">🔗 {matchCount} match{matchCount > 1 ? 'es' : ''} found</p>
                        )}
                    </div>
                    <ProgressRing percent={stats.progress} size={56} strokeWidth={4} />
                </div>
            </div>

            {/* Overdue Alert Banner */}
            {overdueObls.length > 0 && (
                <div className="bg-gradient-to-r from-red-900/30 to-red-950/20 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
                    <div className="bg-red-500/20 p-2 rounded-lg">
                        <AlertTriangle size={18} className="text-red-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-red-300 text-sm font-semibold">
                            {overdueObls.length} overdue obligation{overdueObls.length > 1 ? 's' : ''}
                        </p>
                        <p className="text-red-400/70 text-xs">
                            {overdueObls.map(o => o.name).join(', ')}
                        </p>
                    </div>
                    <div className="text-red-300 font-mono text-sm font-bold">
                        {formatCurrency(overdueObls.reduce((sum, o) => sum + (o.expected_amount || 0), 0))}
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => openObligationModal(null)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-sm transition hover:shadow-blue-500/20"
                    >
                        <Plus size={14} /> Add Obligation
                    </button>
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
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Category Sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => (
                    <CategorySection
                        key={cat}
                        category={cat}
                        obligations={grouped[cat]}
                        getMonthStatus={getMonthStatus}
                        monthOffset={monthOffset}
                        monthNames={monthNames}
                        openPaymentModal={openPaymentModal}
                        handleQuickPay={handleQuickPay}
                        openObligationModal={openObligationModal}
                        matches={matches}
                        onLinkPayment={handleLinkPayment}
                    />
                ))}

                {sortedCategories.length === 0 && (
                    <div className="text-center py-16 text-slate-500">
                        <Box size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No obligations found</p>
                        {searchTerm && <p className="text-xs mt-1">Try a different search term</p>}
                    </div>
                )}
            </div>

            {/* Verify Match Modal */}
            {verifyMatch && (
                <Modal isOpen={true} onClose={() => setVerifyMatch(null)} title="Link Transaction?">
                    <div className="space-y-4">
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-slate-400 text-xs mb-1">Obligation</p>
                            <p className="text-white font-semibold">{verifyMatch.obl.name}</p>
                            {verifyMatch.obl.provider && <p className="text-slate-500 text-xs">{verifyMatch.obl.provider}</p>}
                        </div>
                        <div className="bg-blue-900/30 border border-blue-500/30 p-4 rounded-lg">
                            <p className="text-blue-300 text-xs mb-1">Matched Transaction</p>
                            <p className="text-white font-semibold">{verifyMatch.tx.merchant}</p>
                            <p className="text-blue-200 font-mono text-xl mt-1">{formatCurrency(verifyMatch.tx.amount)}</p>
                            <p className="text-slate-400 text-xs mt-1">{new Date(verifyMatch.tx.date || verifyMatch.tx.timestamp).toLocaleDateString()}</p>
                        </div>
                        <p className="text-gray-300 text-sm">Link this transaction and mark as paid?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => executeLinkPayment(verifyMatch.obl, verifyMatch.tx)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-4 rounded-lg font-bold text-sm transition"
                            >
                                Link & Pay
                            </button>
                            <button
                                onClick={handleRejectMatch}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 px-4 rounded-lg font-bold text-sm transition"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ObligationsManager;
