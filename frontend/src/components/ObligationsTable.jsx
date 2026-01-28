import React, { useState, useEffect } from 'react';
import { formatCurrency, Modal } from './UI';
import { CheckCircle, Circle, Box, Home, Zap, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Utensils, Banknote, Edit2, Link } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

// --- Icons ---
const CATEGORY_ICONS = {
    "Salary": <Banknote size={16} className="text-emerald-400" />,
    "House": <Home size={16} className="text-blue-400" />,
    "Utilities": <Zap size={16} className="text-yellow-400" />,
    "Auto Loan": <Car size={16} className="text-red-400" />,
    "Food & Groceries": <Utensils size={16} className="text-orange-400" />,
    "Transport": <Car size={16} className="text-red-400" />,
    "Insurance": <Shield size={16} className="text-purple-400" />,
    "Subscription": <Smartphone size={16} className="text-cyan-400" />,
    "Tech & Subscriptions": <Smartphone size={16} className="text-cyan-400" />,
    "Loan": <Landmark size={16} className="text-rose-400" />,
    "Credit Card": <CreditCard size={16} className="text-pink-400" />,
    "Pay Later": <Clock size={16} className="text-amber-400" />,
    "Personal Expense": <Box size={16} className="text-slate-400" />,
    "Other": <Box size={16} className="text-gray-400" />
};

// Helper to get month name from offset
const getMonthName = (offset) => {
    const date = new Date();
    date.setMonth(date.getMonth() + offset);
    return date.toLocaleString('en-US', { month: 'short' });
};

// Month status cell component for read-only months (no month label - it's in header)
const MonthStatusCell = ({ status }) => {
    if (status.isPaid) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle size={10} className="text-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-300">{formatCurrency(status.amount)}</span>
            </div>
        );
    } else if (status.isBudget) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                <Circle size={10} className="text-amber-400" />
                <span className="text-[10px] font-mono text-amber-300">{formatCurrency(status.amount)}</span>
            </div>
        );
    }
    return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 opacity-40">
            <Circle size={10} className="text-slate-500" />
            <span className="text-[10px] text-slate-500">-</span>
        </div>
    );
};

