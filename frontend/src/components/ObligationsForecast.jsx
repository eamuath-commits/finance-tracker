import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from './UI';
import {
    TrendingUp, TrendingDown, Minus, CheckCircle,
    Download, ChevronRight, Box
} from 'lucide-react';
import axios from 'axios';
import { exportToCSV } from '../utils/csvExport';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const TREND_ICONS = {
    increasing: <TrendingUp size={12} className="text-red-400" />,
    decreasing: <TrendingDown size={12} className="text-emerald-400" />,
    stable: <Minus size={12} className="text-slate-400" />,
};

// Helper to get month label from offset
const getMonthLabel = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const getMonthKey = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// Define 4 months: previous, current, next, +2
const MONTHS = [
    { offset: -1, label: getMonthLabel(-1), key: getMonthKey(-1), isPast: true, isCurrent: false },
    { offset: 0, label: getMonthLabel(0), key: getMonthKey(0), isPast: false, isCurrent: true },
    { offset: 1, label: getMonthLabel(1), key: getMonthKey(1), isPast: false, isCurrent: false },
    { offset: 2, label: getMonthLabel(2), key: getMonthKey(2), isPast: false, isCurrent: false },
];

// --- Main Forecast Component ---
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
                // Auto-expand all categories
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

    // Filter obligations by category
    const filteredObligations = useMemo(() => {
        if (!categoryFilter) return obligations;
        return obligations.filter(o => o.category === categoryFilter);
    }, [obligations, categoryFilter]);

    // Compute per-obligation per-month data
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

    // Column totals
    const columnTotals = useMemo(() => {
        const totals = {};
        MONTHS.forEach(m => {
            totals[m.key] = filteredObligations.reduce((sum, obl) => {
                return sum + (oblMonthData[obl.id]?.[m.key]?.amount || 0);
            }, 0);
        });
        return totals;
    }, [filteredObligations, oblMonthData]);

    // Category totals per month
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
        if (!forecast) return;
        const rows = filteredObligations.map(obl => {
            const row = {
                Name: obl.name,
                Category: obl.category,
                Provider: obl.provider || '',
            };
            MONTHS.forEach(m => {
                row[m.label] = oblMonthData[obl.id]?.[m.key]?.amount || 0;
            });
            return row;
        });
        exportToCSV(rows, `forecast_${new Date().toISOString().split('T')[0]}.csv`);
    };

    if (loading) return <div className="text-center py-12 text-slate-400 text-sm">Loading forecast...</div>;

    return (
        <div className="animate-fade-in space-y-4">
            {/* Export */}
            <div className="flex justify-end">
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Main Table */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        {/* Column Headers */}
                        <thead>
                            <tr className="border-b border-slate-700/50">
                                <th className="px-4 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-bold w-[30%] bg-slate-800/50">
                                    Obligation
                                </th>
                                {MONTHS.map(m => (
                                    <th
                                        key={m.key}
                                        className={`px-3 py-3 text-center text-[10px] uppercase tracking-wider font-bold w-[17.5%] ${m.isCurrent
                                                ? 'bg-blue-900/20 text-blue-400 border-x border-blue-500/15'
                                                : m.isPast
                                                    ? 'bg-emerald-900/10 text-emerald-400'
                                                    : 'bg-slate-800/30 text-slate-500'
                                            }`}
                                    >
                                        <div>{m.label}</div>
                                        {m.isCurrent && <div className="text-[8px] text-blue-500 mt-0.5">Current</div>}
                                        {m.isPast && <div className="text-[8px] text-emerald-500 mt-0.5">Actual</div>}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {sortedCategories.map(cat => {
                                const items = grouped[cat];
                                const isExpanded = expandedCats.has(cat);

                                return (
                                    <React.Fragment key={cat}>
                                        {/* Category Row */}
                                        <tr
                                            className="bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-colors border-b border-slate-700/30"
                                            onClick={() => toggleCat(cat)}
                                        >
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                        <ChevronRight size={12} className="text-slate-500" />
                                                    </div>
                                                    <span className="text-white text-xs font-bold uppercase tracking-wider">{cat}</span>
                                                    <span className="text-[9px] text-slate-500 font-mono">{items.length}</span>
                                                </div>
                                            </td>
                                            {MONTHS.map(m => (
                                                <td
                                                    key={m.key}
                                                    className={`px-3 py-2.5 text-right ${m.isCurrent ? 'bg-blue-900/10 border-x border-blue-500/10' : ''
                                                        }`}
                                                >
                                                    <span className="text-white font-mono text-xs font-semibold">
                                                        {formatCurrency(catMonthTotals[cat]?.[m.key] || 0)}
                                                    </span>
                                                </td>
                                            ))}
                                        </tr>

                                        {/* Individual Obligations */}
                                        {isExpanded && items.map(obl => (
                                            <tr key={obl.id} className="hover:bg-slate-800/30 transition-colors border-b border-slate-700/15">
                                                <td className="px-4 py-2 pl-10">
                                                    <div className="flex items-center gap-1.5">
                                                        {obl.provider && <span className="text-[8px] text-slate-500 uppercase">{obl.provider}</span>}
                                                        {obl.provider && <span className="text-slate-700 text-[8px]">·</span>}
                                                        <span className="text-slate-300 text-xs">{obl.name}</span>
                                                    </div>
                                                </td>
                                                {MONTHS.map(m => {
                                                    const data = oblMonthData[obl.id]?.[m.key];
                                                    if (!data) return <td key={m.key} className="px-3 py-2 text-right"><span className="text-slate-600 text-xs">—</span></td>;

                                                    return (
                                                        <td
                                                            key={m.key}
                                                            className={`px-3 py-2 text-right ${m.isCurrent ? 'bg-blue-900/5 border-x border-blue-500/10' : ''
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {!m.isPast && !data.isPaid && TREND_ICONS[data.trend]}
                                                                {data.isPaid ? (
                                                                    <span className="flex items-center gap-1">
                                                                        <CheckCircle size={10} className="text-emerald-400" />
                                                                        <span className="font-mono text-emerald-400 text-xs">{formatCurrency(data.amount)}</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-mono text-slate-400 text-xs">{formatCurrency(data.amount)}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}

                            {/* Grand Total Row */}
                            <tr className="bg-slate-800/60 border-t-2 border-slate-600/50">
                                <td className="px-4 py-3">
                                    <span className="text-white font-bold text-xs uppercase tracking-wider">Total</span>
                                </td>
                                {MONTHS.map(m => (
                                    <td
                                        key={m.key}
                                        className={`px-3 py-3 text-right ${m.isCurrent ? 'bg-blue-900/15 border-x border-blue-500/15' : ''
                                            }`}
                                    >
                                        <span className={`font-mono text-sm font-bold ${m.isCurrent ? 'text-blue-300' : m.isPast ? 'text-emerald-300' : 'text-white'
                                            }`}>
                                            {formatCurrency(columnTotals[m.key] || 0)}
                                        </span>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Empty State */}
            {sortedCategories.length === 0 && (
                <div className="text-center py-16 text-slate-500">
                    <Box size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No forecast data available</p>
                </div>
            )}
        </div>
    );
};

export default ObligationsForecast;
