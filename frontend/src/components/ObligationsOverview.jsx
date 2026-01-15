import React from 'react';
import { Landmark, Zap, Car, CreditCard, Smartphone } from 'lucide-react';
import { formatCurrency } from '../components/UI';

const ObligationsOverview = ({ obligations, getMonthStatus }) => {

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
    const liabilities = obligations.filter(o => !['Loan', 'Auto Loan', 'Credit Card', 'Subscription', 'Tech & Subscriptions'].includes(o.category));

    const globalStats = getStats(obligations);
    const liabilityStats = getStats(liabilities);
    const loanStats = getStats(loans);
    const creditCardStats = getStats(creditCards);
    const subscriptionStats = getStats(subscriptions);

    const renderSummaryCard = (title, stats, accentColor, Icon) => {
        const progress = stats.currentBudget > 0 ? (stats.currentPaid / stats.currentBudget) * 100 : 0;

        return (
            <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg relative overflow-hidden group hover:border-[${accentColor}]/50 transition flex flex-col justify-between h-32`}>
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
        <div className="animate-fade-in-up">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {renderSummaryCard("Total Overview", globalStats, "#3b82f6", Landmark)}
                {renderSummaryCard("Liabilities", liabilityStats, "#f97316", Zap)}
                {renderSummaryCard("Loans", loanStats, "#a855f7", Car)}
                {renderSummaryCard("Credit Cards", creditCardStats, "#ec4899", CreditCard)}
                {renderSummaryCard("Subscriptions", subscriptionStats, "#06b6d4", Smartphone)}
            </div>
        </div>
    );
};

export default ObligationsOverview;
