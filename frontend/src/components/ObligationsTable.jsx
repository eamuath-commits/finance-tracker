import React, { useState } from 'react';
import { formatCurrency } from './UI';
import { CheckCircle, Circle, AlertCircle, Box, Home, Zap, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Utensils, Banknote } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Icons (Copied for consistency) ---
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
    "Other": <Box size={16} className="text-gray-400" />
};

const TableRow = ({ obl, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay }) => {
    const prevMonth = getMonthStatus(obl, monthOffset - 1);
    const currMonth = getMonthStatus(obl, monthOffset);

    // Determines initial input value
    const initialAmount = currMonth.amount !== null ? currMonth.amount : (prevMonth.amount !== null ? prevMonth.amount : "");
    const [payAmount, setPayAmount] = useState(initialAmount);

    // Sync state on navigation
    React.useEffect(() => {
        const newVal = currMonth.amount !== null ? currMonth.amount : (prevMonth.amount !== null ? prevMonth.amount : "");
        setPayAmount(newVal);
    }, [currMonth.amount, prevMonth.amount, monthOffset]);

    const handlePay = () => {
        let val = parseFloat(payAmount);
        if (isNaN(val)) { // Smart Default Fallback
            if (prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
            // Removed obl.amount fallback
        }
        openPaymentModal(obl, currMonth.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            let val = parseFloat(payAmount);
            if (isNaN(val)) {
                if (prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
                // Removed obl.amount fallback
            }
            // Quick Pay as BUDGET
            handleQuickPay(obl.id, val, currMonth.billingDateStr, "BUDGET");
        }
    };

    return (
        <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition group">
            {/* Column 1: Info */}
            <td className="px-4 py-3 pl-8"> {/* Indented for hierarchy */}
                <div className="flex items-center gap-3">
                    <div className="opacity-70">{CATEGORY_ICONS[obl.category] || <Box size={16} />}</div>
                    <div>
                        <div className="font-semibold text-white text-sm">{obl.name}</div>
                        <div className="text-[10px] text-slate-500">Day {obl.due_day}</div>
                    </div>
                </div>
            </td>

            {/* Column 2: Previous Month Status */}
            <td className="px-4 py-3 text-center">
                {prevMonth.isPaid ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle size={12} className="text-emerald-400" />
                        <span className="text-xs font-mono text-emerald-300">{formatCurrency(prevMonth.amount)}</span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 opacity-50">
                        <Circle size={12} className="text-slate-500" />
                        <span className="text-xs text-slate-500">-</span>
                    </div>
                )}
            </td>

            {/* Column 3: Current Month Action */}
            <td className="px-4 py-3">
                {currMonth.isPaid ? (
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-xs font-bold text-white font-mono bg-green-600/20 border border-green-600/30 px-3 py-1 rounded">
                            {formatCurrency(currMonth.amount)}
                        </span>
                        <div className="text-[10px] text-green-400 uppercase font-bold tracking-wider">Paid</div>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-2">
                        <input
                            type="number"
                            className="bg-slate-900 border border-slate-600 rounded text-right text-white text-sm py-1 px-2 w-24 font-mono focus:border-blue-500 outline-none transition"
                            placeholder={initialAmount !== "" ? Number(initialAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            onClick={handlePay}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 px-3 rounded shadow-sm transition"
                        >
                            Pay
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
};

const ObligationsTable = ({ obligations, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay }) => {

    // Group by Category
    const grouped = obligations.reduce((acc, obl) => {
        const cat = obl.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(obl);
        return acc;
    }, {});

    // Sort categories (optional logic, plain alpha for now)
    const sortedCategories = Object.keys(grouped).sort();

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-xl animate-fade-in-up">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-800 text-xs uppercase font-bold text-slate-400">
                    <tr>
                        <th className="px-4 py-3 pl-8">Obligation Name</th>
                        <th className="px-4 py-3 text-center">Previous Month</th>
                        <th className="px-4 py-3 text-right pr-8">Current Month</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {sortedCategories.map(cat => (
                        <React.Fragment key={cat}>
                            {/* Category Header Row */}
                            <tr className="bg-slate-800/50">
                                <td colSpan="3" className="px-4 py-2 text-xs font-bold text-blue-300 uppercase tracking-wider border-y border-slate-700/50">
                                    {cat}
                                    <span className="ml-2 px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-full text-[10px]">{grouped[cat].length}</span>
                                </td>
                            </tr>
                            {/* Rows */}
                            {grouped[cat].map(obl => (
                                <TableRow
                                    key={obl.id}
                                    obl={obl}
                                    getMonthStatus={getMonthStatus}
                                    monthOffset={monthOffset}
                                    openPaymentModal={openPaymentModal}
                                    handleQuickPay={handleQuickPay}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ObligationsTable;
