import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { inputClass } from '../components/UI';

const Categories = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'OBLIGATION';

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
    };

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);

    // Environment API URL
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchCategories = async () => {
        try {
            const res = await axios.get(`${API_URL}/categories`);
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

        try {
            await axios.post(`${API_URL}/categories`, {
                name: newCategoryName,
                type: activeTab
            });
            setNewCategoryName('');
            fetchCategories();
        } catch (error) {
            alert("Failed to add category. Name might be duplicate.");
        }
    };

    const handleUpdateCategory = async (id, updates) => {
        try {
            await axios.put(`${API_URL}/categories/${id}`, updates);
            setEditingCategory(null);
            fetchCategories();
        } catch (error) {
            alert("Failed to update category");
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!confirm("Delete this category? Associated items will become Uncategorized.")) return;
        try {
            await axios.delete(`${API_URL}/categories/${id}`);
            fetchCategories();
        } catch (error) {
            alert("Failed to delete category");
        }
    };

    const filteredCategories = categories.filter(c => {
        if (!c.type || c.type === 'BOTH') return true;
        return c.type === activeTab;
    });

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
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Category Name</th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
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
                                                className="text-white font-medium cursor-text"
                                                onClick={() => setEditingCategory(cat)}
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
                                    <td colSpan="3" className="px-6 py-8 text-center text-gray-500 italic">No categories found for {activeTab.toLowerCase()}.</td>
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
