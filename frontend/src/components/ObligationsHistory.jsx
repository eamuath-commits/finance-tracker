import React, { useState, useMemo } from 'react';
import { formatCurrency, selectClass } from '../components/UI';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';

const ObligationsHistory = ({ obligations, history, onEdit, onDelete }) => {
    // ... existing code ...

    // ... inside render loop ...
    <td className="px-6 py-3 text-right flex justify-end gap-2">
        <button
            onClick={() => onEdit(item)}
            className="text-slate-400 hover:text-blue-400 transition"
            title="Edit Payment"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
        </button>
        <button
            onClick={() => onDelete(item)}
            className="text-slate-400 hover:text-red-400 transition"
            title="Delete Payment"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
        </button>
    </td>
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'billing_month', direction: 'desc' });

    // Filters
    const [selectedYear, setSelectedYear] = useState('All');
    const [selectedMonth, setSelectedMonth] = useState('All');
    const [selectedCategory, setSelectedCategory] = useState('All');

    // 1. Flatten Data & Prepare Options
    const { allHistory, years, categories } = useMemo(() => {
        const flattened = [];
        const uniqueYears = new Set();
        const uniqueCategories = new Set();
        const oblMap = {};

        obligations.forEach(o => oblMap[o.id] = o);

        Object.entries(history).forEach(([oblId, records]) => {
            const obl = oblMap[oblId] || { name: 'Unknown', category: 'Unknown' };
            records.forEach(r => {
                const bMonth = r.billing_month || r.payment_date.split('T')[0]; // Fallback
                const year = bMonth.split('-')[0];

                uniqueYears.add(year);
                if (obl.category) uniqueCategories.add(obl.category);

                flattened.push({
                    ...r,
                    oblName: obl.name,
                    oblCategory: obl.category,
                    billing_month_sort: bMonth,
                    year: year,
                    month: bMonth.split('-')[1]
                });
            });
        });

        return {
            allHistory: flattened,
            years: Array.from(uniqueYears).sort().reverse(),
            categories: Array.from(uniqueCategories).sort()
        };
    }, [obligations, history]);

    // 2. Filter
    const filtered = allHistory.filter(item => {
        // Text Search
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
            item.oblName.toLowerCase().includes(term) ||
            (item.note && item.note.toLowerCase().includes(term)) ||
            (item.oblCategory && item.oblCategory.toLowerCase().includes(term))
        );

        // Dropdown Filters
        const matchesYear = selectedYear === 'All' || item.year === selectedYear;
        const matchesMonth = selectedMonth === 'All' || item.month === selectedMonth;
        const matchesCategory = selectedCategory === 'All' || item.oblCategory === selectedCategory;

        return matchesSearch && matchesYear && matchesMonth && matchesCategory;
    });

    // 3. Sort
    const sorted = [...filtered].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    // 4. Calculate Total
    const totalAmount = sorted.reduce((sum, item) => sum + (item.amount || 0), 0);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={12} className="text-slate-600" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUp size={12} className="text-blue-400" /> :
            <ArrowDown size={12} className="text-blue-400" />;
    };

    const months = [
        { value: '01', label: 'January' }, { value: '02', label: 'February' },
        { value: '03', label: 'March' }, { value: '04', label: 'April' },
        { value: '05', label: 'May' }, { value: '06', label: 'June' },
        { value: '07', label: 'July' }, { value: '08', label: 'August' },
        { value: '09', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' }
    ];

    return (
        <div className="animate-fade-in-up space-y-4">
            {/* Top Stats & Filters Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Summary Card */}
                <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 border border-blue-800/30 p-4 rounded-xl flex flex-col justify-center">
                    <p className="text-blue-300 text-xs uppercase font-bold tracking-wider mb-1">Total Paid</p>
                    <p className="text-2xl font-mono font-bold text-white">{formatCurrency(totalAmount)}</p>
                    <p className="text-xs text-slate-500 mt-1">{sorted.length} records found</p>
                </div>

                {/* Filters Area */}
                <div className="md:col-span-3 bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs uppercase font-bold">
                        <Filter size={14} /> Filter History
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition border-b border-slate-700" onClick={() => requestSort('oblCategory')}>
                                    <div className="flex items-center gap-1">Category {getSortIcon('oblCategory')}</div>
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
                                        {item.billing_month ? item.billing_month.substring(0, 7) : '-'}
                                    </td>
                                    <td className="px-6 py-3 font-semibold text-white">{item.oblName}</td>
                                    <td className="px-6 py-3">
                                        <span className="bg-slate-700/50 px-2 py-1 rounded text-[10px] text-slate-300 border border-slate-600/50">
                                            {item.oblCategory}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-500">
                                        {new Date(item.payment_date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-3 font-mono text-emerald-400 font-medium">
                                        {formatCurrency(item.amount)}
                                    </td>
                                    <td className="px-6 py-3 text-xs italic text-slate-500 max-w-xs truncate">
                                        {item.note || '-'}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={() => onEdit(item)}
                                            className="text-slate-400 hover:text-blue-400 transition"
                                            title="Edit Payment"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <Filter className="opacity-20" size={48} />
                                        <span>No history found matching your filters.</span>
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
