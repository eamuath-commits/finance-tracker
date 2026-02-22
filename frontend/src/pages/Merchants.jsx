import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Search, Edit3, Trash2, RefreshCw, Store, ExternalLink, X, Plus } from "lucide-react";
import { Modal, inputClass, selectClass } from "../components/UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

function Merchants() {
    const navigate = useNavigate();
    const [merchants, setMerchants] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTx, setFilterTx] = useState('');
    const [editingMerchant, setEditingMerchant] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });

    const fetchMerchants = async () => {
        try {
            const res = await axios.get(`${API_URL}/merchants/`);
            setMerchants(res.data);
        } catch (e) {
            console.error("Failed to fetch merchants:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMerchants();
        axios.get(`${API_URL}/categories`).then(res => setCategories(res.data)).catch(() => { });
    }, []);

    const handleBackfill = async () => {
        setBackfilling(true);
        try {
            const res = await axios.post(`${API_URL}/merchants/backfill`);
            alert(`Updated ${res.data.updated} merchants`);
            fetchMerchants();
        } catch (e) {
            console.error("Backfill failed:", e);
        } finally {
            setBackfilling(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/merchants/${editingMerchant.id}`, {
                name: editingMerchant.name,
                display_name: editingMerchant.display_name || null,
                logo_url: editingMerchant.logo_url || null,
                category: editingMerchant.category || null,
                brand_domain: editingMerchant.brand_domain || null,
                aliases: editingMerchant.aliases || [],
                notes: editingMerchant.notes || null,
            });
            setShowModal(false);
            fetchMerchants();
        } catch (e) {
            console.error("Save failed:", e);
        }
    };

    const handleDelete = (id, name) => {
        setConfirmModal({
            open: true,
            message: `Delete merchant "${name}"?`,
            onConfirm: async () => {
                try {
                    await axios.delete(`${API_URL}/merchants/${id}`);
                    fetchMerchants();
                } catch (e) {
                    console.error("Delete failed:", e);
                }
                setConfirmModal({ open: false, message: '', onConfirm: null });
            }
        });
    };

    const [sortColumn, setSortColumn] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (col) => {
        if (sortColumn === col) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDir(col === 'category' ? 'asc' : 'desc');
        }
    };

    // Unique categories for the filter dropdown
    const uniqueCategories = [...new Set(merchants.map(m => m.category).filter(Boolean))].sort();

    const filtered = merchants.filter(m => {
        const q = search.toLowerCase();
        if (q && !m.name.toLowerCase().includes(q) && !(m.display_name || '').toLowerCase().includes(q) && !(m.category || '').toLowerCase().includes(q)) return false;
        if (filterCategory && (m.category || '') !== filterCategory) return false;
        if (filterStatus === 'resolved' && !m.display_name) return false;
        if (filterStatus === 'unresolved' && m.display_name) return false;
        if (filterStatus === 'has_logo' && !m.logo_url) return false;
        if (filterStatus === 'no_logo' && m.logo_url) return false;
        if (filterTx === 'has_tx' && !(m.transaction_count > 0)) return false;
        if (filterTx === 'no_tx' && m.transaction_count > 0) return false;
        return true;
    }).sort((a, b) => {
        if (!sortColumn) return 0;
        let cmp = 0;
        if (sortColumn === 'category') {
            cmp = (a.category || '').localeCompare(b.category || '');
        } else if (sortColumn === 'transactions') {
            cmp = (a.transaction_count || 0) - (b.transaction_count || 0);
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const hasActiveFilters = filterCategory || filterStatus || filterTx;

    const resolved = merchants.filter(m => m.display_name).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Store className="text-blue-400" size={28} />
                        Merchants
                    </h1>
                    <p className="text-gray-400 mt-1">
                        {merchants.length} merchants · {resolved} resolved · {merchants.length - resolved} unresolved
                    </p>
                </div>
                <button
                    onClick={handleBackfill}
                    disabled={backfilling}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                    <RefreshCw size={16} className={backfilling ? 'animate-spin' : ''} />
                    {backfilling ? 'Backfilling...' : 'Auto-Resolve'}
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Total Merchants', value: merchants.length, color: 'blue' },
                    { label: 'With Brand Name', value: resolved, color: 'green' },
                    { label: 'With Logo', value: merchants.filter(m => m.logo_url).length, color: 'purple' },
                    { label: 'Unresolved', value: merchants.length - resolved, color: 'amber' },
                ].map(stat => (
                    <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <p className="text-gray-400 text-sm">{stat.label}</p>
                        <p className={`text-2xl font-bold text-${stat.color}-400 mt-1`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Search & Filters */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search merchants..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                    <select
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        className={`${selectClass} min-w-[160px]`}
                    >
                        <option value="">All Categories</option>
                        {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className={`${selectClass} min-w-[140px]`}
                    >
                        <option value="">All Status</option>
                        <option value="resolved">Resolved</option>
                        <option value="unresolved">Unresolved</option>
                        <option value="has_logo">Has Logo</option>
                        <option value="no_logo">No Logo</option>
                    </select>
                    <select
                        value={filterTx}
                        onChange={e => setFilterTx(e.target.value)}
                        className={`${selectClass} min-w-[160px]`}
                    >
                        <option value="">All Transactions</option>
                        <option value="has_tx">Has Transactions</option>
                        <option value="no_tx">No Transactions</option>
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterTx(''); }}
                            className="flex items-center gap-1 px-3 py-2.5 text-gray-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-colors text-sm"
                        >
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>
            </div>
            {/* Result count */}
            {(search || hasActiveFilters) && (
                <p className="text-sm text-gray-400">
                    Showing {filtered.length} of {merchants.length} merchants
                </p>
            )}

            {/* Table */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-700/50">
                            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Merchant</th>
                            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Brand Name</th>
                            <th
                                className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('category')}
                            >
                                <span className="flex items-center gap-1">
                                    Category
                                    {sortColumn === 'category' && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                </span>
                            </th>
                            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Domain</th>
                            <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Logo</th>
                            <th
                                className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3 cursor-pointer hover:text-white transition-colors"
                                onClick={() => handleSort('transactions')}
                            >
                                <span className="flex items-center justify-center gap-1">
                                    Transactions
                                    {sortColumn === 'transactions' && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                </span>
                            </th>
                            <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider px-5 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(m => (
                            <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        {m.logo_url ? (
                                            <img src={m.logo_url} alt="" className="w-6 h-6 rounded" onError={e => e.target.style.display = 'none'} />
                                        ) : (
                                            <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center">
                                                <Store size={14} className="text-gray-500" />
                                            </div>
                                        )}
                                        <span
                                            className="text-blue-400 font-medium text-sm cursor-pointer hover:text-blue-300 hover:underline transition-colors"
                                            onClick={() => navigate(`/transactions?merchant=${encodeURIComponent(m.display_name || m.name)}`)}
                                            title="View transactions"
                                        >
                                            {m.name}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-5 py-3">
                                    {m.display_name ? (
                                        <span className="text-green-400 text-sm font-medium">{m.display_name}</span>
                                    ) : (
                                        <span className="text-amber-400/60 text-sm italic">Unresolved</span>
                                    )}
                                </td>
                                <td className="px-5 py-3">
                                    <span className="text-gray-300 text-sm">{m.category || '—'}</span>
                                </td>
                                <td className="px-5 py-3">
                                    {m.brand_domain ? (
                                        <a href={`https://${m.brand_domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline flex items-center gap-1">
                                            {m.brand_domain} <ExternalLink size={12} />
                                        </a>
                                    ) : (
                                        <span className="text-gray-500 text-sm">—</span>
                                    )}
                                </td>
                                <td className="px-5 py-3">
                                    {m.logo_url ? (
                                        <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded-full">✓ Set</span>
                                    ) : (
                                        <span className="text-gray-500 text-xs">—</span>
                                    )}
                                </td>
                                <td className="px-5 py-3 text-center">
                                    <span
                                        className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium ${m.transaction_count > 0 ? 'bg-blue-900/40 text-blue-300 cursor-pointer hover:bg-blue-800/50 transition-colors' : 'bg-slate-700/50 text-gray-500'}`}
                                        onClick={() => m.transaction_count > 0 && navigate(`/transactions?merchant=${encodeURIComponent(m.display_name || m.name)}`)}
                                    >
                                        {m.transaction_count || 0}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => { setEditingMerchant({ ...m }); setShowModal(true); }}
                                            className="text-gray-400 hover:text-blue-400 transition p-1"
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(m.id, m.display_name || m.name)}
                                            className="text-gray-400 hover:text-red-400 transition p-1"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan="7" className="px-5 py-8 text-center text-gray-500">No merchants found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Edit Merchant">
                {editingMerchant && (
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Raw Name (from SMS)</label>
                            <input
                                value={editingMerchant.name}
                                onChange={e => setEditingMerchant({ ...editingMerchant, name: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Display Name (Brand)</label>
                            <input
                                value={editingMerchant.display_name || ''}
                                onChange={e => setEditingMerchant({ ...editingMerchant, display_name: e.target.value })}
                                className={inputClass}
                                placeholder="e.g. HungerStation"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Brand Domain</label>
                            <input
                                value={editingMerchant.brand_domain || ''}
                                onChange={e => {
                                    const domain = e.target.value;
                                    setEditingMerchant({
                                        ...editingMerchant,
                                        brand_domain: domain,
                                        logo_url: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : ''
                                    });
                                }}
                                className={inputClass}
                                placeholder="e.g. hungerstation.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Category</label>
                            <select
                                value={editingMerchant.category || ''}
                                onChange={e => setEditingMerchant({ ...editingMerchant, category: e.target.value })}
                                className={selectClass}
                            >
                                <option value="">Select category</option>
                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Logo URL</label>
                            <div className="flex items-center gap-3">
                                {editingMerchant.logo_url && (
                                    <img src={editingMerchant.logo_url} alt="" className="w-8 h-8 rounded" onError={e => e.target.style.display = 'none'} />
                                )}
                                <input
                                    value={editingMerchant.logo_url || ''}
                                    onChange={e => setEditingMerchant({ ...editingMerchant, logo_url: e.target.value })}
                                    className={`${inputClass} flex-1`}
                                    placeholder="Auto-generated from domain"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Notes</label>
                            <input
                                value={editingMerchant.notes || ''}
                                onChange={e => setEditingMerchant({ ...editingMerchant, notes: e.target.value })}
                                className={inputClass}
                                placeholder="Optional notes"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Aliases (SMS name variants)</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {(editingMerchant.aliases || []).map((alias, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 bg-slate-700 text-blue-300 text-sm px-3 py-1 rounded-full">
                                        {alias}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated = [...(editingMerchant.aliases || [])];
                                                updated.splice(idx, 1);
                                                setEditingMerchant({ ...editingMerchant, aliases: updated });
                                            }}
                                            className="text-gray-400 hover:text-red-400 transition-colors ml-1"
                                        >
                                            <X size={14} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Add alias (e.g. HUNGERSTATI)"
                                    className={`${inputClass} flex-1`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const val = e.target.value.trim();
                                            if (val && !(editingMerchant.aliases || []).includes(val)) {
                                                setEditingMerchant({
                                                    ...editingMerchant,
                                                    aliases: [...(editingMerchant.aliases || []), val]
                                                });
                                                e.target.value = '';
                                            }
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        const input = e.currentTarget.previousElementSibling;
                                        const val = input.value.trim();
                                        if (val && !(editingMerchant.aliases || []).includes(val)) {
                                            setEditingMerchant({
                                                ...editingMerchant,
                                                aliases: [...(editingMerchant.aliases || []), val]
                                            });
                                            input.value = '';
                                        }
                                    }}
                                    className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Add truncated or variant names from SMS to match this merchant</p>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-600 transition">
                                Cancel
                            </button>
                            <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-500 transition">
                                Save Changes
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Confirm Modal */}
            {confirmModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
                        <p className="text-white text-lg font-medium mb-6">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmModal({ open: false, message: '', onConfirm: null })} className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-600 transition">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-500 transition">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Merchants;
