import React, { useState, useMemo } from 'react';
import { formatCurrency } from './UI';
import { CategoryHeader, CategorySectionWrapper } from './categoryStyles';
import { Edit2, Download, Search, Plus, Box, Check, Wallet } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

// The current calendar month — the Manager view always shows "this month".
const monthNow = () => {
    const now = new Date();
    return {
        y: now.getFullYear(),
        m: now.getMonth(),
        day: now.getDate(),
        billing: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    };
};

// Did this obligation get a payment THIS month, and of what kind?
// PAID = actually paid, BUDGET = planned/set-aside, none = still due.
const statusFor = (obl, payments) => {
    const { y, m } = monthNow();
    const list = payments?.[obl.id] || [];
    const match = list.find(p => {
        if (p.billing_month) {
            const [py, pm] = p.billing_month.split('-').map(Number);
            return (pm - 1) === m && py === y;
        }
        if (p.payment_date) {
            const d = new Date(p.payment_date);
            return d.getMonth() === m && d.getFullYear() === y;
        }
        return false;
    });
    const status = match?.status || null;
    return {
        paid: status === 'PAID',
        budget: status === 'BUDGET',
        paidAmount: status === 'PAID' ? Number(match.amount || 0) : 0,
    };
};

// --- One obligation row ---
const ObligationRow = ({ obl, payments, openObligationModal, onPay }) => {
    const st = statusFor(obl, payments);
    const { day } = monthNow();
    const pastDue = !st.paid && !st.budget && obl.due_day && obl.due_day < day;

    const badge =
        st.paid ? 'bg-emerald-500/10 text-emerald-400'
        : pastDue ? 'bg-red-500/10 text-red-400'
        : st.budget ? 'bg-blue-500/10 text-blue-400'
        : 'bg-slate-700/50 text-slate-400';

    return (
        <div className="flex items-center gap-3 px-3 md:px-4 py-2 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/40 transition-colors group">
            {/* Due-day badge */}
            <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex flex-col items-center justify-center ${badge}`} title={`Due day ${obl.due_day || '?'}`}>
                <span className="text-[13px] font-bold font-mono leading-none">{obl.due_day || '?'}</span>
                <span className="text-[7px] uppercase tracking-wide opacity-70 leading-none mt-0.5">day</span>
            </div>

            {/* Name + provider (+ notes) */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    {obl.provider && <span className="text-[9px] text-slate-500 font-semibold uppercase">{obl.provider}</span>}
                    {obl.provider && <span className="text-slate-600 text-[8px]">·</span>}
                    <span className="text-sm text-white font-medium truncate">{obl.name}</span>
                </div>
                {obl.notes && <span className="text-[10px] text-slate-500 truncate block max-w-[240px]">{obl.notes}</span>}
            </div>

            {/* Amount */}
            <div className="flex-shrink-0 w-24 text-right">
                {obl.amount ? (
                    <span className="text-sm font-mono text-slate-200">{formatCurrency(obl.amount)}</span>
                ) : (
                    <span className="text-[11px] text-slate-600 italic">no amount</span>
                )}
            </div>

            {/* Status pill */}
            <div className="flex-shrink-0 w-[76px] flex justify-end">
                {st.paid ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
                        <Check size={10} /> Paid
                    </span>
                ) : st.budget ? (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2 py-0.5">Budgeted</span>
                ) : (
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${pastDue ? 'text-red-400 bg-red-500/10 border-red-500/25' : 'text-slate-400 bg-slate-700/40 border-slate-600/40'}`}>
                        {pastDue ? 'Overdue' : 'Due'}
                    </span>
                )}
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 w-[68px] flex items-center justify-end gap-1">
                {!st.paid && (
                    <button
                        onClick={() => onPay(obl)}
                        className="text-[10px] font-semibold text-blue-300 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded px-2 py-1 transition"
                        title="Log a payment for this month"
                    >
                        Pay
                    </button>
                )}
                <button
                    onClick={() => openObligationModal(obl)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-blue-400 p-1 rounded transition"
                    title="Edit"
                >
                    <Edit2 size={12} />
                </button>
            </div>
        </div>
    );
};

