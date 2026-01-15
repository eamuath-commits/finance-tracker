import React from 'react';
import { Landmark, Zap, Car, CreditCard, Smartphone, Banknote, Home, Utensils, Shield, Clock, Box, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../components/UI';

const ObligationsOverview = ({ obligations, getMonthStatus, monthOffset = 0 }) => {

    const CATEGORY_CONFIG = {
        "Salary": { color: "#10b981", icon: <Banknote size={18} /> },       // Emerald
        "House": { color: "#3b82f6", icon: <Home size={18} /> },           // Blue
        "Utilities": { color: "#f59e0b", icon: <Zap size={18} /> },        // Amber
        "Food & Groceries": { color: "#f97316", icon: <Utensils size={18} /> }, // Orange
        "Transport": { color: "#ef4444", icon: <Car size={18} /> },        // Red
        "Insurance": { color: "#a855f7", icon: <Shield size={18} /> },     // Purple
        "Subscription": { color: "#06b6d4", icon: <Smartphone size={18} /> }, // Cyan
        "Tech & Subscriptions": { color: "#06b6d4", icon: <Smartphone size={18} /> },
        "Loan": { color: "#e11d48", icon: <Landmark size={18} /> },        // Rose
        "Auto Loan": { color: "#be123c", icon: <Car size={18} /> },
        "Credit Card": { color: "#ec4899", icon: <CreditCard size={18} /> }, // Pink
        "Pay Later": { color: "#8b5cf6", icon: <Clock size={18} /> },      // Violet
        "Other": { color: "#9ca3af", icon: <Box size={18} /> }             // Gray
    };

    const getStats = (items) => {
        let prevPaid = 0;
        let currentBudget = 0;
        let currentPaid = 0;
        let itemCount = 0;

        items.forEach(obl => {
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);

            if (prev.amount) {
                prevPaid += prev.amount;
                currentBudget += prev.amount;
            }
            if (curr.isPaid && curr.amount) currentPaid += curr.amount;
            itemCount++;
        });

        return { prevPaid, currentBudget, currentPaid, itemCount };
    };

    // 1. Calculate Global Stats
    const globalStats = getStats(obligations);

    // 2. Group by Category
    const grouped = obligations.reduce((acc, obl) => {
        const cat = obl.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(obl);
        return acc;
    }, {});

    // 3. Generate Stats for each Category
    const categoryCards = Object.entries(grouped).map(([category, items]) => {
        const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG["Other"];
        return {
            title: category,
            stats: getStats(items),
            color: config.color,
            icon: config.icon
        };
    });

    const renderSummaryCard = (title, stats, color, icon, isTotal = false) => {
        const progress = stats.currentBudget > 0 ? (stats.currentPaid / stats.currentBudget) * 100 : 0;
        const displayProgress = Math.min(progress, 100);

        // Status determination
        const isOverBudget = stats.currentPaid > stats.currentBudget;
        const isCompleted = progress >= 100 && !isOverBudget;

        // Dynamic border color based on status
        const borderColor = isTotal
            ? 'border-blue-500/30'
            : (isOverBudget ? 'border-red-500/30' : (isCompleted ? 'border-green-500/30' : 'border-slate-700'));

        return (
            <div key={title} className={`bg-slate-800/80 backdrop-blur-sm border ${borderColor} rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 group relative overflow-hidden flex flex-col justify-between h-[140px]`}>

                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-[0.08]" style={{ backgroundColor: color }}></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg bg-slate-900/50 text-white/80 shadow-inner ring-1 ring-white/5`}>
                                {icon || <Box size={18} />}
                            </div>
                            <div>
                                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wide truncate max-w-[100px]">{title}</h2>
                                {!isTotal && <span className="text-[10px] text-slate-500 font-medium">{stats.itemCount} items</span>}
                            </div>
                        </div>
                        {isTotal && (
                            <div className="bg-blue-500/10 text-blue-400 p-1.5 rounded-lg">
                                <TrendingUp size={16} />
                            </div>
                        )}
                    </div>

                    <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl font-bold text-white tracking-tight">{formatCurrency(stats.currentPaid)}</span>
                        <span className="text-slate-500 text-[10px] font-medium uppercase">of {formatCurrency(stats.currentBudget)}</span>
                    </div>
                </div>

                <div className="relative z-10 mt-auto">
                    <div className="flex justify-between items-end mb-1.5 text-[10px]">
                        <span className={`${isOverBudget ? 'text-red-400' : (isCompleted ? 'text-emerald-400' : 'text-blue-400')} font-bold flex items-center gap-1`}>
                            {isOverBudget && <AlertCircle size={10} />}
                            {isCompleted && <CheckCircle size={10} />}
                            {progress.toFixed(0)}%
                        </span>
                        <span className="text-slate-500 flex gap-1">
                            {isOverBudget
                                ? <><span className="text-red-400">+</span>{formatCurrency(stats.currentPaid - stats.currentBudget)}</>
                                : <>{formatCurrency(stats.currentBudget - stats.currentPaid)} left</>
                            }
                        </span>
                    </div>
                    <div className="w-full bg-slate-900/50 h-1.5 rounded-full overflow-hidden ring-1 ring-white/5">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${isOverBudget ? 'bg-red-500' : ''}`}
                            style={{
                                width: `${displayProgress}%`,
                                backgroundColor: isOverBudget ? undefined : color
                            }}
                        ></div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fade-in-up">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                {/* Total Overview Card */}
                {renderSummaryCard(
                    "Total Spending",
                    globalStats,
                    "#3b82f6",
                    <Landmark size={18} className="text-blue-400" />,
                    true
                )}

                {/* Category Cards */}
                {categoryCards
                    .sort((a, b) => b.stats.currentBudget - a.stats.currentBudget)
                    .map(card => renderSummaryCard(card.title, card.stats, card.color, React.cloneElement(card.icon, { className: `text-[${card.color}]` })))
                }
            </div>
        </div>
    );
};

export default ObligationsOverview;
