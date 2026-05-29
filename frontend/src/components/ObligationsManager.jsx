import React, { useState, useMemo } from 'react';
import { formatCurrency } from './UI';
import { CATEGORY_ICONS, CATEGORY_COLORS, CategoryHeader, CategorySectionWrapper } from './categoryStyles';
import { Edit2, Download, Search, Plus, Box } from 'lucide-react';
import { exportToCSV } from '../utils/csvExport';

// --- Category Section (Collapsible) ---
const CategorySection = ({ category, obligations, openObligationModal }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <CategorySectionWrapper category={category}>
            <CategoryHeader
                category={category}
                count={obligations.length}
                isCollapsed={isCollapsed}
                onToggle={() => setIsCollapsed(!isCollapsed)}
            />

            {/* Table */}
            {!isCollapsed && (
                <div className="animate-fade-in">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-slate-800/30">
                            <tr className="text-[8px] uppercase font-bold text-slate-500">
                                <th className="px-4 py-1.5 w-[35%]">Name</th>
                                <th className="px-3 py-1.5 text-center w-[10%]">Due</th>
                                <th className="px-3 py-1.5 w-[35%]">Notes</th>
                                <th className="px-3 py-1.5 text-right w-[20%]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {obligations.map(obl => (
                                <ObligationRow
                                    key={obl.id}
                                    obl={obl}
                                    openObligationModal={openObligationModal}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </CategorySectionWrapper>
    );
};

// --- Main Component ---
const ObligationsManager = ({ obligations, openObligationModal }) => {
    // Search
    const [searchTerm, setSearchTerm] = useState('');

    // Filter by search
    const filteredObligations = useMemo(() => {
        if (!searchTerm) return obligations;
        const q = searchTerm.toLowerCase();
        return obligations.filter(o =>
            o.name.toLowerCase().includes(q) ||
            (o.provider && o.provider.toLowerCase().includes(q)) ||
            (o.category && o.category.toLowerCase().includes(q))
        );
    }, [obligations, searchTerm]);

    // Group by Category
    const grouped = useMemo(() => {
        return filteredObligations.reduce((acc, obl) => {
            const cat = obl.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(obl);
            return acc;
        }, {});
    }, [filteredObligations]);

    const sortedCategories = Object.keys(grouped).sort();

    // Export
    const handleExport = () => {
        const rows = obligations.map(obl => ({
            Category: obl.category || 'Other',
            Provider: obl.provider || '',
            Name: obl.name,
            'Due Day': obl.due_day,
            Notes: obl.notes || ''
        }));
        exportToCSV(rows, `obligations_list.csv`);
    };

    return (
        <div className="animate-fade-in space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-900/30 to-slate-900/90 backdrop-blur-sm border border-blue-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">Total Obligations</p>
                    <p className="text-2xl font-bold text-white font-mono">{obligations.length}</p>
                    <p className="text-[10px] text-blue-400/60 mt-1">{sortedCategories.length} categories</p>
                </div>

                <div className="bg-gradient-to-br from-purple-900/20 to-slate-900/90 backdrop-blur-sm border border-purple-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-1">With Provider</p>
                    <p className="text-2xl font-bold text-white font-mono">{obligations.filter(o => o.provider).length}</p>
                    <p className="text-[10px] text-purple-400/60 mt-1">{obligations.filter(o => !o.provider).length} without provider</p>
                </div>

                <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Due Days</p>
                    <div className="flex gap-3 mt-1">
                        <div className="text-center">
                            <p className="text-xs font-mono text-white font-bold">{obligations.filter(o => o.due_day <= 10).length}</p>
                            <p className="text-[9px] text-slate-500">1st-10th</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-mono text-white font-bold">{obligations.filter(o => o.due_day > 10 && o.due_day <= 20).length}</p>
                            <p className="text-[9px] text-slate-500">11th-20th</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-mono text-white font-bold">{obligations.filter(o => o.due_day > 20).length}</p>
                            <p className="text-[9px] text-slate-500">21st-31st</p>
                        </div>
                    </div>
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

            {/* Category Sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => (
                    <CategorySection
                        key={cat}
                        category={cat}
                        obligations={grouped[cat]}
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
