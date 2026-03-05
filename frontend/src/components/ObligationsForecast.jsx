import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from './UI';
import {
    TrendingUp, TrendingDown, Minus, CheckCircle,
    Download, ChevronDown, ChevronRight, Box
} from 'lucide-react';
import axios from 'axios';
import { exportToCSV } from '../utils/csvExport';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const TREND_ICONS = {
    increasing: <TrendingUp size={11} className="text-red-400" />,
    decreasing: <TrendingDown size={11} className="text-emerald-400" />,
    stable: <Minus size={11} className="text-slate-500" />,
};

const getMonthLabel = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getMonthShort = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'short' });
};

const getMonthKey = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

const MONTHS = [
    { offset: -1, label: getMonthLabel(-1), short: getMonthShort(-1), key: getMonthKey(-1), isPast: true, isCurrent: false },
    { offset: 0, label: getMonthLabel(0), short: getMonthShort(0), key: getMonthKey(0), isPast: false, isCurrent: true },
    { offset: 1, label: getMonthLabel(1), short: getMonthShort(1), key: getMonthKey(1), isPast: false, isCurrent: false },
    { offset: 2, label: getMonthLabel(2), short: getMonthShort(2), key: getMonthKey(2), isPast: false, isCurrent: false },
];

const ObligationsForecast = ({ categoryFilter, obligations = [], payments = {} }) => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedCats, setExpandedCats] = useState(new Set());

    useEffect(() => {
        const fetchForecast = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${API_URL}/obligations/forecast?months_ahead=1`);
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

    const toggleCat = (cat) => {
        setExpandedCats(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const filteredObligations = useMemo(() => {
        if (!categoryFilter) return obligations;
        return obligations.filter(o => o.category === categoryFilter);
    }, [obligations, categoryFilter]);

    // Build per-obligation per-month data
    const oblMonthData = useMemo(() => {
        const result = {};
        filteredObligations.forEach(obl => {
            result[obl.id] = {};
            MONTHS.forEach(m => {
                const oblPayments = payments[obl.id] || [];
                const monthPayments = oblPayments.filter(p => {
                    const bm = p.billing_month || '';
                    return bm.startsWith(m.key) && p.status !== 'BUDGET';
                });
                const isPaid = monthPayments.length > 0;
                const paidAmount = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const forecastObl = forecast?.obligations?.find(f => f.id === obl.id);
                const forecastAmount = forecastObl?.forecast_amount || 0;
                const trend = forecastObl?.trend || 'stable';

                result[obl.id][m.key] = {
                    isPaid,
                    amount: isPaid ? paidAmount : forecastAmount,
                    trend,
                };
            });
        });
        return result;
    }, [filteredObligations, payments, forecast]);

    // Group by category
    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    const sortedCategories = Object.keys(grouped).sort();

    // Totals
    const columnTotals = useMemo(() => {
        const totals = {};
        MONTHS.forEach(m => {
            totals[m.key] = filteredObligations.reduce((sum, obl) => {
                return sum + (oblMonthData[obl.id]?.[m.key]?.amount || 0);
            }, 0);
        });
        return totals;
    }, [filteredObligations, oblMonthData]);

    const catMonthTotals = useMemo(() => {
        const result = {};
        sortedCategories.forEach(cat => {
            result[cat] = {};
            MONTHS.forEach(m => {
                result[cat][m.key] = grouped[cat].reduce((sum, obl) => {
                    return sum + (oblMonthData[obl.id]?.[m.key]?.amount || 0);
                }, 0);
            });
        });
        return result;
    }, [sortedCategories, grouped, oblMonthData]);

    const handleExport = () => {
        const rows = filteredObligations.map(obl => {
            const row = { Name: obl.name, Category: obl.category, Provider: obl.provider || '' };
            MONTHS.forEach(m => { row[m.label] = oblMonthData[obl.id]?.[m.key]?.amount || 0; });
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
    const AmountCell = ({ data, isPast }) => {
        if (!data || data.amount === 0) {
            return <span className="text-slate-600 text-[11px]">—</span>;
        }
        if (data.isPaid) {
            return (
                <div className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                    <CheckCircle size={10} />
                    <span className="font-mono text-[11px] font-medium">{formatCurrency(data.amount)}</span>
                </div>
            );
        }
        return (
            <div className="inline-flex items-center gap-1">
                {!isPast && TREND_ICONS[data.trend]}
                <span className="font-mono text-[11px] text-slate-300">{formatCurrency(data.amount)}</span>
            </div>
        );
    };

    return (
        <div className="space-y-5 animate-fade-in">
            {/* ── Month Summary Cards ── */}
            <div className="grid grid-cols-4 gap-3">
                {MONTHS.map(m => {
                    const total = columnTotals[m.key] || 0;
                    return (
                        <div
                            key={m.key}
                            className={`relative rounded-2xl p-4 transition-all duration-300 overflow-hidden ${m.isCurrent
                                    ? 'bg-gradient-to-br from-blue-600/20 via-blue-900/15 to-slate-900 border border-blue-500/30 shadow-lg shadow-blue-500/5'
                                    : m.isPast
                                        ? 'bg-gradient-to-br from-emerald-600/10 to-slate-900 border border-emerald-500/20'
                                        : 'bg-slate-800/60 border border-slate-700/40'
                                }`}
                        >
                            {m.isCurrent && (
                                <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] font-bold uppercase px-2 py-0.5 rounded-bl-lg tracking-wider">
                                    Now
                                </div>
                            )}
                            <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${m.isCurrent ? 'text-blue-400' : m.isPast ? 'text-emerald-400/80' : 'text-slate-500'
                                }`}>
                                {m.label}
                            </p>
                            <p className={`text-xl font-bold font-mono ${m.isCurrent ? 'text-white' : m.isPast ? 'text-emerald-300' : 'text-slate-300'
                                }`}>
                                {formatCurrency(total)}
                            </p>
                            {m.isPast && (
                                <p className="text-[9px] text-emerald-500/60 mt-1 font-medium">Actual payments</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Export Button ── */}
            <div className="flex justify-end">
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-[11px] py-1.5 px-3 rounded-lg border border-slate-700/40 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
                >
                    <Download size={12} /> Export CSV
                </button>
            </div>

            {/* ── Forecast Grid ── */}
            <div className="rounded-2xl border border-slate-700/40 overflow-hidden bg-slate-900/50 shadow-xl">
                {/* Header */}
                <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] bg-slate-800/70 border-b border-slate-700/40">
                    <div className="px-5 py-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                        Category / Obligation
                    </div>
                    {MONTHS.map(m => (
                        <div
                            key={m.key}
                            className={`px-3 py-3 text-center text-[10px] uppercase tracking-widest font-bold ${m.isCurrent
                                    ? 'text-blue-400 bg-blue-500/5 border-x border-blue-500/10'
                                    : m.isPast
                                        ? 'text-emerald-400/70'
                                        : 'text-slate-500'
                                }`}
                        >
                            {m.short}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div>
                    {sortedCategories.map((cat, catIdx) => {
                        const items = grouped[cat];
                        const isExpanded = expandedCats.has(cat);
                        const isLast = catIdx === sortedCategories.length - 1;

                        return (
                            <div key={cat} className={!isLast ? 'border-b border-slate-700/25' : ''}>
                                {/* Category Row */}
                                <div
                                    className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] cursor-pointer hover:bg-slate-800/40 transition-colors"
                                    onClick={() => toggleCat(cat)}
                                >
                                    <div className="px-5 py-3 flex items-center gap-2.5">
                                        <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                            <ChevronDown size={13} className="text-slate-500" />
                                        </div>
                                        <span className="text-white text-[12px] font-semibold">{cat}</span>
                                        <span className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded font-mono">{items.length}</span>
                                    </div>
                                    {MONTHS.map(m => (
                                        <div
                                            key={m.key}
                                            className={`px-3 py-3 text-right ${m.isCurrent ? 'bg-blue-500/[0.03] border-x border-blue-500/10' : ''
                                                }`}
                                        >
                                            <span className="text-white font-mono text-[12px] font-semibold">
                                                {formatCurrency(catMonthTotals[cat]?.[m.key] || 0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Expanded Items */}
                                {isExpanded && (
                                    <div className="bg-slate-900/30">
                                        {items.map((obl, oblIdx) => (
                                            <div
                                                key={obl.id}
                                                className={`grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] hover:bg-slate-800/25 transition-colors ${oblIdx < items.length - 1 ? 'border-b border-slate-800/40' : ''
                                                    }`}
                                            >
                                                <div className="px-5 py-2.5 pl-12">
                                                    <div className="flex items-center gap-1.5">
                                                        {obl.provider && (
                                                            <span className="text-[9px] text-slate-500 uppercase font-medium bg-slate-800/80 px-1.5 py-0.5 rounded">
                                                                {obl.provider}
                                                            </span>
                                                        )}
                                                        <span className="text-slate-300 text-[12px]">{obl.name}</span>
                                                    </div>
                                                </div>
                                                {MONTHS.map(m => {
                                                    const data = oblMonthData[obl.id]?.[m.key];
                                                    return (
                                                        <div
                                                            key={m.key}
                                                            className={`px-3 py-2.5 text-right flex items-center justify-end ${m.isCurrent ? 'bg-blue-500/[0.02] border-x border-blue-500/10' : ''
                                                                }`}
                                                        >
                                                            <AmountCell data={data} isPast={m.isPast} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ── Grand Total ── */}
                    <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] bg-slate-800/50 border-t-2 border-slate-600/30">
                        <div className="px-5 py-4">
                            <span className="text-white text-[12px] font-bold uppercase tracking-wider">Total</span>
                        </div>
                        {MONTHS.map(m => (
                            <div
                                key={m.key}
                                className={`px-3 py-4 text-right ${m.isCurrent ? 'bg-blue-500/[0.05] border-x border-blue-500/10' : ''
                                    }`}
                            >
                                <span className={`font-mono text-[13px] font-bold ${m.isCurrent ? 'text-blue-300' : m.isPast ? 'text-emerald-300' : 'text-white'
                                    }`}>
                                    {formatCurrency(columnTotals[m.key] || 0)}
                                </span>
                            </div>
                        ))}
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
