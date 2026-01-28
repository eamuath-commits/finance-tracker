import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { format } from "date-fns";
import { Search, Edit3, Trash2, Plus, User, Calendar, Filter, X, MessageSquare } from "lucide-react";
import { Modal, formatCurrency, inputClass, selectClass } from "../components/UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

// Categories list
const Categories = [
    'Food & Dining', 'Transport', 'Shopping', 'Entertainment', 'Bills & Utilities',
    'Health & Fitness', 'Travel', 'Income', 'Transfer', 'Investment', 'Education',
    'Personal Care', 'Gifts', 'Groceries', 'Subscriptions', 'Other'
];

function Transactions() {
    const [activeTab, setActiveTab] = useState("all");
    const [transactions, setTransactions] = useState([]);
    const [pendingTransactions, setPendingTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [creditCards, setCreditCards] = useState([]); // NEW: For credit card transactions
    const [inboxMessages, setInboxMessages] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showTxModal, setShowTxModal] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [txForm, setTxForm] = useState({
        account_id: '', merchant: '', amount: '', category: '', type: 'debit', notes: '', timestamp: new Date().toISOString().slice(0, 16)
    });

    // Backward compatibility: check tx.type first, fallback to category list
    const LEGACY_CREDIT_CATEGORIES = ['Income', 'Deposit', 'Refund', 'Interest'];
    const isCredit = (tx) => tx.type ? tx.type === 'credit' : LEGACY_CREDIT_CATEGORIES.includes(tx.category);

    // Selection State
    const [selectedTxIds, setSelectedTxIds] = useState(new Set());
    const [selectedMsgIds, setSelectedMsgIds] = useState(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [accountFilter, setAccountFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === "inbox") {
                const res = await axios.get(`${API_URL}/messages/`);
                setInboxMessages(res.data);
            } else {
                const [txRes, accRes, ccRes, pendingRes] = await Promise.all([
                    axios.get(`${API_URL}/transactions/`),
                    axios.get(`${API_URL}/accounts/`),
                    axios.get(`${API_URL}/credit-cards/`),
                    axios.get(`${API_URL}/transactions/pending`)
                ]);
                setTransactions(txRes.data);
                setAccounts(accRes.data);
                setCreditCards(ccRes.data);
                setPendingTransactions(pendingRes.data);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    // Filter transactions
    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => {
            // Search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchesSearch =
                    (tx.merchant?.toLowerCase() || '').includes(term) ||
                    (tx.category?.toLowerCase() || '').includes(term) ||
                    (tx.notes?.toLowerCase() || '').includes(term);
                if (!matchesSearch) return false;
            }
            // Account/Credit Card filter
            if (accountFilter && tx.account_id !== accountFilter && tx.credit_card_id !== accountFilter) return false;
            // Type filter
            if (typeFilter) {
                if (typeFilter === 'Debit' && isCredit(tx)) return false;
                if (typeFilter === 'Credit' && !isCredit(tx)) return false;
                if (typeFilter === 'Transfer' && tx.category !== 'Transfer') return false;
            }
            // Category filter
            if (categoryFilter && tx.category !== categoryFilter) return false;
            // Date range filter
            if (dateRange.start) {
                const txDate = new Date(tx.timestamp);
                const startDate = new Date(dateRange.start);
                if (txDate < startDate) return false;
            }
            if (dateRange.end) {
                const txDate = new Date(tx.timestamp);
                const endDate = new Date(dateRange.end);
                endDate.setHours(23, 59, 59);
                if (txDate > endDate) return false;
            }
            return true;
        });
    }, [transactions, searchTerm, accountFilter, typeFilter, categoryFilter, dateRange]);

    const handleDeleteTx = async (id) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await axios.delete(`${API_URL}/transactions/${id}`);
            setTransactions(transactions.filter(t => t.id !== id));
        } catch (e) {
            console.error("Delete failed:", e);
        }
    };

    const handleDeleteMsg = async (id) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await axios.post(`${API_URL}/messages/bulk-delete`, { ids: [id] });
            setInboxMessages(inboxMessages.filter(m => m.id !== id));
        } catch (e) {
            console.error("Delete failed:", e);
        }
    };

    const openTxModal = (tx) => {
        if (tx) {
            setEditingTx(tx);
            setTxForm({
                account_id: tx.account_id || '',
                merchant: tx.merchant || '',
                amount: tx.amount || '',
                category: tx.category || '',
                type: tx.type || 'debit',
                notes: tx.notes || '',
                timestamp: tx.timestamp ? new Date(tx.timestamp).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
            });
        } else {
            setEditingTx(null);
            setTxForm({
                account_id: accounts[0]?.id || '',
                merchant: '',
                amount: '',
                category: '',
                type: 'debit',
                notes: '',
                timestamp: new Date().toISOString().slice(0, 16)
            });
        }
        setShowTxModal(true);
    };

    const handleSaveTx = async (e) => {
        e.preventDefault();
        const payload = {
            ...txForm,
            amount: parseFloat(txForm.amount),
            timestamp: new Date(txForm.timestamp).toISOString()
        };
        try {
            if (editingTx) {
                await axios.put(`${API_URL}/transactions/${editingTx.id}`, payload);
            } else {
                await axios.post(`${API_URL}/transactions/`, payload);
            }
            setShowTxModal(false);
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Error saving transaction");
        }
    };

    const handleBulkDelete = async () => {
        const ids = activeTab === 'inbox' ? Array.from(selectedMsgIds) : Array.from(selectedTxIds);
        if (!window.confirm(`Delete ${ids.length} items?`)) return;
        try {
            if (activeTab === 'inbox') {
                await axios.post(`${API_URL}/messages/bulk-delete`, { ids });
                setSelectedMsgIds(new Set());
            } else {
                await axios.post(`${API_URL}/transactions/bulk-delete`, { ids });
                setSelectedTxIds(new Set());
            }
            setIsSelectionMode(false);
            fetchData();
        } catch (e) {
            console.error("Bulk delete failed", e);
        }
    };

    const handleRetry = async (msgId) => {
        try {
            const res = await axios.post(`${API_URL}/messages/${msgId}/retry`);
            alert(res.data.message || "Success");
            fetchData();
        } catch (e) {
            alert("Retry Failed");
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setAccountFilter('');
        setTypeFilter('');
        setCategoryFilter('');
        setDateRange({ start: '', end: '' });
    };

    const completePendingTransfer = async (txId, sourceAccountId) => {
        try {
            await axios.post(`${API_URL}/transactions/${txId}/complete-transfer?source_account_id=${sourceAccountId}`);
            fetchData();
        } catch (e) {
            console.error(e);
            alert(e.response?.data?.detail || "Failed to complete transfer");
        }
    };

    const hasActiveFilters = searchTerm || accountFilter || typeFilter || categoryFilter || dateRange.start || dateRange.end;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Transactions</h1>
                    <p className="text-gray-400">View and manage your financial history</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg w-fit border border-slate-700">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'all' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <Calendar size={16} />
                    All Transactions
                </button>
                <button
                    onClick={() => setActiveTab('inbox')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'inbox' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <MessageSquare size={16} />
                    SMS Inbox
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : activeTab === "all" ? (
                <div className="animate-fade-in">
                    {/* Action Bar */}
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">Transaction Log</h2>
                        <div className="flex gap-2">
                            {isSelectionMode && selectedTxIds.size > 0 && (
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition shadow border border-red-500"
                                >
                                    <Trash2 size={16} /> Delete Selected ({selectedTxIds.size})
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setIsSelectionMode(!isSelectionMode);
                                    if (isSelectionMode) setSelectedTxIds(new Set());
                                }}
                                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition shadow border ${isSelectionMode ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500 text-white' : 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-gray-300'}`}
                            >
                                {isSelectionMode ? 'Cancel' : 'Select'}
                            </button>
                            <button onClick={() => openTxModal(null)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition shadow border border-blue-500">
                                <Plus size={16} /> Add Transaction
                            </button>
                        </div>
                    </div>

                    {/* Filters Bar */}
                    <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg mb-6 space-y-4">
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
                                    <option value="">All Accounts/Cards</option>
                                    <optgroup label="Bank Accounts">
                                        {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                    </optgroup>
                                    <optgroup label="Credit Cards">
                                        {creditCards.map(cc => <option key={cc.id} value={cc.id}>{cc.name || `${cc.bank_name} ****${cc.last_4_digits}`}</option>)}
                                    </optgroup>
                                </select>
                                <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">▼</div>
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
                            />

                            {/* End Date */}
                            <input
                                type="date"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>

                        {hasActiveFilters && (
                            <div className="flex justify-end">
                                <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
                                    <X size={14} /> Clear Filters
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Pending Transactions Banner - just a simple notification */}
                    {pendingTransactions.length > 0 && (
                        <div className="bg-amber-900/20 border border-amber-600/50 rounded-xl p-4 mb-6 flex items-center gap-3">
                            <span className="text-2xl">❓</span>
                            <div>
                                <h3 className="text-lg font-bold text-amber-400">
                                    {pendingTransactions.length} Pending Transfer{pendingTransactions.length > 1 ? 's' : ''}
                                </h3>
                                <p className="text-amber-200/70 text-sm">
                                    Select the source account in the table below to complete {pendingTransactions.length > 1 ? 'these transfers' : 'this transfer'}.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Transaction Table */}
                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-700">
                            <thead className="bg-slate-900">
                                <tr>
                                    {isSelectionMode && (
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedTxIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedTxIds(new Set(filteredTransactions.map(tx => tx.id)));
                                                    } else {
                                                        setSelectedTxIds(new Set());
                                                    }
                                                }}
                                                className="w-4 h-4 accent-blue-500 rounded"
                                            />
                                        </th>
                                    )}
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Account / Card</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Beneficiary / Source</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-slate-800 divide-y divide-slate-700">
                                {filteredTransactions.map(tx => {
                                    // Check account first, then credit card
                                    const acc = accounts.find(a => a.id === tx.account_id);
                                    const cc = !acc ? creditCards.find(c => c.id === tx.credit_card_id) : null;
                                    const txIsCredit = isCredit(tx);
                                    const isTransfer = tx.category === 'Transfer';
                                    const isCreditCardTx = !!cc;

                                    return (
                                        <tr key={tx.id} className={`hover:bg-slate-700/50 transition-colors ${selectedTxIds.has(tx.id) ? 'bg-blue-900/20' : ''}`}>
                                            {isSelectionMode && (
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTxIds.has(tx.id)}
                                                        onChange={() => {
                                                            const next = new Set(selectedTxIds);
                                                            if (next.has(tx.id)) next.delete(tx.id);
                                                            else next.add(tx.id);
                                                            setSelectedTxIds(next);
                                                        }}
                                                        className="w-4 h-4 accent-blue-500 rounded"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    {tx.raw_sms_content ? (
                                                        <img src="/sms-icon.png" alt="SMS" className="w-4 h-4 object-contain" title="Source: SMS" />
                                                    ) : (
                                                        <User size={14} className="text-slate-600" title="Source: Manual Entry" />
                                                    )}
                                                    <div>
                                                        {new Date(tx.timestamp).toLocaleDateString()}
                                                        <div className="text-[10px] opacity-70">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                                {/* For pending_action transfers with known destination, show the destination account */}
                                                {tx.status === 'pending_action' && !acc && !cc ? (
                                                    <span className="text-amber-400 text-xs">⚠️ Unknown</span>
                                                ) : acc ? (
                                                    <div className="flex flex-col">
                                                        <span>{acc.name}</span>
                                                        {acc.last_4_digits && <span className="text-xs text-gray-500 font-mono">•••• {acc.last_4_digits}</span>}
                                                        {tx.status === 'pending_action' && <span className="text-[10px] text-amber-400">📥 Receiving</span>}
                                                    </div>
                                                ) : cc ? (
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded">CC</span>
                                                            <span>{cc.name}</span>
                                                        </div>
                                                        {cc.last_4_digits && <span className="text-xs text-gray-500 font-mono">•••• {cc.last_4_digits}</span>}
                                                    </div>
                                                ) : <span className="text-gray-500">Unknown</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                                {/* For pending_action transfers, show source selection dropdown */}
                                                {tx.status === 'pending_action' && acc ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-amber-400 uppercase font-bold tracking-wider">FROM:</span>
                                                        <select
                                                            className="bg-slate-700 border border-amber-600 text-amber-400 rounded px-2 py-1 text-xs cursor-pointer"
                                                            defaultValue=""
                                                            onChange={async (e) => {
                                                                const accountId = e.target.value;
                                                                if (!accountId) return;
                                                                try {
                                                                    await fetch(`${API_URL}/transactions/${tx.id}/complete-transfer?source_account_id=${accountId}`, { method: 'POST' });
                                                                    fetchData();
                                                                } catch (err) {
                                                                    console.error('Failed to assign account:', err);
                                                                }
                                                            }}
                                                        >
                                                            <option value="">Select source...</option>
                                                            {accounts.filter(a => a.id !== tx.account_id).map(a => (
                                                                <option key={a.id} value={a.id}>{a.name} {a.last_4_digits ? `•${a.last_4_digits}` : ''}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {isTransfer && <span className="text-xs text-blue-400 mr-2 uppercase font-bold tracking-wider">{txIsCredit ? 'FROM:' : 'TO:'}</span>}
                                                        {tx.merchant || 'Unknown'}
                                                        {tx.status === 'pending_transfer' && (
                                                            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-400 border border-amber-700">⏳ Pending</span>
                                                        )}
                                                        {tx.status === 'confirmed' && (
                                                            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-400 border border-emerald-700">✓ Confirmed</span>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                {tx.category ? <span className={`px-2 py-0.5 rounded text-xs border ${txIsCredit ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : 'bg-slate-700 text-blue-300 border-slate-600'}`}>{tx.category}</span> : '-'}
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${txIsCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {txIsCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                                                {tx.original_amount && tx.original_currency && tx.original_currency !== 'SAR' && (
                                                    <div className="text-[10px] text-gray-500 font-normal">({tx.original_amount} {tx.original_currency})</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-mono">
                                                {tx.balance_after_transaction !== null && tx.balance_after_transaction !== undefined
                                                    ? formatCurrency(tx.balance_after_transaction)
                                                    : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" onClick={() => openTxModal(tx)} className="text-blue-400 hover:text-blue-300 p-1"><Edit3 size={16} /></button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteTx(tx.id); }} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredTransactions.length === 0 && (
                                    <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-500">No transactions found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* SMS Inbox Tab */
                <div className="animate-fade-in space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">SMS Inbox</h2>
                        <div className="flex gap-2">
                            {isSelectionMode && selectedMsgIds.size > 0 && (
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm"
                                >
                                    <Trash2 size={16} /> Delete ({selectedMsgIds.size})
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setIsSelectionMode(!isSelectionMode);
                                    if (isSelectionMode) setSelectedMsgIds(new Set());
                                }}
                                className={`px-3 py-1.5 rounded-lg text-sm ${isSelectionMode ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-gray-300'}`}
                            >
                                {isSelectionMode ? 'Cancel' : 'Select'}
                            </button>
                        </div>
                    </div>

                    {inboxMessages.map((msg) => (
                        <div key={msg.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-start group">
                            <div className="flex gap-3">
                                {isSelectionMode && (
                                    <input
                                        type="checkbox"
                                        checked={selectedMsgIds.has(msg.id)}
                                        onChange={() => {
                                            const next = new Set(selectedMsgIds);
                                            if (next.has(msg.id)) next.delete(msg.id);
                                            else next.add(msg.id);
                                            setSelectedMsgIds(next);
                                        }}
                                        className="mt-1 w-4 h-4 accent-blue-500"
                                    />
                                )}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-bold text-white">{msg.sender || "Unknown Sender"}</span>
                                        <span className="text-xs text-gray-500">{format(new Date(msg.timestamp), "MMM d, HH:mm")}</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${msg.status === 'PARSED' ? 'bg-emerald-900/30 text-emerald-400' : msg.status === 'FAILED' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                                            {msg.status}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{msg.body}</p>
                                    {msg.error_log && (
                                        <p className="text-red-400 text-xs mt-2 font-mono bg-red-900/20 p-2 rounded">
                                            Error: {msg.error_log}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 items-start">
                                {msg.status === 'FAILED' && (
                                    <button
                                        onClick={() => handleRetry(msg.id)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                                        Retry Parse
                                    </button>
                                )}
                                <button onClick={() => handleDeleteMsg(msg.id)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-slate-700 rounded transition">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {inboxMessages.length === 0 && (
                        <div className="text-center py-12 text-gray-500">No messages in inbox.</div>
                    )}
                </div>
            )}

            {/* Transaction Modal */}
            <Modal isOpen={showTxModal} title={editingTx ? "Edit Transaction" : "Add Transaction"} onClose={() => setShowTxModal(false)}>
                <form onSubmit={handleSaveTx} className="space-y-4">
                    {/* Transaction Type */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => setTxForm({ ...txForm, type: 'debit' })}
                            className={`py-2 px-4 rounded-lg font-medium transition ${txForm.type === 'debit' ? 'bg-red-600 text-white' : 'bg-slate-700 text-gray-400'}`}
                        >
                            Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => setTxForm({ ...txForm, type: 'credit' })}
                            className={`py-2 px-4 rounded-lg font-medium transition ${txForm.type === 'credit' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-gray-400'}`}
                        >
                            Income
                        </button>
                    </div>

                    {/* Account */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Account</label>
                        <select className={selectClass} value={txForm.account_id} onChange={e => setTxForm({ ...txForm, account_id: e.target.value })} required>
                            <option value="">Select Account</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>

                    {/* Merchant */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Merchant / Description</label>
                        <input className={inputClass} value={txForm.merchant} onChange={e => setTxForm({ ...txForm, merchant: e.target.value })} placeholder="e.g. Starbucks" required />
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Amount (SAR)</label>
                        <input type="number" step="0.01" className={inputClass} value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" required />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Category</label>
                        <select className={selectClass} value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })}>
                            <option value="">Select Category</option>
                            {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>

                    {/* Timestamp */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Date & Time</label>
                        <input type="datetime-local" className={inputClass} value={txForm.timestamp} onChange={e => setTxForm({ ...txForm, timestamp: e.target.value })} />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Notes</label>
                        <textarea className={`${inputClass} h-20 resize-none`} value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Optional notes..." />
                    </div>

                    {/* Raw SMS (if editing SMS transaction) */}
                    {editingTx?.raw_sms_content && (
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                            <label className="text-xs text-gray-400 uppercase font-bold mb-2 block flex items-center gap-2">
                                <img src="/sms-icon.png" alt="SMS" className="w-4 h-4" />
                                Original SMS
                            </label>
                            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto">{editingTx.raw_sms_content}</pre>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                        <button type="button" onClick={() => setShowTxModal(false)} className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-600 transition">
                            Cancel
                        </button>
                        <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-500 transition">
                            {editingTx ? 'Save Changes' : 'Create Transaction'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default Transactions;
