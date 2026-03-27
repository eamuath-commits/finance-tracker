import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Layers, ArrowRight, ChevronRight, CheckCircle, AlertTriangle, Search } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const CATEGORY_COLORS = {
    "Salary": "border-emerald-500/40",
    "House": "border-blue-500/40",
    "Utilities": "border-yellow-500/40",
    "Auto Loan": "border-red-500/40",
    "Food & Groceries": "border-orange-500/40",
    "Telecom": "border-cyan-500/40",
    "Insurance": "border-purple-500/40",
    "Subscription": "border-pink-500/40",
    "Loan": "border-rose-500/40",
    "Credit Card": "border-pink-500/40",
    "Pay Later": "border-amber-500/40",
    "Personal Expense": "border-slate-500/40",
    "School": "border-indigo-500/40",
    "Other": "border-gray-500/40"
};

const AllocationRules = ({ accounts }) => {
    const [obligations, setObligations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null); // obligation ID being saved
    const [searchTerm, setSearchTerm] = useState('');
    const [collapsedCats, setCollapsedCats] = useState(new Set());

    const fetchData = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            setObligations(res.data);
        } catch (error) {
            console.error("Error fetching obligations", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAssignAccount = async (obligationId, targetAccountId) => {
        setSaving(obligationId);
        try {
            await axios.put(`${API_URL}/obligations/${obligationId}`, {
                target_account_id: targetAccountId || null
            });
            // Update local state immediately
            setObligations(prev => prev.map(obl =>
                obl.id === obligationId
                    ? {
                        ...obl,
                        target_account_id: targetAccountId || null,
                        target_account_name: targetAccountId
                            ? accounts.find(a => a.id === targetAccountId)?.name || null
                            : null
                    }
                    : obl
            ));
        } catch (error) {
            console.error("Error assigning account:", error);
            alert("Failed to assign account");
        } finally {
            setSaving(null);
        }
    };

    // Bulk assign: set all obligations in a category to the same target
    const handleBulkAssign = async (category, targetAccountId) => {
        const catObligations = obligations.filter(o => (o.category || 'Other') === category);
        for (const obl of catObligations) {
            await handleAssignAccount(obl.id, targetAccountId);
        }
    };

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

    // Stats
    const assignedCount = obligations.filter(o => o.target_account_id).length;
    const totalCount = obligations.length;

    const toggleCat = (cat) => {
        setCollapsedCats(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    if (loading) return <div className="text-gray-400 p-8 text-center">Loading...</div>;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-900/30 to-slate-900/90 border border-blue-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1">Total Obligations</p>
                    <p className="text-2xl font-bold text-white font-mono">{totalCount}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-900/30 to-slate-900/90 border border-emerald-500/20 rounded-xl p-4 shadow-lg">
                    <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">Assigned</p>
                    <p className="text-2xl font-bold text-white font-mono">{assignedCount}</p>
                    <p className="text-[10px] text-emerald-400/60 mt-1">Have target accounts</p>
                </div>
                <div className={`bg-gradient-to-br ${totalCount - assignedCount > 0 ? 'from-amber-900/30 to-slate-900/90 border-amber-500/20' : 'from-slate-800/90 to-slate-900/90 border-slate-700/50'} border rounded-xl p-4 shadow-lg`}>
                    <p className={`text-[10px] ${totalCount - assignedCount > 0 ? 'text-amber-400' : 'text-slate-400'} uppercase tracking-wider font-semibold mb-1`}>Unassigned</p>
                    <p className="text-2xl font-bold text-white font-mono">{totalCount - assignedCount}</p>
                    {totalCount - assignedCount > 0 && (
                        <p className="text-[10px] text-amber-400/60 mt-1">Need envelope accounts</p>
                    )}
                </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search obligations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-800/80 border border-slate-700/50 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500/50 transition"
                    />
                </div>
            </div>

            {/* Category Sections */}
            <div className="space-y-3">
                {sortedCategories.map(cat => {
                    const items = grouped[cat];
                    const isCollapsed = collapsedCats.has(cat);
                    const catAssigned = items.filter(o => o.target_account_id).length;
                    const borderColor = CATEGORY_COLORS[cat] || "border-gray-500/40";

                    return (
                        <div key={cat} className={`bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-lg border-l-2 ${borderColor} transition-all duration-300`}>
                            {/* Category Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50">
                                <button
                                    onClick={() => toggleCat(cat)}
                                    className="flex items-center gap-2 hover:opacity-80 transition"
                                >
                                    <div className="transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                                        <ChevronRight size={12} className="text-slate-500" />
                                    </div>
                                    <h3 className="text-white font-semibold text-[11px] uppercase tracking-wider">{cat}</h3>
                                    <span className="px-1.5 py-0.5 bg-slate-700/80 text-slate-400 rounded-full text-[9px] font-mono">
                                        {catAssigned}/{items.length}
                                    </span>
                                    {catAssigned === items.length ? (
                                        <CheckCircle size={12} className="text-emerald-400" />
                                    ) : (
                                        <AlertTriangle size={12} className="text-amber-400" />
                                    )}
                                </button>
                                {/* Bulk assign for entire category */}
                                <select
                                    className="bg-slate-700/60 text-slate-300 text-[10px] rounded-lg px-2 py-1 border border-slate-600/50 outline-none focus:border-blue-500 transition"
                                    value=""
                                    onChange={(e) => {
                                        if (e.target.value) handleBulkAssign(cat, e.target.value);
                                    }}
                                >
                                    <option value="">Bulk assign...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Obligation Rows */}
                            {!isCollapsed && (
                                <div className="animate-fade-in">
                                    <table className="w-full text-left table-fixed">
                                        <thead className="bg-slate-800/30">
                                            <tr className="text-[8px] uppercase font-bold text-slate-500">
                                                <th className="px-4 py-1.5 w-[35%]">Obligation</th>
                                                <th className="px-3 py-1.5 text-center w-[8%]">Due</th>
                                                <th className="px-3 py-1.5 w-[50%]">Target Envelope</th>
                                                <th className="px-3 py-1.5 text-center w-[7%]"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(obl => (
                                                <tr key={obl.id} className="border-b border-slate-700/20 hover:bg-slate-800/50 transition-colors group">
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5">
                                                            {obl.provider && (
                                                                <span className="text-[9px] text-slate-500 font-semibold uppercase">{obl.provider}</span>
                                                            )}
                                                            {obl.provider && <span className="text-slate-600 text-[8px]">·</span>}
                                                            <span className="font-medium text-white text-[12px] truncate">{obl.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className="text-[11px] font-mono text-slate-400">{obl.due_day}</span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <ArrowRight size={12} className="text-slate-600 flex-shrink-0" />
                                                            <select
                                                                value={obl.target_account_id || ''}
                                                                onChange={(e) => handleAssignAccount(obl.id, e.target.value)}
                                                                disabled={saving === obl.id}
                                                                className={`flex-1 bg-slate-700/60 text-sm rounded-lg px-3 py-1.5 border outline-none transition ${
                                                                    obl.target_account_id
                                                                        ? 'border-emerald-500/30 text-white'
                                                                        : 'border-amber-500/30 text-slate-400'
                                                                } focus:border-blue-500 disabled:opacity-50`}
                                                            >
                                                                <option value="">-- Select Envelope --</option>
                                                                {accounts.map(acc => (
                                                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_type})</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {saving === obl.id ? (
                                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mx-auto" />
                                                        ) : obl.target_account_id ? (
                                                            <CheckCircle size={14} className="text-emerald-400 mx-auto" />
                                                        ) : (
                                                            <AlertTriangle size={14} className="text-amber-400/40 mx-auto" />
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                {sortedCategories.length === 0 && (
                    <div className="text-center py-16 text-slate-500">
                        <Layers size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No obligations found</p>
                        {searchTerm && <p className="text-xs mt-1">Try a different search term</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllocationRules;