// --- Collapsible category section (single table, no repeated column header) ---
const CategorySection = ({ category, obligations, subtotal, paidCount, payments, openObligationModal, onPay }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const rows = useMemo(
        () => [...obligations].sort((a, b) => (a.due_day || 99) - (b.due_day || 99)),
        [obligations]
    );

    return (
        <CategorySectionWrapper category={category}>
            <CategoryHeader
                category={category}
                count={obligations.length}
                isCollapsed={isCollapsed}
                onToggle={() => setIsCollapsed(!isCollapsed)}
                rightContent={
                    <div className="flex items-center gap-3">
                        {paidCount > 0 && (
                            <span className="text-[9px] text-emerald-400/80">{paidCount}/{obligations.length} paid</span>
                        )}
                        <span className="text-[11px] font-mono text-slate-300">{formatCurrency(subtotal)}<span className="text-slate-600 text-[9px]">/mo</span></span>
                    </div>
                }
            />
            {!isCollapsed && (
                <div className="animate-fade-in">
                    {rows.map(obl => (
                        <ObligationRow
                            key={obl.id}
                            obl={obl}
                            payments={payments}
                            openObligationModal={openObligationModal}
                            onPay={onPay}
                        />
                    ))}
                </div>
            )}
        </CategorySectionWrapper>
    );
};

// --- Main component ---
const ObligationsManager = ({ obligations, openObligationModal, payments = {}, openPaymentModal }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredObligations = useMemo(() => {
        if (!searchTerm) return obligations;
        const q = searchTerm.toLowerCase();
        return obligations.filter(o =>
            o.name.toLowerCase().includes(q) ||
            (o.provider && o.provider.toLowerCase().includes(q)) ||
            (o.category && o.category.toLowerCase().includes(q))
        );
    }, [obligations, searchTerm]);

    // This-month money summary: committed = sum of expected amounts,
    // paid = sum of PAID payments this month, left = the difference.
    const totals = useMemo(() => {
        let committed = 0, paid = 0;
        filteredObligations.forEach(o => {
            committed += Number(o.amount || 0);
            paid += statusFor(o, payments).paidAmount;
        });
        return { committed, paid, remaining: Math.max(0, committed - paid) };
    }, [filteredObligations, payments]);

    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || 'Other';
            (acc[cat] = acc[cat] || []).push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    const catTotal = (cat) => grouped[cat].reduce((s, o) => s + Number(o.amount || 0), 0);
    const catPaidCount = (cat) => grouped[cat].filter(o => statusFor(o, payments).paid).length;

    // Biggest commitments first — "where the money goes" order.
    const sortedCategories = useMemo(
        () => Object.keys(grouped).sort((a, b) => catTotal(b) - catTotal(a)),
        [grouped]
    );

    const paidPct = totals.committed > 0 ? Math.min(100, (totals.paid / totals.committed) * 100) : 0;

    const handleExport = () => {
        const rows = obligations.map(obl => ({
            Category: obl.category || 'Other',
            Provider: obl.provider || '',
            Name: obl.name,
            'Due Day': obl.due_day,
            Amount: obl.amount || '',
            Notes: obl.notes || '',
        }));
        exportToCSV(rows, `obligations_list.csv`);
    };

    const onPay = (obl) => {
        if (openPaymentModal) openPaymentModal(obl, monthNow().billing, obl.amount ?? null);
    };

    return (
        <div className="animate-fade-in space-y-4">
            {/* This-month money summary */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/90 border border-slate-700/50 rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                        <Wallet size={12} className="text-blue-400" /> This month
                    </span>
                    <span className="text-[10px] text-slate-500">{obligations.length} obligations · {sortedCategories.length} categories</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Committed</p>
                        <p className="text-xl font-bold text-white font-mono">{formatCurrency(totals.committed)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-emerald-500/70 uppercase tracking-wide mb-0.5">Paid</p>
                        <p className="text-xl font-bold text-emerald-400 font-mono">{formatCurrency(totals.paid)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-amber-500/70 uppercase tracking-wide mb-0.5">Left</p>
                        <p className="text-xl font-bold text-amber-400 font-mono">{formatCurrency(totals.remaining)}</p>
                    </div>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => openObligationModal(null)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-sm transition hover:shadow-blue-500/20"
                    >
                        <Plus size={14} /> Add Obligation
                    </button>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-800/80 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition w-48"
                        />
                    </div>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                >
                    <Download size={14} /> Export
                </button>
            </div>

            {/* Category sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => (
                    <CategorySection
                        key={cat}
                        category={cat}
                        obligations={grouped[cat]}
                        subtotal={catTotal(cat)}
                        paidCount={catPaidCount(cat)}
                        payments={payments}
                        openObligationModal={openObligationModal}
                        onPay={onPay}
                    />
                ))}

                {sortedCategories.length === 0 && (
                    <div className="text-center py-16 text-slate-500">
                        <Box size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No obligations found</p>
                        {searchTerm && <p className="text-xs mt-1">Try a different search term</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObligationsManager;
