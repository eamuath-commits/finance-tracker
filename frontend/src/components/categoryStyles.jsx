import React from 'react';
import {
    Box, Home, Zap, Car, Shield, Smartphone,
    Landmark, CreditCard, Clock, Utensils, Banknote,
    ChevronRight
} from 'lucide-react';

// --- Shared Category Icons ---
export const CATEGORY_ICONS = {
    "Salary": <Banknote size={16} className="text-emerald-400" />,
    "House": <Home size={16} className="text-blue-400" />,
    "Utilities": <Zap size={16} className="text-yellow-400" />,
    "Auto Loan": <Car size={16} className="text-red-400" />,
    "Food & Groceries": <Utensils size={16} className="text-orange-400" />,
    "Telecom": <Smartphone size={16} className="text-cyan-400" />,
    "Insurance": <Shield size={16} className="text-purple-400" />,
    "Subscription": <Clock size={16} className="text-pink-400" />,
    "Loan": <Landmark size={16} className="text-rose-400" />,
    "Credit Card": <CreditCard size={16} className="text-pink-400" />,
    "Pay Later": <Clock size={16} className="text-amber-400" />,
    "Personal Expense": <Box size={16} className="text-slate-400" />,
    "School": <Landmark size={16} className="text-indigo-400" />,
    "Other": <Box size={16} className="text-gray-400" />
};

// --- Shared Category Border Colors ---
export const CATEGORY_COLORS = {
    "Salary": "border-emerald-500/40",
    "House": "border-blue-500/40",
    "Utilities": "border-yellow-500/40",
    "Auto Loan": "border-red-500/40",
    "Food & Groceries": "border-orange-500/40",
    "Telecom": "border-cyan-500/40",
    "Insurance": "border-purple-500/40",
    "Subscription": "border-pink-500/40",
    "Loan": "border-rose-500/40",
    "Credit Card": "border-pink-500/40",
    "Pay Later": "border-amber-500/40",
    "Personal Expense": "border-slate-500/40",
    "School": "border-indigo-500/40",
    "Other": "border-gray-500/40"
};

// --- Shared Category BG accent colors (subtle) ---
export const CATEGORY_BG_COLORS = {
    "Salary": "from-emerald-900/10",
    "House": "from-blue-900/10",
    "Utilities": "from-yellow-900/10",
    "Auto Loan": "from-red-900/10",
    "Food & Groceries": "from-orange-900/10",
    "Telecom": "from-cyan-900/10",
    "Insurance": "from-purple-900/10",
    "Subscription": "from-pink-900/10",
    "Loan": "from-rose-900/10",
    "Credit Card": "from-pink-900/10",
    "Pay Later": "from-amber-900/10",
    "Personal Expense": "from-slate-800/10",
    "School": "from-indigo-900/10",
    "Other": "from-gray-900/10"
};

// --- Reusable Category Header (collapsible) ---
export const CategoryHeader = ({ category, count, isCollapsed, onToggle, rightContent }) => {
    const borderColor = CATEGORY_COLORS[category] || "border-gray-500/40";
    const icon = CATEGORY_ICONS[category] || <Box size={16} className="text-gray-400" />;

    return (
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800/80 transition-colors"
        >
            <div className="flex items-center gap-2.5">
                <div
                    className="transition-transform duration-200"
                    style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                >
                    <ChevronRight size={12} className="text-slate-500" />
                </div>
                {icon}
                <h3 className="text-white font-semibold text-[11px] uppercase tracking-wider">{category}</h3>
                <span className="px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded-full text-[9px] font-mono">
                    {count}
                </span>
            </div>
            {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
        </button>
    );
};

// --- Reusable Category Section Wrapper ---
export const CategorySectionWrapper = ({ category, children, className = '' }) => {
    const borderColor = CATEGORY_COLORS[category] || "border-gray-500/40";

    return (
        <div className={`bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg border-l-2 ${borderColor} transition-all duration-300 ${className}`}>
            {children}
        </div>
    );
};
