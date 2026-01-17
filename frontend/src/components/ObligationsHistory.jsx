import React, { useState, useMemo } from 'react';
import { formatCurrency, selectClass } from '../components/UI';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

const ObligationsHistory = ({ obligations, history, onEdit, onDelete }) => {
    // ... (lines 6-160 are fine, just adding functionality)

    const handleExport = () => {
        const exportData = sorted.map(item => ({
            "Payment ID": item.id,
            "Obligation": item.oblName,
            "Category": item.oblCategory,
            "Billing Month": item.billing_month,
            "Year": item.year,
            "Month Label": item.month,
            "Amount": item.amount,
            "Status": item.status,
            "Paid Date": item.payment_date,
            "Note": item.note
        }));

        const filename = `history_export_${selectedYear}_${selectedStatus}.csv`;
        exportToCSV(exportData, filename);
    };

    return (
        <div className="animate-fade-in-up space-y-4">
            {/* Top Stats & Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Summary Card */}
                <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 border border-blue-800/30 p-4 rounded-xl flex flex-col justify-center relative">
                    <p className="text-blue-300 text-xs uppercase font-bold tracking-wider mb-1">{totalLabel}</p>
                    <p className="text-2xl font-mono font-bold text-white">{formatCurrency(totalDisplay)}</p>
                    <div className="text-xs text-slate-500 mt-1">{totalSubtext}</div>
                </div>

                {/* Filters Area */}
                <div className="md:col-span-3 bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                            <Filter size={14} /> Filter History
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleExport}
                                className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
                                title="Export to CSV"
                            >
                                <Download size={14} /> Export
                            </button>
                            <button
                                onClick={() => onEdit(null)}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
                            >
                                + New Payment
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {/* Search */}
                        <div className="relative md:col-span-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={14} />
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-lg text-xs focus:outline-none focus:border-blue-500 transition"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Year Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                        >
                            <option value="All">All Years</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        {/* Month Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                        >
                            <option value="All">All Months</option>
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>

                        {/* Status Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                            <option value="All">All Status</option>
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                        </select>

                        {/* Category Filter */}
                        <select
                            className={`${selectClass} text-xs py-2`}
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            <option value="All">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase font-bold backdrop-blur-sm">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('billing_month_sort')}>
                                    <div className="flex items-center gap-1">Month {getSortIcon('billing_month_sort')}</div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('oblName')}>
                                    <div className="flex items-center gap-1">Name {getSortIcon('oblName')}</div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('status')}>
                                    <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('payment_date')}>
                                    <div className="flex items-center gap-1">Paid On {getSortIcon('payment_date')}</div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center gap-1">Amount {getSortIcon('amount')}</div>
                                </th>
                                <th className="px-6 py-4 border-b border-slate-700">Note</th>
                                <th className="px-6 py-4 border-b border-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {sorted.length > 0 ? sorted.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-700/30 transition text-slate-300">
                                    <td className="px-6 py-3 text-blue-300 font-mono text-xs">
                                        {formatMonthDisplay(item.billing_month)}
                                    </td>
                                    <td className="px-6 py-3 font-semibold text-white">{item.oblName}</td>

                                    <td className="px-6 py-3">
                                        {item.status === 'Paid' ? (
                                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded border border-emerald-500/30 font-bold uppercase tracking-wider">Paid</span>
                                        ) : (
                                            <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-1 rounded border border-amber-500/30 font-bold uppercase tracking-wider">Pending</span>
                                        )}
                                    </td>

                                    <td className="px-6 py-3 text-xs text-slate-500">
                                        {item.payment_date ? new Date(item.payment_date).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-3 font-mono text-emerald-400 font-medium">
                                        {formatCurrency(item.amount)}
                                    </td>
                                    <td className="px-6 py-3 text-xs italic text-slate-500 max-w-xs truncate">
                                        {item.note || '-'}
                                    </td>
                                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(item)}
                                            className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white p-1.5 rounded transition-all duration-200"
                                            title={item.status === 'Paid' ? "Edit Payment" : "Make Payment"}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                        <button
                                            onClick={() => onDelete(item)}
                                            className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-1.5 rounded transition-all duration-200"
                                            title="Delete Payment"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <Filter className="opacity-20" size={48} />
                                        <span>No history found matching your filters.</span>
                                        {selectedYear === 'All' && <span className="text-xs text-slate-600 block mt-1">Please select a Year to see Unpaid history.</span>}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ObligationsHistory;
