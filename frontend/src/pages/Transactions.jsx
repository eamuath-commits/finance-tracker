import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSearchParams } from 'react-router-dom';
import { format } from "date-fns";
import { Search, Edit3, Trash2, Plus, User, Calendar, Filter, X, MessageSquare, Upload } from "lucide-react";
import { Modal, formatCurrency, inputClass, selectClass } from "../components/UI";
import SMSIngestTab from "../components/SMSIngestTab";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

// Categories list
const Categories = [
    'Food & Dining', 'Transport', 'Shopping', 'Entertainment', 'Bills & Utilities',
    'Health & Fitness', 'Travel', 'Income', 'Transfer', 'Investment', 'Education',
    'Personal Care', 'Gifts', 'Groceries', 'Subscriptions', 'Other'
];

function Transactions() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'all';

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
    };
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
        source_type: 'account', // 'account' or 'credit_card'
        source_id: '', // the actual account_id or credit_card_id
        account_id: '',
        credit_card_id: '',
        merchant: '',
        amount: '',
        category: '',
        type: 'debit',
        notes: '',
        timestamp: new Date().toISOString().slice(0, 16)
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
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc' or 'desc' for date sorting
    const [countLimit, setCountLimit] = useState(''); // '' = all, '10', '25', '50', '100'

    // Initialize filter from URL params (for navigation from account/credit card pages)
    useEffect(() => {
        const accountId = searchParams.get('account_id');
        const creditCardId = searchParams.get('credit_card_id');

        if (accountId) {
            setAccountFilter(accountId);
            // Ensure we're on the 'all' tab to see filtered transactions
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', account_id: accountId });
            }
        } else if (creditCardId) {
            setAccountFilter(creditCardId);
            // Ensure we're on the 'all' tab to see filtered transactions
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', credit_card_id: creditCardId });
            }
        }
    }, [searchParams]);

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
        const filtered = transactions.filter(tx => {
            // Search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                // Check if searching for amount (numeric)
                const isNumericSearch = /^[\d.,]+$/.test(term);
                const matchesSearch =
                    (tx.merchant?.toLowerCase() || '').includes(term) ||
                    (tx.category?.toLowerCase() || '').includes(term) ||
                    (tx.notes?.toLowerCase() || '').includes(term) ||
                    (tx.raw_sms_content?.toLowerCase() || '').includes(term) ||
                    // Amount search: match exact, partial, or formatted amounts
                    (isNumericSearch && tx.amount?.toString().includes(term.replace(',', ''))) ||
                    tx.amount?.toFixed(2).includes(term.replace(',', ''));
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

        // Sort by date
        const sorted = filtered.sort((a, b) => {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        // Apply count limit if set
        if (countLimit && !isNaN(parseInt(countLimit))) {
            return sorted.slice(0, parseInt(countLimit));
        }
        return sorted;
    }, [transactions, searchTerm, accountFilter, typeFilter, categoryFilter, dateRange, sortOrder, countLimit]);

    // Calculate totals based on filtered transactions
    const totals = useMemo(() => {
        let totalCredit = 0;
        let totalDebit = 0;
        filteredTransactions.forEach(tx => {
            if (isCredit(tx)) {
                totalCredit += tx.amount || 0;
            } else {
                totalDebit += tx.amount || 0;
            }
        });
        return { totalCredit, totalDebit, net: totalCredit - totalDebit };
    }, [filteredTransactions]);

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
            // Determine if this transaction is for an account or credit card
            const isCreditCard = !tx.account_id && tx.credit_card_id;
            setEditingTx(tx);
            setTxForm({
                source_type: isCreditCard ? 'credit_card' : 'account',
                source_id: isCreditCard ? tx.credit_card_id : tx.account_id || '',
                account_id: tx.account_id || '',
                credit_card_id: tx.credit_card_id || '',
                merchant: tx.merchant || '',
                amount: tx.amount || '',
                category: tx.category || '',
                type: tx.type || 'debit',
                notes: tx.notes || '',
                timestamp: tx.timestamp ? new Date(tx.timestamp).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
                previous_balance: ''  // Leave empty by default, user can fill to adjust
            });
        } else {
            setEditingTx(null);
            const defaultSourceId = accounts[0]?.id || '';
            setTxForm({
                source_type: 'account',
                source_id: defaultSourceId,
                account_id: defaultSourceId,
                credit_card_id: '',
                target_account_id: '',
                merchant: '',
                amount: '',
                category: '',
                type: 'debit',
                is_internal: true,
                transfer_direction: 'outgoing',
                notes: '',
                timestamp: new Date().toISOString().slice(0, 16)
            });
        }
        setShowTxModal(true);
    };

    const handleSaveTx = async (e) => {
        e.preventDefault();
        const amount = parseFloat(txForm.amount);
        const timestamp = new Date(txForm.timestamp).toISOString();

        try {
            if (editingTx) {
                // Edit existing transaction - handle account vs credit card
                const payload = {
                    merchant: txForm.merchant,
                    amount,
                    category: txForm.category,
                    type: txForm.type,
                    notes: txForm.notes,
                    timestamp
                };

                // Set the correct ID field based on source type
                if (txForm.source_type === 'credit_card') {
                    payload.account_id = null;
                    payload.credit_card_id = txForm.source_id;
                } else {
                    payload.account_id = txForm.source_id;
                    payload.credit_card_id = null;
                }

                // Include previous_balance if user provided one (for cascade recalculation)
                if (txForm.previous_balance !== '' && !isNaN(parseFloat(txForm.previous_balance))) {
                    payload.previous_balance = parseFloat(txForm.previous_balance);
                }

                await axios.put(`${API_URL}/transactions/${editingTx.id}`, payload);
            } else if (txForm.type === 'transfer' && txForm.is_internal && txForm.target_account_id) {
                // Internal transfer - create TWO transactions
                const sourceAcc = accounts.find(a => a.id === txForm.account_id);
                const targetAcc = accounts.find(a => a.id === txForm.target_account_id);

                // 1. Debit from source (outgoing)
                await axios.post(`${API_URL}/transactions/`, {
                    account_id: txForm.account_id,
                    amount: amount,
                    merchant: txForm.merchant || `Transfer to ${targetAcc?.name || 'Account'}`,
                    category: 'Internal Transfer',
                    type: 'debit',
                    notes: txForm.notes,
                    timestamp
                });

                // 2. Credit to target (incoming)
                await axios.post(`${API_URL}/transactions/`, {
                    account_id: txForm.target_account_id,
                    amount: amount,
                    merchant: txForm.merchant || `Transfer from ${sourceAcc?.name || 'Account'}`,
                    category: 'Internal Transfer',
                    type: 'credit',
                    notes: txForm.notes,
                    timestamp
                });
            } else if (txForm.type === 'transfer' && !txForm.is_internal) {
                // External transfer - single transaction with beneficiary
                const isOutgoing = txForm.transfer_direction === 'outgoing';
                await axios.post(`${API_URL}/transactions/`, {
                    account_id: txForm.account_id,
                    amount: amount,
                    merchant: txForm.merchant, // Beneficiary name
                    category: 'Transfer',
                    type: isOutgoing ? 'debit' : 'credit',
                    notes: txForm.notes,
                    timestamp
                });
            } else {
                // Regular transaction
                await axios.post(`${API_URL}/transactions/`, {
                    ...txForm,
                    amount,
                    timestamp
                });
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
        setCountLimit('');
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
                <button
                    onClick={() => setActiveTab('ingest')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'ingest' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <Upload size={16} />
                    SMS Ingest
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

                            {/* Count Limit */}
                            <div className="relative">
                                <select
                                    className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                    value={countLimit}
                                    onChange={e => setCountLimit(e.target.value)}
                                >
                                    <option value="">Show All</option>
                                    <option value="10">Last 10</option>
                                    <option value="25">Last 25</option>
                                    <option value="50">Last 50</option>
                                    <option value="100">Last 100</option>
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

                    {/* Totals Summary Bar */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mb-6 flex flex-wrap gap-6 items-center justify-between">
                        <div className="flex gap-6">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-sm">Credit:</span>
                                <span className="text-emerald-400 font-bold">+{formatCurrency(totals.totalCredit)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-sm">Debit:</span>
                                <span className="text-red-400 font-bold">-{formatCurrency(totals.totalDebit)}</span>
                            </div>
                            <div className="flex items-center gap-2 border-l border-slate-600 pl-6">
                                <span className="text-gray-400 text-sm">Net:</span>
                                <span className={`font-bold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net)}
                                </span>
                            </div>
                        </div>
                        <span className="text-gray-500 text-sm">{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</span>
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
                                    <th
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group"
                                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    >
                                        <span className="flex items-center gap-1">
                                            Date
                                            <span className="text-blue-400 group-hover:text-blue-300">
                                                {sortOrder === 'asc' ? '↑' : '↓'}
                                            </span>
                                        </span>
                                    </th>
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
                                                    {tx.source === 'webui' ? (
                                                        <Upload size={14} className="text-blue-500" title="Source: Web Ingest" />
                                                    ) : tx.source === 'telegram' || tx.raw_sms_content ? (
                                                        <img src="/sms-icon.png" alt="SMS" className="w-4 h-4 object-contain" title="Source: Telegram/SMS" />
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
            ) : activeTab === "inbox" ? (
                /* SMS Inbox Tab */
                <div className="animate-fade-in space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">SMS Inbox</h2>
                        <div className="flex gap-2 items-center">
                            {isSelectionMode && (
                                <>
                                    {/* Select All Checkbox */}
                                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={inboxMessages.length > 0 && selectedMsgIds.size === inboxMessages.length}
                                            onChange={() => {
                                                if (selectedMsgIds.size === inboxMessages.length) {
                                                    setSelectedMsgIds(new Set());
                                                } else {
                                                    setSelectedMsgIds(new Set(inboxMessages.map(m => m.id)));
                                                }
                                            }}
                                            className="w-4 h-4 accent-blue-500"
                                        />
                                        Select All
                                    </label>
                                    {selectedMsgIds.size > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleBulkDelete}
                                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm"
                                        >
                                            <Trash2 size={16} /> Delete ({selectedMsgIds.size})
                                        </button>
                                    )}
                                </>
                            )}
                            <button
                                type="button"
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
                                        type="button"
                                        onClick={() => handleRetry(msg.id)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                                        Retry Parse
                                    </button>
                                )}
                                <button type="button" onClick={() => handleDeleteMsg(msg.id)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-slate-700 rounded transition">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {inboxMessages.length === 0 && (
                        <div className="text-center py-12 text-gray-500">No messages in inbox.</div>
                    )}
                </div>
            ) : null}

            {/* SMS Ingest Tab - Always mounted to preserve state, hidden when not active */}
            <div className={activeTab === "ingest" ? "" : "hidden"}>
                <SMSIngestTab
                    accounts={accounts}
                    creditCards={creditCards}
                    onTransactionCreated={fetchData}
                />
            </div>

            {/* Transaction Modal */}
            <Modal isOpen={showTxModal} title={editingTx ? "Edit Transaction" : "Add Transaction"} onClose={() => setShowTxModal(false)}>
                <form onSubmit={handleSaveTx} className="space-y-4">
                    {/* Transaction Type */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => setTxForm({ ...txForm, type: 'debit' })}
                            className={`py-2 px-3 rounded-lg font-medium transition text-sm ${txForm.type === 'debit' ? 'bg-red-600 text-white' : 'bg-slate-700 text-gray-400'}`}
                        >
                            Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => setTxForm({ ...txForm, type: 'credit' })}
                            className={`py-2 px-3 rounded-lg font-medium transition text-sm ${txForm.type === 'credit' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-gray-400'}`}
                        >
                            Income
                        </button>
                        <button
                            type="button"
                            onClick={() => setTxForm({ ...txForm, type: 'transfer', category: 'Transfer' })}
                            className={`py-2 px-3 rounded-lg font-medium transition text-sm ${txForm.type === 'transfer' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400'}`}
                        >
                            Transfer
                        </button>
                    </div>

                    {/* Account Selection - Different UI for transfers */}
                    {txForm.type === 'transfer' ? (
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-blue-500/30 space-y-3">
                            {/* Internal/External Toggle */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTxForm({ ...txForm, is_internal: true })}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${txForm.is_internal ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                                >
                                    Internal (My Accounts)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTxForm({ ...txForm, is_internal: false })}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${!txForm.is_internal ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                                >
                                    External (Beneficiary)
                                </button>
                            </div>

                            {txForm.is_internal ? (
                                /* Internal Transfer: Source → Target */
                                <div className="grid grid-cols-5 gap-2 items-center">
                                    <div className="col-span-2">
                                        <label className="text-gray-500 text-[10px] uppercase mb-0.5 block">From Account</label>
                                        <select
                                            className={selectClass}
                                            value={txForm.account_id}
                                            onChange={e => setTxForm({ ...txForm, account_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Source</option>
                                            {accounts.filter(a => a.id !== txForm.target_account_id).map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex justify-center text-gray-500">
                                        <span className="text-xl">→</span>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-gray-500 text-[10px] uppercase mb-0.5 block">To Account</label>
                                        <select
                                            className={selectClass}
                                            value={txForm.target_account_id}
                                            onChange={e => setTxForm({ ...txForm, target_account_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Target</option>
                                            {accounts.filter(a => a.id !== txForm.account_id).map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                /* External Transfer: Account + Direction + Beneficiary */
                                <div className="space-y-3">
                                    {/* Direction Toggle */}
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setTxForm({ ...txForm, transfer_direction: 'outgoing' })}
                                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${txForm.transfer_direction === 'outgoing' ? 'bg-red-500/20 text-red-300 border border-red-500/50' : 'bg-slate-700 text-gray-400'}`}
                                        >
                                            ↑ Outgoing (Send)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTxForm({ ...txForm, transfer_direction: 'incoming' })}
                                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${txForm.transfer_direction === 'incoming' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' : 'bg-slate-700 text-gray-400'}`}
                                        >
                                            ↓ Incoming (Receive)
                                        </button>
                                    </div>

                                    {/* Account */}
                                    <div>
                                        <label className="text-gray-500 text-[10px] uppercase mb-0.5 block">
                                            {txForm.transfer_direction === 'outgoing' ? 'From Account' : 'To Account'}
                                        </label>
                                        <select
                                            className={selectClass}
                                            value={txForm.account_id}
                                            onChange={e => setTxForm({ ...txForm, account_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Account</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Beneficiary Name */}
                                    <div>
                                        <label className="text-gray-500 text-[10px] uppercase mb-0.5 block">
                                            {txForm.transfer_direction === 'outgoing' ? 'Beneficiary Name' : 'Sender Name'}
                                        </label>
                                        <input
                                            className={inputClass}
                                            value={txForm.merchant}
                                            onChange={e => setTxForm({ ...txForm, merchant: e.target.value })}
                                            placeholder={txForm.transfer_direction === 'outgoing' ? 'e.g. John Doe, SABB Bank' : 'e.g. Company Name, Friend'}
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">Account / Credit Card</label>
                            <select
                                className={selectClass}
                                value={`${txForm.source_type}:${txForm.source_id}`}
                                onChange={e => {
                                    const [type, id] = e.target.value.split(':');
                                    setTxForm({
                                        ...txForm,
                                        source_type: type,
                                        source_id: id,
                                        account_id: type === 'account' ? id : '',
                                        credit_card_id: type === 'credit_card' ? id : ''
                                    });
                                }}
                                required
                            >
                                <option value="">Select Account or Credit Card</option>
                                {accounts.length > 0 && (
                                    <optgroup label="💳 Bank Accounts">
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={`account:${acc.id}`}>
                                                {acc.name} {acc.last_4_digits ? `(•••${acc.last_4_digits})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {creditCards.length > 0 && (
                                    <optgroup label="💳 Credit Cards">
                                        {creditCards.map(cc => (
                                            <option key={cc.id} value={`credit_card:${cc.id}`}>
                                                {cc.card_name || cc.name} {cc.last_4_digits ? `(•••${cc.last_4_digits})` : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    )}

                    {/* Merchant - only show for non-transfer and internal transfers */}
                    {(txForm.type !== 'transfer' || txForm.is_internal) && (
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">
                                {txForm.type === 'transfer' ? 'Description (optional)' : 'Merchant / Description'}
                            </label>
                            <input
                                className={inputClass}
                                value={txForm.merchant}
                                onChange={e => setTxForm({ ...txForm, merchant: e.target.value })}
                                placeholder={txForm.type === 'transfer' ? 'e.g. Monthly savings' : 'e.g. Starbucks'}
                                required={txForm.type !== 'transfer'}
                            />
                        </div>
                    )}

                    {/* Amount */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1 block">Amount (SAR)</label>
                        <input type="number" step="0.01" className={inputClass} value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" required />
                    </div>

                    {/* Previous Balance - only show when editing existing transaction */}
                    {editingTx && txForm.source_type === 'account' && (
                        <div className="bg-slate-900/50 p-3 rounded-lg border border-blue-500/30">
                            <label className="text-blue-400 text-xs mb-1 block">
                                Previous Balance (Balance Before This Transaction)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                className={inputClass}
                                value={txForm.previous_balance}
                                onChange={e => setTxForm({ ...txForm, previous_balance: e.target.value })}
                                placeholder="Leave empty to keep current"
                            />
                            <p className="text-gray-500 text-xs mt-1">
                                Setting this will recalculate this transaction's balance and all subsequent transactions.
                            </p>
                        </div>
                    )}

                    {/* Category - hidden for transfers since it's auto-set */}
                    {txForm.type !== 'transfer' && (
                        <div>
                            <label className="text-gray-400 text-xs mb-1 block">Category</label>
                            <select className={selectClass} value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })}>
                                <option value="">Select Category</option>
                                {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                    )}

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
