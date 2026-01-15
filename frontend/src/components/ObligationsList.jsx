import React from 'react';
import { CheckCircle, History, Pencil, Trash2, Banknote, Home, Zap, Utensils, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Box } from 'lucide-react';
import { formatCurrency, EditIcon } from '../components/UI';

const ObligationsList = ({
    obligations,
    getMonthStatus,
    openObligationModal,
    openPaymentModal,
    openHistory,
    handleDeleteHistory
}) => {

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

    const grouped = obligations.reduce((acc, obl) => {
        const cat = obl.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(obl);
        return acc;
    }, {});

    const getCategoryStats = (items) => {
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

    return (
        <div className="animate-fade-in-up">
            {Object.entries(grouped).map(([category, items]) => {
                const stats = getCategoryStats(items);

                return (
                    <div key={category} className="mb-8">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
                            <div className="flex items-center gap-2">
                                {CATEGORY_ICONS[category] || <Box size={20} className="text-gray-400" />}
                                <h2 className="text-xl font-bold text-slate-200">{category}</h2>
                                <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-700">{items.length}</span>
                            </div>

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

                                        <div className="grid grid-cols-4 divide-x divide-slate-700 text-xs">
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
                                                    {m.isPaid && (
                                                        <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/cell:opacity-100 bg-slate-800/90 transition z-10">
                                                            <button onClick={() => openPaymentModal(obl, m.billingDateStr, null, { id: m.paymentId, amount: m.amount, billing_month: m.billingDateStr })} className="p-1 hover:text-blue-400"><Pencil size={12} /></button>
                                                            <button onClick={() => handleDeleteHistory(m.paymentId)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

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
            })}
        </div>
    );
};

export default ObligationsList;
