import React, { useState } from 'react';
import { formatCurrency } from '../components/UI';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const ObligationsHistory = ({ obligations, history }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'billing_month', direction: 'desc' });

    // 1. Flatten Data
    // history is { oblId: [ {id, amount, billing_month, payment_date, note}, ... ] }
    const allHistory = [];

    // Create quick lookup for obligation details
    const oblMap = {};
    obligations.forEach(o => oblMap[o.id] = o);

    Object.entries(history).forEach(([oblId, records]) => {
        const obl = oblMap[oblId] || { name: 'Unknown', category: 'Unknown' };
        records.forEach(r => {
            allHistory.push({
                ...r,
                oblName: obl.name,
                oblCategory: obl.category,
                // Ensure billing_month is sortable (YYYY-MM-DD or similar)
                billing_month_sort: r.billing_month || r.payment_date
            });
        });
    });

    // 2. Filter
    const filtered = allHistory.filter(item => {
        const term = searchTerm.toLowerCase();
        return (
            item.oblName.toLowerCase().includes(term) ||
            (item.note && item.note.toLowerCase().includes(term)) ||
            (item.oblCategory && item.oblCategory.toLowerCase().includes(term))
        );
    });

    // 3. Sort
    filtered.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

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

    return (
        <div className="animate-fade-in-up">
            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search history..."
                        className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="text-slate-400 text-xs">
                    Total Records: <span className="text-white font-bold">{filtered.length}</span>
                </div>
            </div>

            {/* Table */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-700/50 transition" onClick={() => requestSort('billing_month_sort')}>
                                    <div className="flex items-center gap-1">Month {getSortIcon('billing_month_sort')}</div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-700/50 transition" onClick={() => requestSort('oblName')}>
                                    <div className="flex items-center gap-1">Name {getSortIcon('oblName')}</div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-700/50 transition" onClick={() => requestSort('oblCategory')}>
                                    <div className="flex items-center gap-1">Category {getSortIcon('oblCategory')}</div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-700/50 transition" onClick={() => requestSort('payment_date')}>
                                    <div className="flex items-center gap-1">Paid On {getSortIcon('payment_date')}</div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-700/50 transition" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center gap-1">Amount {getSortIcon('amount')}</div>
                                </th>
                                <th className="px-6 py-3">Note</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {filtered.length > 0 ? filtered.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-700/30 transition text-slate-300">
                                    <td className="px-6 py-3 text-blue-300 font-mono text-xs">
                                        {item.billing_month ? item.billing_month.substring(0, 7) : '-'}
                                    </td>
                                    <td className="px-6 py-3 font-semibold text-white">{item.oblName}</td>
                                    <td className="px-6 py-3">
                                        <span className="bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-300 border border-slate-600">
                                            {item.oblCategory}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-500">
                                        {new Date(item.payment_date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-3 font-mono text-emerald-400">
                                        {formatCurrency(item.amount)}
                                    </td>
                                    <td className="px-6 py-3 text-xs italic text-slate-500 max-w-xs truncate">
                                        {item.note || '-'}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                                        No history found matching your search.
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