const TableRow = ({ obl, getMonthStatus, monthOffset, monthNames, openPaymentModal, handleQuickPay, openObligationModal, match, onLinkPayment }) => {
    // Get status for all 3 months
    const month1 = getMonthStatus(obl, monthOffset - 2);
    const month2 = getMonthStatus(obl, monthOffset - 1);
    const currMonth = getMonthStatus(obl, monthOffset);

    // Determines initial input value
    const initialAmount = currMonth.amount !== null ? currMonth.amount :
        (month2.amount !== null ? month2.amount :
            (month1.amount !== null ? month1.amount : ""));
    const [payAmount, setPayAmount] = useState(initialAmount);
    const [isEditing, setIsEditing] = useState(false);

    React.useEffect(() => {
        const newVal = currMonth.amount !== null ? currMonth.amount :
            (month2.amount !== null ? month2.amount :
                (month1.amount !== null ? month1.amount : ""));
        setPayAmount(newVal);
    }, [currMonth.amount, month2.amount, month1.amount, monthOffset]);

    const handlePay = () => {
        let val = parseFloat(payAmount);
        if (isNaN(val)) {
            if (month2.amount !== null && month2.amount > 0) val = month2.amount;
        }
        openPaymentModal(obl, currMonth.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let val = parseFloat(payAmount);
            if (isNaN(val)) {
                if (month2.amount !== null && month2.amount > 0) val = month2.amount;
            }
            handleQuickPay(obl.id, val, currMonth.billingDateStr, "BUDGET");
        }
    };

    return (
        <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition group">
            {/* Column 1: Obligation Name + Due Date */}
            <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                    <div className="opacity-70">{CATEGORY_ICONS[obl.category] || <Box size={16} />}</div>
                    <div className="flex-1">
                        {obl.provider && <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider leading-none mb-0.5">{obl.provider}</div>}
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">{obl.name}</span>
                            <span className="bg-slate-700/50 text-slate-400 text-[9px] font-mono px-1.5 py-0.5 rounded">Day {obl.due_day}</span>
                        </div>
                    </div>
                </div>
            </td>

            {/* Column 2: Month -2 */}
            <td className="px-2 py-2.5 text-center">
                <MonthStatusCell status={month1} />
            </td>

            {/* Column 3: Month -1 */}
            <td className="px-2 py-2.5 text-center">
                <MonthStatusCell status={month2} />
            </td>

            {/* Column 4: Current Month - with budget input if unpaid */}
            <td className="px-2 py-2.5 text-center">
                {currMonth.isPaid ? (
                    <MonthStatusCell status={currMonth} />
                ) : (
                    <div className="flex flex-col items-center">
                        {isEditing ? (
                            <input
                                autoFocus
                                type="number"
                                className="bg-slate-900 border border-slate-600 rounded text-center text-white text-xs py-1 px-2 w-20 font-mono focus:border-blue-500 outline-none transition"
                                placeholder="0.00"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => setIsEditing(false)}
                            />
                        ) : (
                            <div
                                onClick={() => setIsEditing(true)}
                                className="bg-slate-900 border border-slate-700/50 hover:border-slate-500 rounded text-center text-white text-xs py-1 px-2 w-20 font-mono cursor-text transition"
                            >
                                {payAmount ? formatCurrency(payAmount) : <span className="text-slate-600 text-[10px]">Set</span>}
                            </div>
                        )}
                    </div>
                )}
            </td>

            {/* Column 5: Actions */}
            <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-2">
                    {/* Auto-Match Button */}
                    {!currMonth.isPaid && match && match.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onLinkPayment(obl, match); }}
                            className="flex items-center gap-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-1 rounded border border-blue-500/30 whitespace-nowrap hover:bg-blue-800 animate-pulse shadow-sm"
                            title={`Found matching transaction: ${match[0].merchant} (${formatCurrency(match[0].amount)})`}
                        >
                            <Link size={10} />
                            <span>Found {formatCurrency(match[0].amount)}</span>
                        </button>
                    )}

                    {/* Pay Button */}
                    {currMonth.isPaid ? (
                        <span className="text-[10px] font-bold text-green-400 uppercase">Paid</span>
                    ) : (
                        <button
                            onClick={handlePay}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1 px-2.5 rounded shadow-sm transition"
                        >
                            Pay
                        </button>
                    )}

                    {/* Edit Button */}
                    <button
                        onClick={() => openObligationModal(obl)}
                        className="bg-slate-700/50 hover:bg-blue-600 text-slate-400 hover:text-white p-1 rounded transition"
                        title="Edit"
                    >
                        <Edit2 size={12} />
                    </button>
                </div>
            </td>
        </tr >
    );
};

