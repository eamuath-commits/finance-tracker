import React from 'react';
import { Landmark, Zap, Car, CreditCard, Smartphone } from 'lucide-react';
import { formatCurrency } from '../components/UI';

const ObligationsOverview = ({ obligations, getMonthStatus, monthOffset = 0 }) => {

    const CATEGORY_COLORS = {
        "Salary": "#10b981", // Emerald
        "House": "#3b82f6", // Blue
        "Utilities": "#f59e0b", // Amber
        "Food & Groceries": "#f97316", // Orange
        "Transport": "#ef4444", // Red
        "Insurance": "#a855f7", // Purple
        "Subscription": "#06b6d4", // Cyan
        "Tech & Subscriptions": "#06b6d4",
        "Loan": "#e11d48", // Rose
        "Auto Loan": "#be123c",
        "Credit Card": "#ec4899", // Pink
        "Pay Later": "#8b5cf6", // Violet
        "Other": "#9ca3af" // Gray
    };

    const getStats = (items) => {
        let prevPaid = 0;
        let currentBudget = 0;
        let currentPaid = 0;
        let itemCount = 0;

        items.forEach(obl => {
            // Only count active obligations (optional: could filter out those with 0 amount?)
            // For now, we count all assigned to this category
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);

            if (prev.amount) {
                prevPaid += prev.amount;
                currentBudget += prev.amount;
            } else if (obl.amount) {
                // Fallback: if no prev month data, use default amount?
                // Or purely rely on prev month as budget?
                // User said "Budget = Sum of Previous Month". So if 0, then 0.
                // But initially might be mostly 0. Let's stick to strict prev month.
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
        return {
            title: category,
            stats: getStats(items),
            color: CATEGORY_COLORS[category] || CATEGORY_COLORS["Other"],
            Icon: null // Icons are handled inside render or we can map them if needed, but text title is enough with color
        };
    });

    const renderSummaryCard = (title, stats, accentColor, isTotal = false) => {
        // Safe division
        const progress = stats.currentBudget > 0 ? (stats.currentPaid / stats.currentBudget) * 100 : 0;
        const displayProgress = Math.min(progress, 100); // Cap visual bar at 100%

        return (
            <div key={title} className={`bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg relative overflow-hidden group hover:border-[${accentColor}]/50 transition flex flex-col justify-between h-32`}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none opacity-10" style={{ backgroundColor: accentColor }}></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }}></span>
                            {title}
                        </h2>
                        {isTotal && <Landmark size={14} className="text-gray-600" />}
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white">{formatCurrency(stats.currentPaid)}</span>
                        <span className="text-gray-600 text-[10px]">/ {formatCurrency(stats.currentBudget)}</span>
                    </div>
                </div>

                <div className="relative z-10 mt-auto">
                    <div className="w-full bg-slate-700 h-1 rounded-full mb-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${displayProgress}%`, backgroundColor: accentColor }}></div>
                    </div>

                    <div className="flex justify-end items-center text-[10px]">
                        {/* Show count for categories */}
                        {!isTotal && <span className="text-gray-500 mr-auto">{stats.itemCount} Items</span>}
                        <span style={{ color: accentColor }}>{progress.toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fade-in-up">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Always show Total First */}
                {renderSummaryCard("Total Overview", globalStats, "#3b82f6", true)}

                {/* Dynamically render all other categories */}
                {categoryCards.sort((a, b) => b.stats.currentBudget - a.stats.currentBudget).map(card =>
                    renderSummaryCard(card.title, card.stats, card.color)
                )}
            </div>
        </div>
    );
};

export default ObligationsOverview;
