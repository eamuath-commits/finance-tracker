import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from './UI';
import {
    TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle,
    BarChart3, Download, ChevronRight, ChevronDown, Box
} from 'lucide-react';
import axios from 'axios';
import { exportToCSV } from '../utils/csvExport';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const TREND_ICONS = {
    increasing: <TrendingUp size={14} className="text-red-400" />,
    decreasing: <TrendingDown size={14} className="text-emerald-400" />,
    stable: <Minus size={14} className="text-slate-400" />,
};

const CONFIDENCE_STYLES = {
    high: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'High' },
    medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', label: 'Med' },
    low: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/25', label: 'Low' },
    none: { bg: 'bg-slate-800/50', text: 'text-slate-600', border: 'border-slate-700/25', label: '—' },
};

const ObligationsForecast = () => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [monthsAhead, setMonthsAhead] = useState(1);
    const [expandedCats, setExpandedCats] = useState(new Set());

    useEffect(() => {
        const fetchForecast = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${API_URL}/obligations/forecast?months_ahead=${monthsAhead}`);
                setForecast(res.data);
                // Auto-expand all categories
                const cats = new Set(res.data.obligations.map(o => o.category));
                setExpandedCats(cats);
            } catch (e) {
                console.error('Failed to fetch forecast', e);
            } finally {
                setLoading(false);
            }
        };
        fetchForecast();
    }, [monthsAhead]);

    const toggleCat = (cat) => {
        setExpandedCats(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const grouped = useMemo(() => {
        if (!forecast) return {};
        return forecast.obligations.reduce((acc, obl) => {
            const cat = obl.category || "Uncategorized";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [forecast]);

    const sortedCategories = Object.keys(grouped).sort();

    const handleExport = () => {
        if (!forecast) return;
        const rows = forecast.obligations.map(o => ({
            Name: o.name,
            Category: o.category,
            Provider: o.provider || '',
            'Forecast Amount': o.forecast_amount,
            'Last Paid': o.last_paid || '',
            'Average (Recent)': o.avg_recent,
            Trend: o.trend,
            Confidence: o.confidence,
            'Data Points': o.data_points,
        }));
        exportToCSV(rows, `forecast_${forecast.forecast_month}.csv`);
    };

    if (loading) return <div className="text-center py-12 text-slate-400 text-sm">Loading forecast...</div>;
    if (!forecast) return <div className="text-center py-12 text-slate-500 text-sm">Could not load forecast data.</div>;

    return (
        <div className="animate-fade-in space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Total Forecast */}
                <div className="bg-gradient-to-br from-blue-900/30 to-slate-900/90 backdrop-blur-sm border border-blue-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">
                        Expected Total
                    </p>
                    <p className="text-2xl font-bold text-white font-mono">{formatCurrency(forecast.total_forecast)}</p>
                    <p className="text-[10px] text-blue-400/60 mt-1">{forecast.forecast_label}</p>
                </div>

                {/* Category Breakdown */}
                <div className="bg-gradient-to-br from-purple-900/20 to-slate-900/90 backdrop-blur-sm border border-purple-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-1">
                        Categories
                    </p>
                    <p className="text-2xl font-bold text-white font-mono">{Object.keys(forecast.by_category).length}</p>
                    <p className="text-[10px] text-purple-400/60 mt-1">{forecast.obligations.length} obligations tracked</p>
                </div>

                {/* Confidence Overview */}
                <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                        Confidence
                    </p>
                    <div className="flex gap-3">
                        {['high', 'medium', 'low'].map(level => {
                            const count = forecast.obligations.filter(o => o.confidence === level).length;
                            const style = CONFIDENCE_STYLES[level];
                            return (
                                <div key={level} className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${style.bg} ${style.border} border`}></span>
                                    <span className={`text-xs ${style.text}`}>{count} {style.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Forecast for:</span>
                    <select
                        value={monthsAhead}
                        onChange={(e) => setMonthsAhead(parseInt(e.target.value))}
                        className="bg-slate-800 text-xs text-gray-300 border border-slate-600 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500"
                    >
                        <option value={1}>Next Month</option>
                        <option value={2}>2 Months Ahead</option>
                        <option value={3}>3 Months Ahead</option>
                    </select>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Category Sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => {
                    const items = grouped[cat];
                    const catTotal = items.reduce((s, o) => s + o.forecast_amount, 0);
                    const isExpanded = expandedCats.has(cat);

                    return (
                        <div key={cat} className="bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCat(cat)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                        <ChevronRight size={14} className="text-slate-500" />
                                    </div>
                                    <h3 className="text-white font-bold text-xs uppercase tracking-wider">{cat}</h3>
                                    <span className="px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded-full text-[10px] font-mono">{items.length}</span>
                                </div>
                                <span className="text-white font-mono text-sm font-semibold">{formatCurrency(catTotal)}</span>
                            </button>

                            {/* Items Table */}
                            {isExpanded && (
                                <div className="animate-fade-in">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-800/30">
                                            <tr className="text-[9px] uppercase font-bold text-slate-500">
                                                <th className="px-4 py-2 w-[30%]">Name</th>
                                                <th className="px-3 py-2 text-right w-[15%]">Forecast</th>
                                                <th className="px-3 py-2 text-right w-[15%]">Last Paid</th>
                                                <th className="px-3 py-2 text-right w-[15%]">Avg Recent</th>
                                                <th className="px-3 py-2 text-center w-[10%]">Trend</th>
                                                <th className="px-3 py-2 text-center w-[15%]">Confidence</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(obl => {
                                                const confStyle = CONFIDENCE_STYLES[obl.confidence] || CONFIDENCE_STYLES.none;
                                                return (
                                                    <tr key={obl.id} className="border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    {obl.provider && <span className="text-[9px] text-slate-500 font-semibold uppercase">{obl.provider}</span>}
                                                                    {obl.provider && <span className="text-slate-600 text-[9px]">·</span>}
                                                                    <span className="font-medium text-white text-sm">{obl.name}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <span className="font-mono text-white text-sm font-semibold">{formatCurrency(obl.forecast_amount)}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <span className="font-mono text-slate-400 text-xs">
                                                                {obl.last_paid ? formatCurrency(obl.last_paid) : '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <span className="font-mono text-slate-400 text-xs">{formatCurrency(obl.avg_recent)}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {TREND_ICONS[obl.trend] || TREND_ICONS.stable}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${confStyle.bg} ${confStyle.text} border ${confStyle.border}`}>
                                                                {confStyle.label}
                                                                <span className="text-[8px] opacity-60">({obl.data_points})</span>
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                {sortedCategories.length === 0 && (
                    <div className="text-center py-16 text-slate-500">
                        <Box size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No forecast data available</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObligationsForecast;
