import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Search, Plus, ArrowUpDown, Filter, Edit3, Trash2, MessageSquareText, User, RefreshCw, CheckCircle, MessageSquare, Clock } from 'lucide-react';
import { Card, SectionHeader, Modal, inputClass, selectClass, formatCurrency, BrandLogo } from '../components/UI';

const Transactions = () => {
    const Categories = ['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Housing', 'Health', 'Income', 'Transfer', 'Subscription', 'Obligation', 'Credit Card Payment', 'Deposit', 'Refund'];
    const CREDIT_CATEGORIES = ['Income', 'Deposit', 'Refund', 'Interest'];

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('transactions');
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Filtering & Sorting State
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [accountFilter, setAccountFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

    // Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());

    // Form State
    const [form, setForm] = useState({
        account_id: '',
        amount: '',
        merchant: '',
        category: '',
        type: 'debit',
        notes: '',
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
            setSelectedIds(new Set()); // Reset selection on refresh
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (viewMode === 'messages') fetchMessages();
    }, [viewMode]);

    const fetchMessages = async () => {
        setLoadingMessages(true);
        try {
            const res = await axios.get(`${API_URL}/messages/`);
            setMessages(res.data);
        } catch (error) {
            console.error("Error fetching messages", error);
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleRetryMessage = async (id) => {
        try {
            const res = await axios.post(`${API_URL}/messages/${id}/retry`);
            if (res.data.status === 'success') {
                alert("Message parsed successfully!");
                fetchMessages();
                fetchData();
            } else {
                alert(`Retry failed: ${res.data.reason}`);
                fetchMessages();
            }
        } catch (error) {
            console.error("Retry failed", error);
            alert("Retry failed due to server error");
        }
    };

    const resetForm = () => {
        setForm({
            account_id: accounts.length > 0 ? accounts[0].id : '',
            amount: '',
            merchant: '',
            category: '',
            type: 'debit',
            notes: '',
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
            amount: tx.amount,
            account_id: tx.account_id,
            type: tx.type || 'debit',
            notes: tx.notes || '',
            fees: tx.fees || 0.0,
            timestamp: tx.timestamp ? tx.timestamp.slice(0, 16) : new Date().toISOString().slice(0, 16)
        });
        setShowEditModal(true);
    };

    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
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
                merchant: form.merchant,
                notes: form.notes,
                amount: form.amount,
                timestamp: form.timestamp
            });
            setShowEditModal(false);
            setEditingTx(null);
            fetchData();
        } catch (err) { alert('Error updating transaction'); }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transactions?`)) return;

        try {
            // Convert Set to Array for JSON payload
            await axios.post(`${API_URL}/transactions/bulk-delete`, { ids: Array.from(selectedIds) });
            setSelectedIds(new Set());
            fetchData();
        } catch (error) {
            console.error("Error bulk deleting:", error);
            alert("Failed to delete transactions");
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this transaction?')) {
            try {
                await axios.delete(`${API_URL}/transactions/${id}`);
                fetchData();
            } catch (err) {
                console.error("Error deleting transaction", err);
                alert('Error deleting transaction');
            }
        }
    };

    const handleBulkDeleteMessages = async () => {
        if (selectedMessageIds.size === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedMessageIds.size} messages?`)) return;

        try {
            await axios.post(`${API_URL}/messages/bulk-delete`, { ids: Array.from(selectedMessageIds) });
            setSelectedMessageIds(new Set());
            fetchMessages();
        } catch (error) {
            console.error("Error bulk deleting messages:", error);
            alert("Failed to delete messages");
        }
    };

    const toggleMessageSelection = (id) => {
        const newSet = new Set(selectedMessageIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedMessageIds(newSet);
    };

    // Derived Data
    const filteredTransactions = transactions.filter(tx => {
        // Search Term (Merchant or Category)
        const matchSearch = tx.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tx.category && tx.category.toLowerCase().includes(searchTerm.toLowerCase()));

        // Category Filter
        const matchCategory = categoryFilter ? tx.category === categoryFilter : true;

        // Account Filter
        const matchAccount = accountFilter ? tx.account_id === accountFilter : true;

        // Type Filter (Credit vs Debit vs Transfer)
        const isCredit = tx.type === 'credit' || (!tx.type && CREDIT_CATEGORIES.includes(tx.category));
        const isTransfer = tx.category === 'Transfer';
        let matchType = true;
        if (typeFilter === 'Credit') matchType = isCredit;
        else if (typeFilter === 'Debit') matchType = !isCredit && !isTransfer;
        else if (typeFilter === 'Transfer') matchType = isTransfer;

        // Date Range Filter
        let matchDate = true;
        if (dateRange.start) matchDate = matchDate && tx.timestamp >= dateRange.start;
        if (dateRange.end) matchDate = matchDate && tx.timestamp.split('T')[0] <= dateRange.end;

        return matchSearch && matchCategory && matchAccount && matchType && matchDate;
    });

    const sortedTransactions = sortData(filteredTransactions);

    if (loading) return <div className="p-10 text-center text-white">Loading Transactions...</div>;

    return (
        <div className="pb-20">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transactions</h1>
                    <p className="text-gray-400">Manage and categorize your spending history.</p>
                </div>
                <div className="flex gap-3">
                    <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <button
                            onClick={() => setViewMode('transactions')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'transactions' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Transactions
                        </button>
                        <button
                            onClick={() => setViewMode('messages')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'messages' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            <MessageSquare size={14} /> Inbox
                        </button>
                    </div>

                    {viewMode === 'transactions' && (
                        <button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-lg border border-blue-500">
                            <Plus size={18} />
                            Add Transaction
                        </button>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            {viewMode === 'transactions' && (
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg mb-6 space-y-4">
                    {/* ... Search Row ... */}
                    <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 mb-2">
                        <div className="text-gray-400 text-sm pl-2">
                            {selectedIds.size} selected
                        </div>
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1 rounded-md text-sm border border-red-500/30 flex items-center gap-2 transition"
                            >
                                <Trash2 size={16} /> Delete Selected ({selectedIds.size})
                            </button>
                        )}
                    </div>

                    {/* Search Row */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search merchant, category, or notes..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Filters Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {/* Account */}
                        <div className="relative">
                            <select
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                value={accountFilter}
                                onChange={e => setAccountFilter(e.target.value)}
                            >
                                <option value="">All Accounts</option>
                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                            </select>
                            <Filter className="absolute right-3 top-3 text-gray-400 pointer-events-none" size={14} />
                        </div>

                        {/* Type */}
                        <div className="relative">
                            <select
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                            >
                                <option value="">All Types</option>
                                <option value="Debit">Expense (Debit)</option>
                                <option value="Credit">Income (Credit)</option>
                                <option value="Transfer">Transfer</option>
                            </select>
                            <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">▼</div>
                        </div>

                        {/* Category */}
                        <div className="relative">
                            <select
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                            >
                                <option value="">All Categories</option>
                                {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">▼</div>
                        </div>

                        {/* Start Date */}
                        <input
                            type="date"
                            className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                            value={dateRange.start}
                            onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                            placeholder="Start Date"
                        />

                        {/* End Date */}
                        <input
                            type="date"
                            className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                            value={dateRange.end}
                            onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                            placeholder="End Date"
                        />
                    </div>
                </div>
            )}


            {/* Data Table */}
            {
                viewMode === 'messages' ? (
                    // MESSAGES TABLE
                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                        {/* Bulk Delete Header */}
                        <div className="flex justify-between items-center bg-slate-800/50 p-2 border-b border-slate-700/50">
                            <div className="text-gray-400 text-sm pl-4">
                                {selectedMessageIds.size} selected
                            </div>
                            {selectedMessageIds.size > 0 && (
                                <button
                                    onClick={handleBulkDeleteMessages}
                                    className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1 rounded-md text-sm border border-red-500/30 flex items-center gap-2 transition mr-2"
                                >
                                    <Trash2 size={16} /> Delete ({selectedMessageIds.size})
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-700">
                                <thead className="bg-slate-900">
                                    <tr>
                                        <th className="px-6 py-4 text-left">
                                            <input
                                                type="checkbox"
                                                className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                                                checked={messages.length > 0 && selectedMessageIds.size === messages.length}
                                                onChange={() => {
                                                    if (selectedMessageIds.size === messages.length) {
                                                        setSelectedMessageIds(new Set());
                                                    } else {
                                                        setSelectedMessageIds(new Set(messages.map(m => m.id)));
                                                    }
                                                }}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Sender</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/3">Body</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-slate-800 divide-y divide-slate-700">
                                    {messages.map(msg => (
                                        <tr key={msg.id} className={`hover:bg-slate-700/50 transition-colors ${selectedMessageIds.has(msg.id) ? 'bg-blue-900/10' : ''}`}>
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                                                    checked={selectedMessageIds.has(msg.id)}
                                                    onChange={() => toggleMessageSelection(msg.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">
                                                {new Date(msg.timestamp).toLocaleDateString()} {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-white font-medium">{msg.sender}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${msg.status === 'PARSED' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' :
                                                    msg.status === 'FAILED' ? 'bg-red-900/30 text-red-400 border border-red-800' :
                                                        'bg-slate-700 text-gray-300 border border-slate-600'
                                                    }`}>
                                                    {msg.status}
                                                </span>
                                                {msg.error_log && <div className="text-xs text-red-400 mt-1 max-w-[200px] truncate" title={msg.error_log}>{msg.error_log}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-300 font-mono break-words whitespace-pre-wrap max-w-md">
                                                {msg.body}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm">
                                                {msg.status !== 'PARSED' && (
                                                    <button onClick={() => handleRetryMessage(msg.id)} className="text-blue-400 hover:text-blue-300 flex items-center gap-1 justify-end ml-auto">
                                                        <RefreshCw size={14} /> Retry
                                                    </button>
                                                )}
                                                {msg.status === 'PARSED' && (
                                                    <span className="text-emerald-500 flex items-center gap-1 justify-end ml-auto"><CheckCircle size={14} /> Done</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {messages.length === 0 && (
                                        <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-500">No messages found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    // TRANSACTIONS TABLE
                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-700">
                                <thead className="bg-slate-900">
                                    <tr>
                                        <th className="px-6 py-4 text-left">
                                            <input
                                                type="checkbox"
                                                className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                                                checked={sortedTransactions.length > 0 && selectedIds.size === sortedTransactions.length}
                                                onChange={() => {
                                                    if (selectedIds.size === sortedTransactions.length) {
                                                        setSelectedIds(new Set());
                                                    } else {
                                                        setSelectedIds(new Set(sortedTransactions.map(t => t.id)));
                                                    }
                                                }}
                                            />
                                        </th>
                                        <th
                                            className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                            onClick={() => handleSort('merchant')}
                                        >
                                            <div className="flex items-center gap-1">Beneficiary / Source <ArrowUpDown size={14} /></div>
                                        </th>
                                        <th
                                            className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                            onClick={() => handleSort('timestamp')}
                                        >
                                            <div className="flex items-center gap-1">Date <ArrowUpDown size={14} /></div>
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Category</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</th>
                                        <th
                                            className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white"
                                            onClick={() => handleSort('amount')}
                                        >
                                            <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown size={14} /></div>
                                        </th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Balance</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-slate-800 divide-y divide-slate-700">
                                    {sortedTransactions.map(tx => {
                                        const isCredit = tx.type === 'credit' || (!tx.type && CREDIT_CATEGORIES.includes(tx.category));
                                        const isTransfer = tx.category === 'Transfer';
                                        return (
                                            <tr key={tx.id} className={`hover:bg-slate-700/50 transition-colors ${selectedIds.has(tx.id) ? 'bg-blue-900/10' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                                                        checked={selectedIds.has(tx.id)}
                                                        onChange={() => toggleSelection(tx.id)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-white">
                                                    <div className="flex items-center gap-3">
                                                        <BrandLogo name={tx.merchant} size="w-8 h-8" category={tx.category} />
                                                        <div>
                                                            {/* Removed FROM/TO display as per user request */}
                                                            {tx.merchant}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-400">
                                                    <div className="flex items-center gap-2">
                                                        {tx.raw_sms_content ? (
                                                            <img src="/sms-icon.png" alt="SMS" className="w-4 h-4 object-contain" title="Source: SMS" />
                                                        ) : (
                                                            <User size={14} className="text-gray-500" title="Source: Manual Entry" />
                                                        )}
                                                        <div>
                                                            {new Date(tx.timestamp).toLocaleDateString()}
                                                            <div className="text-xs text-slate-600">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {tx.status === 'pending' ? (
                                                        <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/30 text-yellow-500 border border-yellow-800/50 flex items-center gap-1 w-fit" title="Waiting for confirmation SMS">
                                                            <Clock size={12} /> Pending
                                                        </span>
                                                    ) : tx.status === 'pending_action' ? (
                                                        <span className="px-2 py-0.5 rounded text-xs bg-orange-900/30 text-orange-500 border border-orange-800/50 flex items-center gap-1 w-fit animate-pulse" title="Action Required: Select Account in Telegram">
                                                            <div className="w-2 h-2 rounded-full bg-orange-500"></div> Action
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-600 text-xs" title="Completed">Done</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {tx.category ? (
                                                        <span className={`px-2 py-0.5 rounded text-xs border ${isCredit ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : 'bg-slate-700 text-blue-300 border-slate-600'}`}>
                                                            {tx.category}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500 text-xs italic">Uncategorized</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-400">
                                                    {accounts.find(a => a.id === tx.account_id)?.name || 'Unknown'}
                                                </td>
                                                <td className={`px-6 py-4 text-right text-sm font-bold ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {formatCurrency(tx.amount)}
                                                </td>
                                                <td className="px-6 py-4 text-right text-sm text-gray-400 font-mono">
                                                    {tx.balance_after_transaction !== null && tx.balance_after_transaction !== undefined
                                                        ? formatCurrency(tx.balance_after_transaction)
                                                        : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right text-sm font-medium">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => openEditModal(tx)} className="text-blue-400 hover:text-blue-300 p-1"><Edit3 size={16} /></button>
                                                        <button onClick={() => handleDelete(tx.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {sortedTransactions.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                                No transactions found matching your filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            {/* ADD Modal */}
            {
                showAddModal && (
                    <Modal title="Add Manual Transaction" onClose={() => setShowAddModal(false)}>
                        <form onSubmit={handleSaveAdd} className="space-y-4">
                            {/* Transaction Type Indicator */}
                            <div className="flex gap-4 p-1 bg-slate-700 rounded-lg mb-4">
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, type: 'debit' }))}
                                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition text-center ${form.type === 'debit' ? 'bg-red-500 text-white shadow' : 'text-red-300 hover:bg-red-500/20'}`}
                                >
                                    Expense / Debit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, type: 'credit' }))}
                                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition text-center ${form.type === 'credit' ? 'bg-emerald-500 text-white shadow' : 'text-emerald-300 hover:bg-emerald-500/20'}`}
                                >
                                    Income / Credit
                                </button>
                            </div>
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
                            <select
                                className={selectClass}
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                            >
                                <option value="">Select Category (Optional)</option>
                                {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            <textarea
                                placeholder="Notes (Optional)"
                                className={`${inputClass} h-20 resize-none`}
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                            />
                            <p className="text-xs text-gray-400">Note: This will deduct the amount from the selected account balance.</p>
                            <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 font-medium">Add Transaction</button>
                        </form>
                    </Modal>
                )
            }

            {/* EDIT Modal */}
            {
                showEditModal && (
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
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold">Date & Time</label>
                                    <input
                                        type="datetime-local"
                                        className={`${inputClass} mt-1`}
                                        value={form.timestamp}
                                        onChange={e => setForm({ ...form, timestamp: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold">Amount</label>
                                    <input
                                        type="number" step="0.01"
                                        className={`${inputClass} mt-1`}
                                        value={form.amount}
                                        onChange={e => setForm({ ...form, amount: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold">Fees</label>
                                    <input
                                        type="number" step="0.01"
                                        className={`${inputClass} mt-1`}
                                        value={form.fees}
                                        onChange={e => setForm({ ...form, fees: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold">Notes</label>
                                <textarea
                                    placeholder="Add details..."
                                    className={`${inputClass} mt-1 h-20 resize-none`}
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium mt-4">Save Changes</button>
                        </form>
                    </Modal>
                )
            }
        </div >
    );
};

export default Transactions;
