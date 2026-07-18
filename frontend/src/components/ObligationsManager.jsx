import React, { useState, useMemo } from 'react';
import { CategoryHeader, CategorySectionWrapper } from './categoryStyles';
import { Edit2, Download, Search, Plus, Box, Wallet } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

// The Manager view DEFINES the obligations — what exists, when it is due, who
// bills it and which envelope funds it. Deliberately no money: amounts, paid
// state and the pay action live in the Payments view, which is the per-month
// money screen. Keeping the two apart is what stops the same figure being
// reported two different ways.

// --- One obligation row (definition only) ---
const ObligationRow = ({ obl, envelopeName, openObligationModal }) => (
    <div className="flex items-center gap-3 px-3 md:px-4 py-2 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/40 transition-colors group">
        {/* Due day */}
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-700/50 text-slate-300 flex flex-col items-center justify-center"
             title={`Due on day ${obl.due_day || '?'} of the month`}>
            <span className="text-[13px] font-bold font-mono leading-none">{obl.due_day || '?'}</span>
            <span className="text-[7px] uppercase tracking-wide opacity-60 leading-none mt-0.5">day</span>
        </div>

        {/* Name + provider */}
        <div className="flex-1 min-w-0">
            <span className="text-sm text-white font-medium truncate block">{obl.name}</span>
            {obl.provider && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{obl.provider}</span>
            )}
        </div>

        {/* Envelope that funds it (obligation.target_account_id) */}
        <div className="flex-shrink-0 w-32 hidden sm:block">
            {envelopeName ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 rounded-full px-2 py-0.5 max-w-full">
                    <Wallet size={9} className="flex-shrink-0" />
                    <span className="truncate">{envelopeName}</span>
                </span>
            ) : (
                <span className="text-[10px] text-slate-600 italic">no envelope</span>
            )}
        </div>

        {/* Notes */}
        <div className="flex-shrink-0 w-40 hidden lg:block">
            <span className="text-[11px] text-slate-500 truncate block" title={obl.notes || ''}>
                {obl.notes || '—'}
            </span>
        </div>

        {/* Edit */}
        <div className="flex-shrink-0 w-8 flex justify-end">
            <button
                onClick={() => openObligationModal(obl)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-blue-400 p-1 rounded transition"
                title="Edit definition"
            >
                <Edit2 size={12} />
            </button>
        </div>
    </div>
);

// --- Collapsible category section ---
const CategorySection = ({ category, obligations, envelopeFor, openObligationModal }) => {
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
            />
            {!isCollapsed && (
                <div className="animate-fade-in">
                    {rows.map(obl => (
                        <ObligationRow
                            key={obl.id}
                            obl={obl}
                            envelopeName={envelopeFor(obl)}
                            openObligationModal={openObligationModal}
                        />
                    ))}
                </div>
            )}
        </CategorySectionWrapper>
    );
};

// --- Main component ---
const ObligationsManager = ({ obligations, openObligationModal, accounts = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const accountNames = useMemo(() => {
        const m = {};
        (accounts || []).forEach(a => { m[a.id] = a.name; });
        return m;
    }, [accounts]);

    const envelopeFor = (obl) => (obl.target_account_id ? accountNames[obl.target_account_id] : null);

    const filteredObligations = useMemo(() => {
        if (!searchTerm) return obligations;
        const q = searchTerm.toLowerCase();
        return obligations.filter(o =>
            o.name.toLowerCase().includes(q) ||
            (o.provider && o.provider.toLowerCase().includes(q)) ||
            (o.category && o.category.toLowerCase().includes(q))
        );
    }, [obligations, searchTerm]);

    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || 'Other';
            (acc[cat] = acc[cat] || []).push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    // Alphabetical: a definition list should be predictable to scan, not ranked.
    const sortedCategories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    const handleExport = () => {
        const rows = obligations.map(obl => ({
            Category: obl.category || 'Other',
            Provider: obl.provider || '',
            Name: obl.name,
            'Due Day': obl.due_day,
            Envelope: envelopeFor(obl) || '',
            Notes: obl.notes || '',
        }));
        exportToCSV(rows, `obligations_list.csv`);
    };

    return (
        <div className="animate-fade-in space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
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
                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500">
                        {obligations.length} obligation{obligations.length !== 1 ? 's' : ''} · {sortedCategories.length} categories
                    </span>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs py-2 px-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition"
                    >
                        <Download size={14} /> Export
                    </button>
                </div>
            </div>

            {/* Category sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => (
                    <CategorySection
                        key={cat}
                        category={cat}
                        obligations={grouped[cat]}
                        envelopeFor={envelopeFor}
                        openObligationModal={openObligationModal}
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
