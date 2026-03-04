import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from './UI';
import {
    TrendingUp, TrendingDown, Minus, CheckCircle,
    BarChart3, Download, ChevronRight, Box, Calendar
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

// Helper to get month name + year from an offset
const getMonthLabel = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getMonthKey = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// --- Month Column ---
const MonthColumn = ({ label, monthKey, isCurrentMonth, isPast, obligations, payments, forecast, categoryFilter, expandedCats, toggleCat }) => {
    // Determine data per obligation
    const oblData = useMemo(() => {
        const result = [];
        obligations.forEach(obl => {
            if (categoryFilter && obl.category !== categoryFilter) return;

            // Check if paid in this month
            const oblPayments = payments[obl.id] || [];
            const monthPayments = oblPayments.filter(p => {
                const billingMonth = p.billing_month || '';
                return billingMonth.startsWith(monthKey) && p.status !== 'BUDGET';
            });
            const isPaid = monthPayments.length > 0;
            const paidAmount = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

            // Forecast amount for this obligation
            const forecastObl = forecast?.obligations?.find(f => f.id === obl.id);
            const forecastAmount = forecastObl?.forecast_amount || 0;
            const trend = forecastObl?.trend || 'stable';
            const confidence = forecastObl?.confidence || 'none';

            result.push({
                ...obl,
                isPaid,
                paidAmount,
                forecastAmount,
                displayAmount: isPaid ? paidAmount : forecastAmount,
                trend,
                confidence,
            });
        });
        return result;
    }, [obligations, payments, forecast, monthKey, categoryFilter]);

    // Group by category
    const grouped = useMemo(() => {
        return oblData.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [oblData]);

    const sortedCats = Object.keys(grouped).sort();
    const totalAmount = oblData.reduce((s, o) => s + o.displayAmount, 0);
    const paidCount = oblData.filter(o => o.isPaid).length;

    // Color scheme based on past/current/future
    let headerGradient = 'from-slate-800/90 to-slate-900/90';
    let headerBorder = 'border-slate-700/50';
    let labelColor = 'text-slate-400';
    if (isCurrentMonth) {
        headerGradient = 'from-blue-900/30 to-slate-900/90';
        headerBorder = 'border-blue-500/25';
        labelColor = 'text-blue-400';
    } else if (isPast) {
        headerGradient = 'from-emerald-900/20 to-slate-900/90';
        headerBorder = 'border-emerald-500/20';
        labelColor = 'text-emerald-400';
    }

    return (
        <div className={`bg-gradient-to-br ${headerGradient} backdrop-blur-sm border ${headerBorder} rounded-xl overflow-hidden shadow-lg`}>
            {/* Month Header */}
            <div className="px-4 py-3 border-b border-slate-700/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className={labelColor} />
                        <h3 className={`font-bold text-sm ${isCurrentMonth ? 'text-blue-300' : isPast ? 'text-emerald-300' : 'text-slate-300'}`}>
                            {label}
                        </h3>
                        {isCurrentMonth && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold uppercase border border-blue-500/30">Current</span>
                        )}
                        {isPast && (
                            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold uppercase border border-emerald-500/25">Past</span>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-white font-mono font-bold text-sm">{formatCurrency(totalAmount)}</p>
                        <p className={`text-[9px] ${labelColor}`}>
                            {isPast ? `${paidCount}/${oblData.length} paid` : `${oblData.length} obligations`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Category Sections */}
            <div className="divide-y divide-slate-700/20">
                {sortedCats.map(cat => {
                    const items = grouped[cat];
                    const catTotal = items.reduce((s, o) => s + o.displayAmount, 0);
                    const catKey = `${monthKey}-${cat}`;
                    const isExpanded = expandedCats.has(catKey);

                    return (
                        <div key={cat}>
                            <button
                                onClick={() => toggleCat(catKey)}
                                className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                        <ChevronRight size={12} className="text-slate-600" />
                                    </div>
                                    <span className="text-white text-xs font-semibold">{cat}</span>
                                    <span className="text-[9px] text-slate-500 font-mono">{items.length}</span>
                                </div>
                                <span className="text-white font-mono text-xs">{formatCurrency(catTotal)}</span>
                            </button>

                            {isExpanded && (
                                <div className="bg-slate-900/50 animate-fade-in">
                                    {items.map(obl => {
                                        const confStyle = CONFIDENCE_STYLES[obl.confidence] || CONFIDENCE_STYLES.none;
                                        return (
                                            <div key={obl.id} className="flex items-center justify-between px-6 py-2 border-t border-slate-700/15 hover:bg-slate-800/30 transition-colors">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    {obl.isPaid ? (
                                                        <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
                                                    ) : (
                                                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${confStyle.bg} ${confStyle.border} border`} />
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            {obl.provider && <span className="text-[8px] text-slate-500 uppercase">{obl.provider}</span>}
                                                            {obl.provider && <span className="text-slate-700 text-[8px]">·</span>}
                                                            <span className="text-white text-xs truncate">{obl.name}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!isPast && !obl.isPaid && TREND_ICONS[obl.trend]}
                                                    <span className={`font-mono text-xs font-medium ${obl.isPaid ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                        {formatCurrency(obl.displayAmount)}
                                                    </span>
                                                    {obl.isPaid && (
                                                        <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">PAID</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {sortedCats.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                        <p className="text-xs">No obligations</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Forecast Component ---
const ObligationsForecast = ({ categoryFilter, obligations = [], payments = {} }) => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedCats, setExpandedCats] = useState(new Set());

    // Fetch forecast for next month (used for trend/confidence data)
    useEffect(() => {
        const fetchForecast = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${API_URL}/obligations/forecast?months_ahead=1`);
                setForecast(res.data);
                // Auto-expand current month categories
                const currentMonthKey = getMonthKey(0);
                const cats = new Set(
                    (res.data.obligations || []).map(o => `${currentMonthKey}-${o.category}`)
                );
                setExpandedCats(cats);
            } catch (e) {
                console.error('Failed to fetch forecast', e);
            } finally {
                setLoading(false);
            }
        };
        fetchForecast();
    }, []);

    const toggleCat = (catKey) => {
        setExpandedCats(prev => {
            const next = new Set(prev);
            if (next.has(catKey)) next.delete(catKey);
            else next.add(catKey);
            return next;
        });
    };

    // Define months: previous, current, next, +2
    const months = [
        { offset: -1, label: getMonthLabel(-1), key: getMonthKey(-1), isPast: true, isCurrent: false },
        { offset: 0, label: getMonthLabel(0), key: getMonthKey(0), isPast: false, isCurrent: true },
        { offset: 1, label: getMonthLabel(1), key: getMonthKey(1), isPast: false, isCurrent: false },
        { offset: 2, label: getMonthLabel(2), key: getMonthKey(2), isPast: false, isCurrent: false },
    ];

    // Filter obligations by category
    const filteredObligations = useMemo(() => {
        if (!categoryFilter) return obligations;
        return obligations.filter(o => o.category === categoryFilter);
    }, [obligations, categoryFilter]);

    // Compute totals per month for summary
    const monthTotals = useMemo(() => {
        return months.map(m => {
            let total = 0;
            filteredObligations.forEach(obl => {
                const oblPayments = payments[obl.id] || [];
                const monthPayments = oblPayments.filter(p => {
                    const bm = p.billing_month || '';
                    return bm.startsWith(m.key) && p.status !== 'BUDGET';
                });
                const isPaid = monthPayments.length > 0;
                const paidAmount = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
                const forecastObl = forecast?.obligations?.find(f => f.id === obl.id);
                total += isPaid ? paidAmount : (forecastObl?.forecast_amount || 0);
            });
            return { ...m, total };
        });
    }, [months, filteredObligations, payments, forecast]);

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

    return (
        <div className="animate-fade-in space-y-4">
            {/* Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {monthTotals.map(m => (
                    <div key={m.key} className={`rounded-xl p-3 border shadow-lg ${m.isCurrent
                            ? 'bg-gradient-to-br from-blue-900/30 to-slate-900/90 border-blue-500/25'
                            : m.isPast
                                ? 'bg-gradient-to-br from-emerald-900/20 to-slate-900/90 border-emerald-500/20'
                                : 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-700/50'
                        }`}>
                        <p className={`text-[9px] uppercase tracking-wider font-bold mb-0.5 ${m.isCurrent ? 'text-blue-400' : m.isPast ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                            {m.label}
                        </p>
                        <p className="text-lg font-bold text-white font-mono">{formatCurrency(m.total)}</p>
                    </div>
                ))}
            </div>

            {/* Export */}
            <div className="flex justify-end">
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Month Columns */}
            <div className="space-y-4">
                {months.map(m => (
                    <MonthColumn
                        key={m.key}
                        label={m.label}
                        monthKey={m.key}
                        isCurrentMonth={m.isCurrent}
                        isPast={m.isPast}
                        obligations={filteredObligations}
                        payments={payments}
                        forecast={forecast}
                        categoryFilter={categoryFilter}
                        expandedCats={expandedCats}
                        toggleCat={toggleCat}
                    />
                ))}
            </div>
        </div>
    );
};

export default ObligationsForecast;
