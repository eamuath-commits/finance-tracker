import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Plus, ArrowUpDown, Filter } from 'lucide-react';
import { Card, SectionHeader, Modal, inputClass, selectClass, formatCurrency } from '../components/UI';

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filtering & Sorting State
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

    // Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTx, setEditingTx] = useState(null);

    // Form State
    const [form, setForm] = useState({
        account_id: '',
        amount: '',
        merchant: '',
        category: '',
        timestamp: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    });

    // Helper: Sort function
    const sortData = (data) => {
        if (!sortConfig.key) return data;
        return [...data].sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Environment API URL
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [txRes, accRes] = await Promise.all([
                axios.get(`${API_URL}/transactions/?limit=500`), // Fetch more history
                axios.get(`${API_URL}/accounts/`)
            ]);
            setTransactions(txRes.data);
            setAccounts(accRes.data);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForm = () => {
        setForm({
            account_id: accounts.length > 0 ? accounts[0].id : '',
            amount: '',
            merchant: '',
            category: '',
            timestamp: new Date().toISOString().split('T')[0]
        });
    };

    const openAddModal = () => {
        resetForm();
        if (accounts.length > 0) {
            setForm(f => ({ ...f, account_id: accounts[0].id }));
        }
        setShowAddModal(true);
    };

    const openEditModal = (tx) => {
        setEditingTx(tx);
        setForm({
            category: tx.category || '',
            merchant: tx.merchant,
            amount: tx.amount, // Optional: Usually disabled for editing to prevent balance mismatch
            account_id: tx.account_id
        });
        setShowEditModal(true);
    };

    const handleSaveAdd = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/transactions/`, form);
            setShowAddModal(false);
            fetchData();
        } catch (err) { alert('Error adding transaction'); }
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/transactions/${editingTx.id}`, {
                category: form.category,
                merchant: form.merchant
            });
            setShowEditModal(false);
            setEditingTx(null);
            fetchData();
        } catch (err) { alert('Error updating transaction'); }
    };

    // Derived Data
    const filteredTransactions = transactions.filter(tx => {
        const matchSearch = tx.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tx.category && tx.category.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchCategory = categoryFilter ? tx.category === categoryFilter : true;
        return matchSearch && matchCategory;
    });

    const sortedTransactions = sortData(filteredTransactions);
    const Categories = ['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Housing', 'Health', 'Income', 'Transfer', 'Subscription'];

    if (loading) return <div className="p-10 text-center text-white">Loading Transactions...</div>;

    return (
        <div className="pb-20">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transactions</h1>
                    <p className="text-gray-400">Manage and categorize your spending history.</p>
                </div>
                <button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-lg border border-blue-500">
                    <Plus size={18} />
                    Add Transaction
                </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search merchant or description..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <select
                        className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                    >
                        <option value="">All Categories</option>
                        {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-700">
                        <thead className="bg-slate-900">
                            <tr>
                                <th
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                    onClick={() => handleSort('merchant')}
                                >
                                    <div className="flex items-center gap-1">Merchant <ArrowUpDown size={14} /></div>
                                </th>
                                <th
                                    className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                    onClick={() => handleSort('timestamp')}
                                >
                                    <div className="flex items-center gap-1">Date <ArrowUpDown size={14} /></div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</th>
                                <th
                                    className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                    onClick={() => handleSort('amount')}
                                >
                                    <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown size={14} /></div>
                                </th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-slate-800 divide-y divide-slate-700">
                            {sortedTransactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-white">{tx.merchant}</td>
                                    <td className="px-6 py-4 text-sm text-gray-400">
                                        {new Date(tx.timestamp).toLocaleDateString()}
                                        <div className="text-xs text-slate-600">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {tx.category ? (
                                            <span className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-blue-300">
                                                {tx.category}
                                            </span>
                                        ) : (
                                            <span className="text-gray-500 text-xs italic">Uncategorized</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-400">
                                        {accounts.find(a => a.id === tx.account_id)?.name || 'Unknown'}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-bold text-white">
                                        {formatCurrency(tx.amount)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-medium">
                                        <button onClick={() => openEditModal(tx)} className="text-blue-400 hover:text-blue-300 transition">Edit</button>
                                    </td>
                                </tr>
                            ))}
                            {sortedTransactions.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                        No transactions found matching your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ADD Modal */}
            {showAddModal && (
                <Modal title="Add Manual Transaction" onClose={() => setShowAddModal(false)}>
                    <form onSubmit={handleSaveAdd} className="space-y-4">
                        <select
                            required
                            className={selectClass}
                            value={form.account_id}
                            onChange={e => setForm({ ...form, account_id: e.target.value })}
                        >
                            <option value="" disabled>Select Account</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (...{acc.last_4_digits})</option>)}
                        </select>
                        <input
                            type="text" required placeholder="Merchant / Description"
                            className={inputClass}
                            value={form.merchant}
                            onChange={e => setForm({ ...form, merchant: e.target.value })}
                        />
                        <input
                            type="number" required step="0.01" placeholder="Amount (SAR)"
                            className={inputClass}
                            value={form.amount}
                            onChange={e => setForm({ ...form, amount: e.target.value })}
                        />
                        <input
                            type="text" placeholder="Category (Optional)"
                            className={inputClass}
                            value={form.category}
                            onChange={e => setForm({ ...form, category: e.target.value })}
                        />
                        <p className="text-xs text-gray-400">Note: This will deduct the amount from the selected account balance.</p>
                        <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 font-medium">Add Transaction</button>
                    </form>
                </Modal>
            )}

            {/* EDIT Modal */}
            {showEditModal && (
                <Modal title="Edit Transaction" onClose={() => setShowEditModal(false)}>
                    <form onSubmit={handleSaveEdit} className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold">Merchant Name</label>
                            <input
                                type="text" placeholder="Merchant"
                                className={inputClass}
                                value={form.merchant}
                                onChange={e => setForm({ ...form, merchant: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold">Category</label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                {Categories.map(cat => (
                                    <button
                                        key={cat} type="button"
                                        onClick={() => setForm({ ...form, category: cat })}
                                        className={`px-2 py-1 text-xs rounded border transition ${form.category === cat
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : 'bg-slate-700 border-slate-600 text-gray-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium mt-4">Save Changes</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Transactions;
