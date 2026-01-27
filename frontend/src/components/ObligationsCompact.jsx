import React, { useState, useMemo } from 'react';
import { formatCurrency, selectClass } from './UI';
import { CheckCircle, Circle, Edit2, Search, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

const ObligationsCompact = ({ obligations, getMonthStatus, monthOffset, openPaymentModal, handleQuickPay, openObligationModal }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'category', direction: 'asc' });

    // Get month labels
    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() + monthOffset);
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Filter and sort
    const processedData = useMemo(() => {
        let filtered = obligations.filter(obl => {
            const term = searchTerm.toLowerCase();
            return (
                obl.name.toLowerCase().includes(term) ||
                (obl.provider && obl.provider.toLowerCase().includes(term)) ||
                (obl.category && obl.category.toLowerCase().includes(term))
            );
        });

        // Add computed fields for sorting
        const withStatus = filtered.map(obl => {
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);
            return {
                ...obl,
                prevAmount: prev.amount,
                prevIsPaid: prev.isPaid,
                currAmount: curr.amount,
                currIsPaid: curr.isPaid,
                currStatus: curr.status,
                billingDateStr: curr.billingDateStr
            };
        });

        // Sort
        return [...withStatus].sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [obligations, searchTerm, sortConfig, monthOffset, getMonthStatus]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={10} className="text-slate-600" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-blue-400" />
            : <ArrowDown size={10} className="text-blue-400" />;
    };

    // Stats
    const totalBudget = processedData.reduce((sum, o) => sum + (o.prevAmount || 0), 0);
    const totalPaid = processedData.filter(o => o.currIsPaid).reduce((sum, o) => sum + (o.currAmount || 0), 0);
    const paidCount = processedData.filter(o => o.currIsPaid).length;
    const unpaidCount = processedData.length - paidCount;

    // Export
    const handleExport = () => {
        const exportData = processedData.map(obl => ({
            "Name": obl.name,
            "Provider": obl.provider || "",
            "Category": obl.category || "Other",
            "Due Day": obl.due_day,
            "Prev Month": obl.prevAmount || 0,
            "Current Status": obl.currIsPaid ? "Paid" : "Unpaid",
            "Current Amount": obl.currAmount || 0
        }));
        exportToCSV(exportData, `obligations_compact_${monthLabel.replace(' ', '_')}.csv`);
    };

    return (
        <div className="space-y-3 animate-fade-in-up">
            {/* Compact Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                {/* Stats Row */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Total:</span>
                        <span className="font-bold text-white">{processedData.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CheckCircle size={12} className="text-emerald-400" />
                        <span className="text-emerald-400 font-bold">{paidCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Circle size={12} className="text-amber-400" />
                        <span className="text-amber-400 font-bold">{unpaidCount}</span>
                    </div>
                    <div className="h-4 w-px bg-slate-600" />
                    <div className="text-slate-400">
                        <span className="text-emerald-400 font-mono font-bold">{formatCurrency(totalPaid)}</span>
                        <span className="mx-1">/</span>
                        <span className="font-mono">{formatCurrency(totalBudget)}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-500" size={12} />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="bg-slate-900 border border-slate-600 text-white pl-7 pr-3 py-1 rounded text-xs w-32 focus:border-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleExport}
                        className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1"
                    >
                        <Download size={12} />
                    </button>
                </div>
            </div>

            {/* Compact Table */}
            <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-slate-800 text-slate-400 uppercase tracking-wide">
                        <tr>
                            <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-700/50 w-8" onClick={() => requestSort('due_day')}>
                                <div className="flex items-center gap-0.5">Day {getSortIcon('due_day')}</div>
                            </th>
                            <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-700/50" onClick={() => requestSort('category')}>
                                <div className="flex items-center gap-0.5">Cat {getSortIcon('category')}</div>
                            </th>
                            <th className="px-2 py-2 text-left cursor-pointer hover:bg-slate-700/50" onClick={() => requestSort('name')}>
                                <div className="flex items-center gap-0.5">Name {getSortIcon('name')}</div>
                            </th>
                            <th className="px-2 py-2 text-right cursor-pointer hover:bg-slate-700/50" onClick={() => requestSort('prevAmount')}>
                                <div className="flex items-center justify-end gap-0.5">Prev {getSortIcon('prevAmount')}</div>
                            </th>
                            <th className="px-2 py-2 text-center w-16">Status</th>
                            <th className="px-2 py-2 text-right w-24">Amount</th>
                            <th className="px-2 py-2 text-center w-16">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {processedData.map(obl => (
                            <CompactRow
                                key={obl.id}
                                obl={obl}
                                openPaymentModal={openPaymentModal}
                                handleQuickPay={handleQuickPay}
                                openObligationModal={openObligationModal}
                            />
                        ))}
                        {processedData.length === 0 && (
                            <tr>
                                <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                                    No obligations found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Ultra-compact Row Component
const CompactRow = ({ obl, openPaymentModal, handleQuickPay, openObligationModal }) => {
    const [payAmount, setPayAmount] = useState(obl.currAmount || obl.prevAmount || '');
    const [isEditing, setIsEditing] = useState(false);

    React.useEffect(() => {
        setPayAmount(obl.currAmount || obl.prevAmount || '');
    }, [obl.currAmount, obl.prevAmount]);

    const handlePay = () => {
        const val = parseFloat(payAmount) || obl.prevAmount || 0;
        openPaymentModal(obl, obl.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = parseFloat(payAmount) || obl.prevAmount || 0;
            handleQuickPay(obl.id, val, obl.billingDateStr, "PAID");
            setIsEditing(false);
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
        }
    };

    // Category abbreviation
    const catAbbr = (obl.category || 'Other').substring(0, 4);

    return (
        <tr className="hover:bg-slate-800/30 transition-colors group">
            {/* Due Day */}
            <td className="px-2 py-1.5 text-slate-400 font-mono text-center">{obl.due_day}</td>

            {/* Category */}
            <td className="px-2 py-1.5">
                <span className="text-slate-500 text-[10px] uppercase font-medium">{catAbbr}</span>
            </td>

            {/* Name */}
            <td className="px-2 py-1.5">
                <div
                    className="flex items-center gap-1 cursor-pointer hover:text-blue-400 transition"
                    onClick={() => openObligationModal && openObligationModal(obl)}
                >
                    {obl.provider && <span className="text-slate-500 text-[10px]">{obl.provider}</span>}
                    <span className="text-white font-medium truncate max-w-[120px]">{obl.name}</span>
                </div>
            </td>

            {/* Previous Amount */}
            <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                {obl.prevAmount ? formatCurrency(obl.prevAmount) : '-'}
            </td>

            {/* Status */}
            <td className="px-2 py-1.5 text-center">
                {obl.currIsPaid ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20">
                        <CheckCircle size={12} className="text-emerald-400" />
                    </span>
                ) : obl.currStatus === 'BUDGET' ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20">
                        <Circle size={12} className="text-blue-400" />
                    </span>
                ) : (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-700">
                        <Circle size={12} className="text-slate-500" />
                    </span>
                )}
            </td>

            {/* Amount Input */}
            <td className="px-2 py-1.5">
                {obl.currIsPaid ? (
                    <div className="text-right font-mono text-emerald-400 font-medium">
                        {formatCurrency(obl.currAmount)}
                    </div>
                ) : isEditing ? (
                    <input
                        autoFocus
                        type="number"
                        className="w-full bg-slate-800 border border-blue-500 rounded px-1.5 py-0.5 text-right text-white font-mono text-xs outline-none"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => setIsEditing(false)}
                    />
                ) : (
                    <div
                        onClick={() => setIsEditing(true)}
                        className="text-right font-mono text-white cursor-text hover:bg-slate-800 rounded px-1.5 py-0.5 transition"
                    >
                        {payAmount ? formatCurrency(payAmount) : <span className="text-slate-600">-</span>}
                    </div>
                )}
            </td>

            {/* Action */}
            <td className="px-2 py-1.5 text-center">
                {!obl.currIsPaid && (
                    <button
                        onClick={handlePay}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded transition"
                    >
                        Pay
                    </button>
                )}
            </td>
        </tr>
    );
};

export default ObligationsCompact;
