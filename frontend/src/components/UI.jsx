import React from 'react';

export const formatCurrency = (value) => {
    return "\u20C1 " + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const Card = ({ title, value, subtext, color = "blue" }) => (
    <div className={`bg-slate-800 p-6 rounded-xl shadow-lg border-l-4 border-${color}-500`}>
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-2xl font-bold mt-2 text-white">{value}</p>
        {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
);

export const SectionHeader = ({ title, onAdd }) => (
    <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
        {onAdd && (
            <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition shadow-md">
                + Add New
            </button>
        )}
    </div>
);

export const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            {children}
        </div>
    </div>
);

export const EditIcon = ({ onClick }) => (
    <button onClick={onClick} className="text-gray-500 hover:text-blue-400 ml-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    </button>
);

// Input styling helper
export const inputClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500";
export const selectClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white focus:outline-none focus:border-blue-500";
