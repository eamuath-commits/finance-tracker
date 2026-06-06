import React, { useEffect, useState } from 'react';
import api, { API_URL } from '../utils/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { inputClass } from '../components/UI';

const Categories = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const activeTab = searchParams.get('tab') || 'OBLIGATION';

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
    };

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const _storedCatF = (() => { try { const s = sessionStorage.getItem('filters_categories'); return s ? JSON.parse(s) : {}; } catch { return {}; } })();
    const _persistCat = (key, val) => { try { const cur = JSON.parse(sessionStorage.getItem('filters_categories') || '{}'); cur[key] = val; sessionStorage.setItem('filters_categories', JSON.stringify(cur)); } catch { } };
    const [searchTerm, setSearchTermRaw] = useState(_storedCatF.searchTerm || '');
    const [sortColumn, setSortColumnRaw] = useState(_storedCatF.sortColumn || 'name');
    const [sortDir, setSortDirRaw] = useState(_storedCatF.sortDir || 'asc');
    const setSearchTerm = (v) => { setSearchTermRaw(v); _persistCat('searchTerm', v); };
    const setSortColumn = (v) => { setSortColumnRaw(v); _persistCat('sortColumn', v); };
    const setSortDir = (v) => { setSortDirRaw(v); _persistCat('sortDir', v); };

    // Environment API URL
    
    const fetchCategories = async () => {
        try {
            const res = await api.get(`${API_URL}/categories`);
            setCategories(res.data);
        } catch (error) {
            console.error("Error fetching categories", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        // Check if category already exists (possibly under a different type)
        const existing = categories.find(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
        if (existing) {
            const typeLabel = existing.type === 'BOTH' ? 'Shared' : existing.type === 'OBLIGATION' ? 'Obligation' : 'Transaction';
            if (confirm(`"${existing.name}" already exists as a ${typeLabel} category. Would you like to change it to Shared (visible in both tabs)?`)) {
                await handleUpdateCategory(existing.id, { type: 'BOTH' });
            }
            return;
        }

        try {
            await api.post(`${API_URL}/categories`, {
                name: newCategoryName.trim(),
                type: activeTab
            });
            setNewCategoryName('');
            fetchCategories();
        } catch (error) {
            alert("Failed to add category.");
        }
    };

    const handleUpdateCategory = async (id, updates) => {
        try {
            await api.put(`${API_URL}/categories/${id}`, updates);
            setEditingCategory(null);
            fetchCategories();
        } catch (error) {
            alert("Failed to update category");
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!confirm("Delete this category? Associated items will become Uncategorized.")) return;
        try {
            await api.delete(`${API_URL}/categories/${id}`);
            fetchCategories();
        } catch (error) {
            alert("Failed to delete category");
        }
    };

    const filteredCategories = categories.filter(c => {
        if (c.type && c.type !== 'BOTH' && c.type !== activeTab) return false;
        if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    }).sort((a, b) => {
        let cmp = 0;
        if (sortColumn === 'name') {
            cmp = a.name.localeCompare(b.name);
        } else if (sortColumn === 'transactions') {
            cmp = (a.transaction_count || 0) - (b.transaction_count || 0);
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const handleSort = (col) => {
        if (sortColumn === col) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDir(col === 'name' ? 'asc' : 'desc');
        }
    };

    if (loading && categories.length === 0) return <div className="p-10 text-white">Loading...</div>;

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-white">Categories</h1>
                <p className="text-gray-400">Manage transaction and obligation categories</p>
            </div>

            <div className="max-w-4xl mx-auto animate-fade-in-up">

                {/* Tabs */}
                <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg mb-6 w-fit border border-slate-700">
                    <button
                        onClick={() => setActiveTab('OBLIGATION')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'OBLIGATION' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Obligation Categories
                    </button>
                    <button
                        onClick={() => setActiveTab('TRANSACTION')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'TRANSACTION' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Transaction Categories
                    </button>
                </div>

                {/* Search Filter */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search categories..."
                        className={`${inputClass} pl-10 w-full`}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                            {filteredCategories.length} found
                        </span>
                    )}
                </div>

                {/* Add Category Card */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-8">
                    <h3 className="text-xl font-bold text-white mb-4">Add New {activeTab === 'OBLIGATION' ? 'Obligation' : 'Transaction'} Category</h3>
                    <form onSubmit={handleAddCategory} className="flex gap-4">
                        <input
                            type="text"
                            placeholder={`e.g. ${activeTab === 'OBLIGATION' ? 'Housing, Loans' : 'Coffee, Shopping'}`}
                            className={`${inputClass} flex-1`}
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                        />
                        <button
                            type="submit"
                            className={`${activeTab === 'OBLIGATION' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'} text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors`}
                        >
                            <Plus size={20} /> Add
                        </button>
                    </form>
                </div>

                {/* Categories List */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
                    <table className="min-w-full divide-y divide-slate-700">
                        <thead className="bg-slate-900">
                            <tr>
                                <th
                                    className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group"
                                    onClick={() => handleSort('name')}
                                >
                                    <span className="flex items-center gap-1">
                                        Category Name
                                        {sortColumn === 'name' && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </span>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                                <th
                                    className="px-6 py-4 text-center text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group"
                                    onClick={() => handleSort('transactions')}
                                >
                                    <span className="flex items-center justify-center gap-1">
                                        Transactions
                                        {sortColumn === 'transactions' && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                    </span>
                                </th>
                                <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {filteredCategories.map(cat => (
                                <tr key={cat.id} className="hover:bg-slate-750 transition-colors group">
                                    <td className="px-6 py-4">
                                        {editingCategory?.id === cat.id ? (
                                            <input
                                                type="text"
                                                className={`${inputClass} py-1 text-sm`}
                                                defaultValue={cat.name}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleUpdateCategory(cat.id, { name: e.currentTarget.value });
                                                }}
                                            />
                                        ) : (
                                            <span
                                                className="text-blue-400 font-medium cursor-pointer hover:text-blue-300 hover:underline transition-colors"
                                                onClick={() => navigate(`/transactions?category=${encodeURIComponent(cat.name)}`)}
                                                title={`View ${cat.transaction_count || 0} transactions`}
                                            >
                                                {cat.name}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 uppercase">
                                        {editingCategory?.id === cat.id ? (
                                            <select
                                                className="bg-slate-800 text-white text-xs rounded p-1 border border-slate-600 outline-none focus:border-blue-500"
                                                value={cat.type || 'BOTH'}
                                                onChange={(e) => handleUpdateCategory(cat.id, { type: e.target.value })}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <option value="BOTH">SHARED</option>
                                                <option value="OBLIGATION">OBLIGATION</option>
                                                <option value="TRANSACTION">TRANSACTION</option>
                                            </select>
                                        ) : (
                                            <span
                                                className={`cursor-pointer hover:text-white ${cat.type === 'OBLIGATION' ? 'text-blue-400' : cat.type === 'TRANSACTION' ? 'text-purple-400' : 'text-gray-500'}`}
                                                onClick={() => setEditingCategory(cat)} // valid shortcut to start edit
                                            >
                                                {cat.type === 'BOTH' || !cat.type ? 'SHARED' : cat.type}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span
                                            className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium ${cat.transaction_count > 0 ? 'bg-blue-900/40 text-blue-300 cursor-pointer hover:bg-blue-800/50 transition-colors' : 'bg-slate-700/50 text-gray-500'}`}
                                            onClick={() => cat.transaction_count > 0 && navigate(`/transactions?category=${encodeURIComponent(cat.name)}`)}
                                        >
                                            {cat.transaction_count || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditingCategory(cat)}
                                            className="text-blue-400 hover:text-white transition-colors"
                                            title="Rename"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCategory(cat.id)}
                                            className="text-red-400 hover:text-red-300 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {filteredCategories.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500 italic">No categories found for {activeTab.toLowerCase()}.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Categories;