// Category Table Component
const CategoryTable = ({ category, obligations, monthNames, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay, openObligationModal, matches, onLinkPayment }) => {
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-lg mb-4">
            {/* Category Header */}
            <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {CATEGORY_ICONS[category] || <Box size={16} />}
                    <h3 className="text-white font-bold text-xs uppercase tracking-wider">{category}</h3>
                    <span className="ml-1 px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-full text-[10px]">{obligations.length}</span>
                </div>
            </div>

            {/* Table */}
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-slate-800/50 text-[9px] uppercase font-bold text-slate-500">
                    <tr>
                        <th className="px-4 py-2 w-[28%]">Obligation</th>
                        <th className="px-2 py-2 text-center w-[14%]">{monthNames[0]}</th>
                        <th className="px-2 py-2 text-center w-[14%]">{monthNames[1]}</th>
                        <th className="px-2 py-2 text-center w-[14%]">{monthNames[2]} (Now)</th>
                        <th className="px-3 py-2 text-right w-[30%]">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {obligations.map(obl => (
                        <TableRow
                            key={obl.id}
                            obl={obl}
                            getMonthStatus={getMonthStatus}
                            monthOffset={monthOffset}
                            monthNames={monthNames}
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
    );
};

const ObligationsTable = ({ obligations, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay, openObligationModal }) => {
    // Calculate month names
    const monthNames = [
        getMonthName(monthOffset - 2),
        getMonthName(monthOffset - 1),
        getMonthName(monthOffset)
    ];

    // Match state
    const [matches, setMatches] = useState({});
    const [rejectedMatches, setRejectedMatches] = useState(new Set());
    const [verifyMatch, setVerifyMatch] = useState(null);

    // Fetch matches for unpaid obligations
    useEffect(() => {
        const fetchMatches = async () => {
            const unpaidObligations = obligations.filter(o => {
                const status = getMonthStatus(o, monthOffset);
                return !status.isPaid;
            });

            const newMatches = {};
            await Promise.all(unpaidObligations.map(async (o) => {
                try {
                    const res = await axios.get(`${API_URL}/obligations/${o.id}/matches`);
                    if (res.data && res.data.length > 0) {
                        const validMatches = res.data.filter(tx => !rejectedMatches.has(tx.id));
                        if (validMatches.length > 0) {
                            newMatches[o.id] = validMatches;
                        }
                    }
                } catch (e) { console.error("Match fetch error", e); }
            }));
            setMatches(newMatches);
        };

        const timer = setTimeout(fetchMatches, 500);
        return () => clearTimeout(timer);
    }, [obligations, monthOffset, rejectedMatches]);

    const executeLinkPayment = async (obl, tx) => {
        try {
            const today = new Date();
            const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
            const billingDateStr = `${targetMonth.getFullYear()}-${(targetMonth.getMonth() + 1).toString().padStart(2, '0')}-01`;

            await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                payment_date: tx.timestamp,
                billing_month: billingDateStr,
                amount: tx.amount,
                note: `Linked to: ${tx.merchant}`,
                status: "PAID",
                transaction_id: tx.id
            });
            window.location.reload();
        } catch (e) { alert("Linking failed"); }
    };

    const handleLinkPayment = (obl, matchArray) => {
        if (!matchArray || matchArray.length === 0) return;
        setVerifyMatch({ obl, tx: matchArray[0], allMatches: matchArray });
    };

    const handleRejectMatch = () => {
        if (!verifyMatch) return;
        const rejectedTxId = verifyMatch.tx.id;
        const remainingMatches = verifyMatch.allMatches.slice(1);

        setRejectedMatches(prev => {
            const newSet = new Set(prev);
            newSet.add(rejectedTxId);
            return newSet;
        });

        setMatches(prev => {
            const updated = { ...prev };
            if (remainingMatches.length > 0) {
                updated[verifyMatch.obl.id] = remainingMatches;
            } else {
                delete updated[verifyMatch.obl.id];
            }
            return updated;
        });

        if (remainingMatches.length > 0) {
            setVerifyMatch({ ...verifyMatch, tx: remainingMatches[0], allMatches: remainingMatches });
        } else {
            setVerifyMatch(null);
        }
    };

    // Group by Category
    const grouped = obligations.reduce((acc, obl) => {
        const cat = obl.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(obl);
        return acc;
    }, {});

    const sortedCategories = Object.keys(grouped).sort();

    // Calculate monthly summary stats
    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() + monthOffset);
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let totalBudget = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    obligations.forEach(obl => {
        const prevStatus = getMonthStatus(obl, monthOffset - 1);
        const currStatus = getMonthStatus(obl, monthOffset);

        // Budget = expected expense for this month
        // Priority: current month BUDGET entry → previous month amount → 0
        let expectedAmount = 0;
        if (currStatus.status === 'BUDGET' && currStatus.amount) {
            expectedAmount = currStatus.amount;
        } else if (prevStatus.amount) {
            expectedAmount = prevStatus.amount;
        } else if (currStatus.isPaid && currStatus.amount) {
            // Only use paid amount as estimate if no other reference exists
            expectedAmount = currStatus.amount;
        }
        totalBudget += expectedAmount;

        // Paid = actual payments this month
        if (currStatus.isPaid && currStatus.amount) {
            totalPaid += currStatus.amount;
            paidCount++;
        } else {
            unpaidCount++;
        }
    });

    const progress = totalBudget > 0 ? (totalPaid / totalBudget) * 100 : 0;
    const remaining = totalBudget - totalPaid;
    const isOverBudget = totalPaid > totalBudget;

    return (
        <div className="animate-fade-in-up space-y-3">
            {/* Monthly Summary Bar */}
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Month Label */}
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600/20 text-blue-300 p-2 rounded-lg">
                            <Landmark size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">{monthLabel}</h3>
                            <p className="text-xs text-slate-400">{paidCount} paid · {unpaidCount} pending</p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <p className="text-[10px] text-slate-500 uppercase">Budget</p>
                            <p className="text-lg font-bold text-white font-mono">{formatCurrency(totalBudget)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] text-slate-500 uppercase">Paid</p>
                            <p className="text-lg font-bold text-emerald-400 font-mono">{formatCurrency(totalPaid)}</p>
                        </div>
                        <div className="text-center min-w-[80px]">
                            <p className="text-[10px] text-slate-500 uppercase">{isOverBudget ? 'Over' : 'Remaining'}</p>
                            <p className={`text-lg font-bold font-mono ${isOverBudget ? 'text-red-400' : 'text-amber-400'}`}>
                                {isOverBudget ? '+' : ''}{formatCurrency(Math.abs(remaining))}
                            </p>
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="flex items-center gap-3">
                        <div className="w-32">
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className={`font-bold ${isOverBudget ? 'text-red-400' : 'text-blue-400'}`}>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-900/50 h-2 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(progress, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Category Tables */}
            {sortedCategories.map(cat => (
                <CategoryTable
                    key={cat}
                    category={cat}
                    obligations={grouped[cat]}
                    monthNames={monthNames}
                    getMonthStatus={getMonthStatus}
                    monthOffset={monthOffset}
                    openPaymentModal={openPaymentModal}
                    handleQuickPay={handleQuickPay}
                    openObligationModal={openObligationModal}
                    matches={matches}
                    onLinkPayment={handleLinkPayment}
                />
            ))}

            {/* Verify Match Modal */}
            {verifyMatch && (
                <Modal isOpen={true} onClose={() => setVerifyMatch(null)} title="Link Transaction?">
                    <div className="space-y-4">
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <p className="text-slate-400 text-xs mb-2">Obligation</p>
                            <p className="text-white font-semibold">{verifyMatch.obl.name}</p>
                        </div>
                        <div className="bg-blue-900/30 border border-blue-500/30 p-4 rounded-lg">
                            <p className="text-blue-300 text-xs mb-2">Matched Transaction</p>
                            <p className="text-white font-semibold">{verifyMatch.tx.merchant}</p>
                            <p className="text-blue-200 font-mono text-lg">{formatCurrency(verifyMatch.tx.amount)}</p>
                            <p className="text-slate-400 text-xs mt-1">{new Date(verifyMatch.tx.timestamp).toLocaleDateString()}</p>
                        </div>
                        <p className="text-gray-300 text-sm">Link this transaction and mark as paid?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => executeLinkPayment(verifyMatch.obl, verifyMatch.tx)}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded font-bold text-sm"
                            >
                                Link & Pay
                            </button>
                            <button
                                onClick={handleRejectMatch}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded font-bold text-sm"
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

export default ObligationsTable;
