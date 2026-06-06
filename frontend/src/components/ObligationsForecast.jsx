import React, { useState, useEffect, useMemo } from 'react';
import api, { API_URL } from '../utils/api';
import { formatCurrency } from './UI';
import {
    TrendingUp, TrendingDown, Minus, CheckCircle,
    Download, ChevronDown, ChevronRight, Box, Edit3, DollarSign, X, Trash2
} from 'lucide-react';
import { CATEGORY_ICONS, CATEGORY_COLORS } from './categoryStyles';
import { exportToCSV } from '../utils/csvExport';


const TREND_ICONS = {
    increasing: <TrendingUp size={11} className="text-red-400" />,
    decreasing: <TrendingDown size={11} className="text-emerald-400" />,
    stable: <Minus size={11} className="text-slate-500" />,
};

const getMonthLabel = (offset) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getMonthShort = (offset) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'short' });
};

const getMonthKey = (offset) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

const getBillingDateStr = (offset) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-01`;
};

// --- Inline Edit Popover ---
const EditPopover = ({ obl, monthData, billingDate, onSave, onClose, onDelete }) => {
    const [amount, setAmount] = useState(monthData?.amount || '');

    const handleSave = () => {
        const val = parseFloat(amount);
        const isBlank = amount === '' || amount === null || amount === undefined;

        // If field is completely blank: delete existing payment, or just close
        if (isBlank) {
            if (monthData?.paymentId) {
                onSave(obl.id, 0, billingDate, 'DELETE');
            }
            onClose();
            return;
        }

        if (isNaN(val)) return;
        // Always save as BUDGET — payment completion happens via transaction linking in Payments tab
        onSave(obl.id, val, billingDate, 'BUDGET');
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onClose();
    };

    return (
        <div className="absolute z-50 top-full mt-1 right-0 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl shadow-black/40 p-3 space-y-3 animate-fade-in" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-semibold truncate">{obl.name}</p>
                    {obl.provider && <p className="text-[9px] text-slate-500 uppercase">{obl.provider}</p>}
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white p-0.5 rounded transition">
                    <X size={14} />
                </button>
            </div>

            {/* Budget Amount */}
            <div>
                <label className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Budget Amount</label>
                <div className="relative">
                    <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        autoFocus
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono outline-none focus:border-blue-500 transition"
                        placeholder="0.00"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={handleSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg transition shadow-sm"
                >
                    Save Budget
                </button>
                {monthData?.paymentId && (
                    <button
                        onClick={() => { onDelete(monthData.paymentId); onClose(); }}
                        className="bg-red-900/60 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold py-2 px-2.5 rounded-lg transition shadow-sm flex items-center gap-1"
                        title="Delete entry"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};

const ObligationsForecast = ({ categoryFilter, obligations = [], payments = {}, monthOffset = 0, periodStartDay = 1, handleQuickPay, onRefresh }) => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedCats, setExpandedCats] = useState(new Set());
    const [editingCell, setEditingCell] = useState(null); // { oblId, monthKey }

    // Helper: get period date range label based on periodStartDay
    const getPeriodRange = (offset) => {
        if (periodStartDay === 1) return null;
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + offset);
        const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, periodStartDay);
        const endDay = periodStartDay - 1;
        const curMonth = new Date(d.getFullYear(), d.getMonth(), endDay);
        const fmtShort = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmtShort(prevMonth)} → ${fmtShort(curMonth)}`;
    };

    const months = useMemo(() => [
        { offset: monthOffset - 2, label: getMonthLabel(monthOffset - 2), short: getMonthShort(monthOffset - 2), key: getMonthKey(monthOffset - 2), billingDate: getBillingDateStr(monthOffset - 2), periodRange: getPeriodRange(monthOffset - 2), isPrev: true, isSelected: false, isNext: false },
        { offset: monthOffset - 1, label: getMonthLabel(monthOffset - 1), short: getMonthShort(monthOffset - 1), key: getMonthKey(monthOffset - 1), billingDate: getBillingDateStr(monthOffset - 1), periodRange: getPeriodRange(monthOffset - 1), isPrev: true, isSelected: false, isNext: false },
        { offset: monthOffset, label: getMonthLabel(monthOffset), short: getMonthShort(monthOffset), key: getMonthKey(monthOffset), billingDate: getBillingDateStr(monthOffset), periodRange: getPeriodRange(monthOffset), isPrev: false, isSelected: true, isNext: false },
    ], [monthOffset, periodStartDay]);

    useEffect(() => {
        const fetchForecast = async () => {
            setLoading(true);
            try {
                const res = await api.get(`${API_URL}/obligations/forecast?months_ahead=1`);
                setForecast(res.data);
                const cats = new Set((res.data.obligations || []).map(o => o.category));
                setExpandedCats(cats);
            } catch (e) {
                console.error('Failed to fetch forecast', e);
            } finally {
                setLoading(false);
            }
        };
        fetchForecast();
    }, []);

    // Close popover on click outside
    useEffect(() => {
        if (!editingCell) return;
        const handler = () => setEditingCell(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [editingCell]);

    const toggleCat = (cat) => {
        setExpandedCats(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    // Expand all categories by default when obligations load
    const oblCategories = useMemo(() => {
        const cats = [...new Set(obligations.map(o => o.category || 'Other'))].sort();
        return cats;
    }, [obligations]);

    useEffect(() => {
        if (oblCategories.length > 0 && expandedCats.size === 0) {
            setExpandedCats(new Set(oblCategories));
        }
    }, [oblCategories]);

    const allExpanded = oblCategories.length > 0 && expandedCats.size >= oblCategories.length;
    const toggleAllCats = () => {
        if (allExpanded) {
            setExpandedCats(new Set());
        } else {
            setExpandedCats(new Set(oblCategories));
        }
    };

    const filteredObligations = useMemo(() => {
        if (!categoryFilter) return obligations;
        return obligations.filter(o => o.category === categoryFilter);
    }, [obligations, categoryFilter]);

    const oblMonthData = useMemo(() => {
        const result = {};
        filteredObligations.forEach(obl => {
            result[obl.id] = {};
            months.forEach(m => {
                const oblPayments = payments[obl.id] || [];
                const monthPayments = oblPayments.filter(p => {
                    const bm = p.billing_month || '';
                    return bm.startsWith(m.key) && p.status !== 'BUDGET';
                });

                // Paid = has linked transaction(s) OR legacy status=PAID
                const hasLinkedTx = monthPayments.some(p =>
                    p.transaction_id ||
                    (p.linked_transactions && p.linked_transactions.length > 0)
                );
                const isPaid = hasLinkedTx || monthPayments.length > 0;
                const paidAmount = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

                // Also check for BUDGET entries
                const budgetPayments = oblPayments.filter(p => {
                    const bm = p.billing_month || '';
                    return bm.startsWith(m.key) && p.status === 'BUDGET';
                });
                const hasBudget = budgetPayments.length > 0;
                const budgetAmount = budgetPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

                const forecastObl = forecast?.obligations?.find(f => f.id === obl.id);
                const forecastAmount = forecastObl?.forecast_amount || 0;
                const trend = forecastObl?.trend || 'stable';

                // Get the payment ID (first matching payment for this month)
                const firstPayment = [...monthPayments, ...budgetPayments][0];

                result[obl.id][m.key] = {
                    isPaid,
                    hasBudget,
                    amount: isPaid ? paidAmount : (hasBudget ? budgetAmount : forecastAmount),
                    paidAmount,
                    budgetAmount,
                    forecastAmount,
                    trend,
                    paymentId: firstPayment?.id || null,
                };
            });
        });
        return result;
    }, [filteredObligations, payments, forecast, months]);

    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    const sortedCategories = Object.keys(grouped).sort();

    const columnTotals = useMemo(() => {
        const totals = {};
        months.forEach(m => {
            totals[m.key] = filteredObligations.reduce((sum, obl) => {
                return sum + (oblMonthData[obl.id]?.[m.key]?.amount || 0);
            }, 0);
        });
        return totals;
    }, [filteredObligations, oblMonthData, months]);

    const catMonthTotals = useMemo(() => {
        const result = {};
        sortedCategories.forEach(cat => {
            result[cat] = {};
            months.forEach(m => {
                result[cat][m.key] = grouped[cat].reduce((sum, obl) => {
                    return sum + (oblMonthData[obl.id]?.[m.key]?.amount || 0);
                }, 0);
            });
        });
        return result;
    }, [sortedCategories, grouped, oblMonthData, months]);

    // Handle save from inline edit
    const handleInlineSave = async (oblId, amount, billingDate, status) => {
        // Handle DELETE: clear the amount to remove the payment
        if (status === 'DELETE') {
            const oblPayments = payments[oblId] || [];
            const monthKey = billingDate.substring(0, 7);
            const existing = oblPayments.find(p => (p.billing_month || '').startsWith(monthKey));
            if (existing) {
                try {
                    await api.delete(`${API_URL}/obligations/history/${existing.id}`);
                    if (onRefresh) onRefresh();
                } catch (err) {
                    console.error('Error deleting payment:', err);
                }
            }
            return;
        }
        if (handleQuickPay) {
            await handleQuickPay(oblId, amount, billingDate, status);
        }
    };

    // Handle delete payment from forecast
    const handleDeletePayment = async (paymentId) => {
        if (!confirm('Delete this payment entry?')) return;
        try {
            await api.delete(`${API_URL}/obligations/history/${paymentId}`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Error deleting payment:', err);
            alert('Failed to delete payment');
        }
    };


    const handleExport = () => {
        const rows = filteredObligations.map(obl => {
            const row = { Name: obl.name, Category: obl.category, Provider: obl.provider || '' };
            months.forEach(m => { row[m.label] = oblMonthData[obl.id]?.[m.key]?.amount || 0; });
            return row;
        });
        exportToCSV(rows, `forecast_${new Date().toISOString().split('T')[0]}.csv`);
    };

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        </div>
    );

    // Amount cell renderer
    const AmountCell = ({ obl, data, month }) => {
        const isEditing = editingCell?.oblId === obl.id && editingCell?.monthKey === month.key;

        if (!data || data.amount === 0) {
            return (
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingCell({ oblId: obl.id, monthKey: month.key }); }}
                        className="text-slate-600 hover:text-slate-400 text-[11px] cursor-pointer transition group/cell flex items-center gap-1"
                    >
                        <span>—</span>
                        <Edit3 size={9} className="opacity-0 group-hover/cell:opacity-100 transition" />
                    </button>
                    {isEditing && (
                        <EditPopover
                            obl={obl}
                            monthData={data}
                            billingDate={month.billingDate}
                            onSave={handleInlineSave}
                            onClose={() => setEditingCell(null)}
                            onDelete={handleDeletePayment}
                        />
                    )}
                </div>
            );
        }

        if (data.isPaid) {
            return (
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingCell({ oblId: obl.id, monthKey: month.key }); }}
                        className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md cursor-pointer hover:bg-emerald-500/20 transition group/cell"
                    >
                        <CheckCircle size={10} />
                        <span className="font-mono text-[11px] font-medium">{formatCurrency(data.amount)}</span>
                        <Edit3 size={8} className="opacity-0 group-hover/cell:opacity-100 transition ml-0.5" />
                    </button>
                    {isEditing && (
                        <EditPopover
                            obl={obl}
                            monthData={data}
                            billingDate={month.billingDate}
                            onSave={handleInlineSave}
                            onClose={() => setEditingCell(null)}
                            onDelete={handleDeletePayment}
                        />
                    )}
                </div>
            );
        }

        if (data.hasBudget) {
            return (
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingCell({ oblId: obl.id, monthKey: month.key }); }}
                        className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md cursor-pointer hover:bg-blue-500/20 transition group/cell"
                    >
                        <DollarSign size={10} />
                        <span className="font-mono text-[11px] font-medium">{formatCurrency(data.amount)}</span>
                        <Edit3 size={8} className="opacity-0 group-hover/cell:opacity-100 transition ml-0.5" />
                    </button>
                    {isEditing && (
                        <EditPopover
                            obl={obl}
                            monthData={data}
                            billingDate={month.billingDate}
                            onSave={handleInlineSave}
                            onClose={() => setEditingCell(null)}
                            onDelete={handleDeletePayment}
                        />
                    )}
                </div>
            );
        }

        return (
            <div className="relative">
                <button
                    onClick={(e) => { e.stopPropagation(); setEditingCell({ oblId: obl.id, monthKey: month.key }); }}
                    className="inline-flex items-center gap-1 cursor-pointer hover:bg-slate-800/60 px-2 py-0.5 rounded-md transition group/cell"
                >
                    {!month.isPrev && TREND_ICONS[data.trend]}
                    <span className="font-mono text-[11px] text-slate-300">{formatCurrency(data.amount)}</span>
                    <Edit3 size={8} className="opacity-0 group-hover/cell:opacity-100 text-slate-500 transition ml-0.5" />
                </button>
                {isEditing && (
                    <EditPopover
                        obl={obl}
                        monthData={data}
                        billingDate={month.billingDate}
                        onSave={handleInlineSave}
                        onClose={() => setEditingCell(null)}
                        onDelete={handleDeletePayment}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-5 animate-fade-in">
            {/* ── Month Summary Cards ── */}
            <div className="grid grid-cols-3 gap-3">
                {months.map(m => {
                    const total = columnTotals[m.key] || 0;

                    // Compute paid vs budget (budget = manual budget + system forecast)
                    let paidTotal = 0, unpaidTotal = 0;
                    filteredObligations.forEach(obl => {
                        const d = oblMonthData[obl.id]?.[m.key];
                        if (!d) return;
                        if (d.isPaid) paidTotal += d.paidAmount || 0;
                        else unpaidTotal += d.amount || 0;
                    });

                    return (
                        <div
                            key={m.key}
                            className={`relative rounded-2xl p-4 transition-all duration-300 overflow-hidden ${m.isSelected
                                ? 'bg-gradient-to-br from-blue-600/20 via-blue-900/15 to-slate-900 border border-blue-500/30 shadow-lg shadow-blue-500/5'
                                : m.isPrev
                                    ? 'bg-gradient-to-br from-emerald-600/10 to-slate-900 border border-emerald-500/20'
                                    : 'bg-slate-800/60 border border-slate-700/40'
                                }`}
                        >
                            {m.isSelected && (
                                <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] font-bold uppercase px-2 py-0.5 rounded-bl-lg tracking-wider">
                                    Selected
                                </div>
                            )}
                            <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${m.isSelected ? 'text-blue-400' : m.isPrev ? 'text-emerald-400/80' : 'text-slate-500'
                                }`}>
                                {m.label}
                            </p>
                            <p className={`text-xl font-bold font-mono ${m.isSelected ? 'text-white' : m.isPrev ? 'text-emerald-300' : 'text-slate-300'
                                }`}>
                                {formatCurrency(total)}
                            </p>
                            {/* Paid / Budget breakdown */}
                            <div className="flex gap-3 mt-2 text-[10px] font-mono">
                                {paidTotal > 0 && (
                                    <span className="text-emerald-400 flex items-center gap-0.5">
                                        <CheckCircle size={9} /> {formatCurrency(paidTotal)}
                                    </span>
                                )}
                                {unpaidTotal > 0 && (
                                    <span className="text-blue-400 flex items-center gap-0.5">
                                        <DollarSign size={9} /> {formatCurrency(unpaidTotal)}
                                    </span>
                                )}
                            </div>
                            {m.periodRange && (
                                <p className="text-[9px] text-slate-500 mt-1 font-mono">{m.periodRange}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Action Buttons ── */}
            <div className="flex justify-end gap-2">
                <button
                    onClick={toggleAllCats}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-[11px] py-1.5 px-3 rounded-lg border border-slate-700/40 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
                >
                    {allExpanded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-[11px] py-1.5 px-3 rounded-lg border border-slate-700/40 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
                >
                    <Download size={12} /> Export CSV
                </button>
            </div>

            {/* ── Forecast Grid ── */}
            <div className="space-y-3">
                {sortedCategories.map((cat, catIdx) => {
                    const items = grouped[cat];
                    const isExpanded = expandedCats.has(cat);
                    const borderColor = CATEGORY_COLORS[cat] || 'border-gray-500/40';
                    const icon = CATEGORY_ICONS[cat] || <Box size={16} className="text-gray-400" />;

                    return (
                        <div key={cat} className={`bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg border-l-2 ${borderColor} transition-all duration-300`}>
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCat(cat)}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800/80 transition-colors"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                        <ChevronRight size={12} className="text-slate-500" />
                                    </div>
                                    {icon}
                                    <h3 className="text-white font-semibold text-[11px] uppercase tracking-wider">{cat}</h3>
                                    <span className="px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded-full text-[9px] font-mono">{items.length}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    {months.map(m => (
                                        <span key={m.key} className={`font-mono text-[10px] ${m.isSelected ? 'text-blue-400' : 'text-slate-500'}`}>
                                            {formatCurrency(catMonthTotals[cat]?.[m.key] || 0)}
                                        </span>
                                    ))}
                                </div>
                            </button>

                            {/* Expanded Items */}
                            {isExpanded && (
                                <div className="animate-fade-in">
                                    <table className="w-full text-left table-fixed">
                                        <thead className="bg-slate-800/30">
                                            <tr className="text-[8px] uppercase font-bold text-slate-500">
                                                <th className="px-4 py-1.5 w-[40%]">Obligation</th>
                                                {months.map(m => (
                                                    <th key={m.key} className={`px-3 py-1.5 text-right ${m.isSelected ? 'text-blue-400' : ''}`} style={{ width: `${60 / months.length}%` }}>
                                                        {m.short}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(obl => (
                                                <tr key={obl.id} className="border-b border-slate-700/20 hover:bg-slate-800/50 transition-colors group">
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5">
                                                            {obl.provider && (
                                                                <span className="text-[9px] text-slate-500 uppercase font-medium bg-slate-800/80 px-1.5 py-0.5 rounded">
                                                                    {obl.provider}
                                                                </span>
                                                            )}
                                                            <span className="text-slate-300 text-[12px]">{obl.name}</span>
                                                        </div>
                                                    </td>
                                                    {months.map(m => {
                                                        const data = oblMonthData[obl.id]?.[m.key];
                                                        return (
                                                            <td
                                                                key={m.key}
                                                                className={`px-3 py-2 text-right ${m.isSelected ? 'bg-blue-500/[0.02]' : ''}`}
                                                            >
                                                                <AmountCell obl={obl} data={data} month={m} />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                    {/* ── Grand Total ── */}
                    <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg border-l-2 border-white/20 transition-all duration-300">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
                            <span className="text-white text-[12px] font-bold uppercase tracking-wider">Total</span>
                            <div className="flex items-center gap-4">
                                {months.map(m => (
                                    <span key={m.key} className={`font-mono text-[12px] font-bold ${m.isSelected ? 'text-blue-300' : m.isPrev ? 'text-emerald-300' : 'text-white'}`}>
                                        {formatCurrency(columnTotals[m.key] || 0)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            {/* Empty State */}
            {sortedCategories.length === 0 && (
                <div className="text-center py-20 text-slate-500">
                    <Box size={36} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No forecast data available</p>
                </div>
            )}

        </div>
    );
};

export default ObligationsForecast;
