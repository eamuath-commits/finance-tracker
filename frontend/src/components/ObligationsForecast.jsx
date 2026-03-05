import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, Modal } from './UI';
import TransactionSelectorModal from './TransactionSelectorModal';
import {
    TrendingUp, TrendingDown, Minus, CheckCircle,
    Download, ChevronDown, ChevronRight, Box, Edit3, DollarSign, X, Link2, LinkIcon, List, Trash2
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

const getBillingDateStr = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-01`;
};

// --- Inline Edit Popover ---
const EditPopover = ({ obl, monthData, billingDate, onSave, onClose, onLink, onDelete }) => {
    const [amount, setAmount] = useState(monthData?.amount || '');
    const [status, setStatus] = useState(monthData?.isPaid ? 'PAID' : 'BUDGET');

    const handleSave = () => {
        const val = parseFloat(amount);
        // If amount is blank or zero and there's an existing payment, delete it
        if ((!amount || amount === '' || (val === 0) || isNaN(val)) && monthData?.paymentId) {
            onSave(obl.id, 0, billingDate, 'DELETE');
            onClose();
            return;
        }
        if (isNaN(val) || val <= 0) return;
        onSave(obl.id, val, billingDate, status);
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

            {/* Amount */}
            <div>
                <label className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Amount</label>
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

            {/* Status */}
            <div>
                <label className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Status</label>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => setStatus('PAID')}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition ${status === 'PAID'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                    >
                        ✓ Paid
                    </button>
                    <button
                        onClick={() => setStatus('BUDGET')}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition ${status === 'BUDGET'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                    >
                        Budget
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={handleSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg transition shadow-sm"
                >
                    Save
                </button>
                <button
                    onClick={() => { onClose(); onLink(obl, billingDate); }}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-2.5 rounded-lg transition shadow-sm flex items-center gap-1"
                    title="Link to Transaction"
                >
                    <Link2 size={12} /> Link
                </button>
            </div>
        </div>
    );
};

const ObligationsForecast = ({ categoryFilter, obligations = [], payments = {}, monthOffset = 0, periodStartDay = 1, openPaymentModal, handleQuickPay, onRefresh }) => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedCats, setExpandedCats] = useState(new Set());
    const [editingCell, setEditingCell] = useState(null); // { oblId, monthKey }

    // --- Link Transaction State ---
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showBrowseModal, setShowBrowseModal] = useState(false);
    const [linkingObl, setLinkingObl] = useState(null);
    const [linkingBillingDate, setLinkingBillingDate] = useState(null);
    const [suggestedTxs, setSuggestedTxs] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // Helper: get period date range label based on periodStartDay
    const getPeriodRange = (offset) => {
        if (periodStartDay === 1) return null;
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, periodStartDay);
        const endDay = periodStartDay - 1;
        const curMonth = new Date(d.getFullYear(), d.getMonth(), endDay);
        const fmtShort = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmtShort(prevMonth)} → ${fmtShort(curMonth)}`;
    };

    const months = useMemo(() => [
        { offset: monthOffset - 1, label: getMonthLabel(monthOffset - 1), short: getMonthShort(monthOffset - 1), key: getMonthKey(monthOffset - 1), billingDate: getBillingDateStr(monthOffset - 1), periodRange: getPeriodRange(monthOffset - 1), isPrev: true, isSelected: false, isNext: false },
        { offset: monthOffset, label: getMonthLabel(monthOffset), short: getMonthShort(monthOffset), key: getMonthKey(monthOffset), billingDate: getBillingDateStr(monthOffset), periodRange: getPeriodRange(monthOffset), isPrev: false, isSelected: true, isNext: false },
        { offset: monthOffset + 1, label: getMonthLabel(monthOffset + 1), short: getMonthShort(monthOffset + 1), key: getMonthKey(monthOffset + 1), billingDate: getBillingDateStr(monthOffset + 1), periodRange: getPeriodRange(monthOffset + 1), isPrev: false, isSelected: false, isNext: true },
    ], [monthOffset, periodStartDay]);

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
                const isPaid = monthPayments.length > 0;
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
                    await axios.delete(`${API_URL}/obligations/history/${existing.id}`);
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
            await axios.delete(`${API_URL}/obligations/history/${paymentId}`);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Error deleting payment:', err);
            alert('Failed to delete payment');
        }
    };

    // --- Link Transaction Functions ---
    const openLinkFlow = async (obl, billingDate) => {
        setLinkingObl(obl);
        setLinkingBillingDate(billingDate);
        setShowLinkModal(true);
        setLoadingSuggestions(true);
        setSuggestedTxs([]);

        try {
            // Find existing payment for this obl+month to get suggestions,
            // or search transactions by obligation amount/name
            const oblPayments = payments[obl.id] || [];
            const monthKey = billingDate.substring(0, 7);
            const existingPayment = oblPayments.find(p => (p.billing_month || '').startsWith(monthKey));

            if (existingPayment) {
                const res = await axios.get(`${API_URL}/payments/${existingPayment.id}/suggested-transactions`).catch(() => ({ data: [] }));
                setSuggestedTxs(res.data);
            } else {
                // No payment yet — search by obligation name/amount
                const params = new URLSearchParams();
                params.set('query', obl.provider || obl.name);
                params.set('type', 'debit');
                params.set('limit', '10');
                const res = await axios.get(`${API_URL}/transactions/search?${params}`).catch(() => ({ data: [] }));
                setSuggestedTxs((res.data || []).map(tx => ({
                    transaction_id: tx.id,
                    merchant: tx.merchant,
                    amount: tx.amount,
                    date: tx.timestamp,
                    score: 0,
                    reasons: ['name_search'],
                    already_linked: !!tx.linked_to_payment_id
                })));
            }
        } catch (err) {
            console.error('Error fetching suggestions:', err);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleLinkTransaction = async (transactionId) => {
        if (!linkingObl) return;
        try {
            const tx = suggestedTxs.find(t => t.transaction_id === transactionId);
            const amount = tx?.amount || 0;

            // Use the transaction date as payment date
            const txDate = tx?.date ? new Date(tx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            // Create a PAID payment for this obligation+month
            const payRes = await axios.post(`${API_URL}/obligations/${linkingObl.id}/payments`, {
                amount: amount,
                billing_month: linkingBillingDate,
                status: 'Paid',
                payment_date: txDate
            });

            // Link the transaction to the newly created payment
            const paymentId = payRes.data?.id;
            if (paymentId) {
                await axios.post(`${API_URL}/payments/${paymentId}/link-transaction?transaction_id=${transactionId}`);
            }

            setShowLinkModal(false);
            setLinkingObl(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Error linking transaction:', err);
            alert('Failed to link transaction');
        }
    };

    const handleBrowseLink = async (transactionIds) => {
        if (!linkingObl || !transactionIds.length) return;
        try {
            const txId = transactionIds[0];

            // Fetch transaction details to get amount and date
            const searchRes = await axios.get(`${API_URL}/transactions/search?limit=50`).catch(() => ({ data: [] }));
            const txData = (searchRes.data || []).find(t => t.id === txId);
            const amount = txData?.amount || 0;
            const txDate = txData?.timestamp ? new Date(txData.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            // Create a PAID payment for this obligation+month
            const payRes = await axios.post(`${API_URL}/obligations/${linkingObl.id}/payments`, {
                amount: amount,
                billing_month: linkingBillingDate,
                status: 'Paid',
                payment_date: txDate
            });

            // Link the transaction to the newly created payment
            const paymentId = payRes.data?.id;
            if (paymentId) {
                await axios.post(`${API_URL}/payments/${paymentId}/link-transaction?transaction_id=${txId}`);
            }

            setShowBrowseModal(false);
            setLinkingObl(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Error linking from browse:', err);
            alert('Failed to link transaction');
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
                            onLink={openLinkFlow}
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
                            onLink={openLinkFlow}
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
                            onLink={openLinkFlow}
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
                        onLink={openLinkFlow}
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
                <div className="overflow-x-auto">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] bg-slate-800/70 border-b border-slate-700/40">
                        <div className="px-5 py-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                            Category / Obligation
                        </div>
                        {months.map(m => (
                            <div
                                key={m.key}
                                className={`px-3 py-3 text-center text-[10px] uppercase tracking-widest font-bold ${m.isSelected
                                    ? 'text-blue-400 bg-blue-500/5 border-x border-blue-500/10'
                                    : m.isPrev
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
                                        className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] cursor-pointer hover:bg-slate-800/40 transition-colors"
                                        onClick={() => toggleCat(cat)}
                                    >
                                        <div className="px-5 py-2.5 flex items-center gap-2.5">
                                            <div className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                                <ChevronDown size={13} className="text-slate-500" />
                                            </div>
                                            <span className="text-white text-[12px] font-semibold">{cat}</span>
                                            <span className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded font-mono">{items.length}</span>
                                        </div>
                                        {months.map(m => (
                                            <div
                                                key={m.key}
                                                className={`px-3 py-2.5 ${m.isSelected ? 'bg-blue-500/[0.03] border-x border-blue-500/10' : ''}`}
                                            />
                                        ))}
                                    </div>

                                    {/* Expanded Items */}
                                    {isExpanded && (
                                        <div className="bg-slate-900/30">
                                            {items.map((obl, oblIdx) => (
                                                <div
                                                    key={obl.id}
                                                    className={`grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] hover:bg-slate-800/25 transition-colors ${oblIdx < items.length - 1 ? 'border-b border-slate-800/40' : ''
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
                                                    {months.map(m => {
                                                        const data = oblMonthData[obl.id]?.[m.key];
                                                        return (
                                                            <div
                                                                key={m.key}
                                                                className={`px-3 py-2.5 flex items-center justify-end ${m.isSelected ? 'bg-blue-500/[0.02] border-x border-blue-500/10' : ''
                                                                    }`}
                                                            >
                                                                <AmountCell obl={obl} data={data} month={m} />
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
                        <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] bg-slate-800/50 border-t-2 border-slate-600/30">
                            <div className="px-5 py-4">
                                <span className="text-white text-[12px] font-bold uppercase tracking-wider">Total</span>
                            </div>
                            {months.map(m => (
                                <div
                                    key={m.key}
                                    className={`px-3 py-4 text-right ${m.isSelected ? 'bg-blue-500/[0.05] border-x border-blue-500/15' : ''
                                        }`}
                                >
                                    <span className={`font-mono text-[13px] font-bold ${m.isSelected ? 'text-blue-300' : m.isPrev ? 'text-emerald-300' : 'text-white'
                                        }`}>
                                        {formatCurrency(columnTotals[m.key] || 0)}
                                    </span>
                                </div>
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

            {/* Link Transaction Modal */}
            <Modal isOpen={showLinkModal} title="Link to Transaction" onClose={() => setShowLinkModal(false)}>
                <div className="space-y-4">
                    {linkingObl && (
                        <div className="bg-slate-700/50 p-3 rounded-lg text-sm">
                            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Obligation</div>
                            <div className="text-white font-semibold">{linkingObl.name}</div>
                            {linkingObl.provider && <div className="text-slate-500 text-xs">{linkingObl.provider}</div>}
                            <div className="text-slate-500 text-xs mt-1">{linkingBillingDate}</div>
                        </div>
                    )}

                    <div className="text-slate-400 text-xs uppercase font-bold">Suggested Transactions</div>

                    {loadingSuggestions ? (
                        <div className="text-center py-8 text-slate-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            Finding matching transactions...
                        </div>
                    ) : suggestedTxs.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {suggestedTxs.map(tx => (
                                <div
                                    key={tx.transaction_id}
                                    className={`p-3 rounded-lg border cursor-pointer transition ${tx.already_linked
                                        ? 'bg-emerald-500/10 border-emerald-500/30'
                                        : 'bg-slate-700/50 border-slate-600 hover:border-purple-500 hover:bg-purple-500/10'
                                        }`}
                                    onClick={() => !tx.already_linked && handleLinkTransaction(tx.transaction_id)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-white font-semibold text-sm">{tx.merchant || 'Unknown'}</div>
                                            <div className="text-slate-400 text-xs">
                                                {tx.date ? new Date(tx.date).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-emerald-400 font-mono text-sm">{formatCurrency(tx.amount)}</div>
                                            {tx.already_linked ? (
                                                <span className="text-emerald-400 text-[10px] flex items-center gap-1 justify-end">
                                                    <CheckCircle size={10} /> Linked
                                                </span>
                                            ) : tx.score > 0 ? (
                                                <div className="text-[10px] text-purple-400">Score: {tx.score}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                    {tx.reasons && tx.reasons.length > 0 && (
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {tx.reasons.map(r => (
                                                <span key={r} className="bg-slate-600/50 text-slate-400 text-[9px] px-1.5 py-0.5 rounded">
                                                    {r.replace('_', ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <LinkIcon className="mx-auto mb-2 opacity-30" size={32} />
                            <div>No matching transactions found.</div>
                            <div className="text-xs mt-1">Try Browse All to find manually.</div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={() => { setShowLinkModal(false); setShowBrowseModal(true); }}
                            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                        >
                            <List size={14} /> Browse All Transactions
                        </button>
                        <button
                            onClick={() => setShowLinkModal(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Browse All Transactions Modal */}
            <TransactionSelectorModal
                isOpen={showBrowseModal}
                onClose={() => { setShowBrowseModal(false); setLinkingObl(null); }}
                onSelect={handleBrowseLink}
                currentLinked={[]}
                title={`Link Transaction to ${linkingObl?.name || 'Obligation'}`}
            />
        </div>
    );
};

export default ObligationsForecast;
