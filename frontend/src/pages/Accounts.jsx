import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Wallet, PiggyBank, CreditCard, LayoutGrid, List, Receipt, CreditCard as ChipIcon, Edit3, Trash2, Plus, Search, Filter, MessageSquareText, User, Upload, RefreshCw } from 'lucide-react';
import { Card, SectionHeader, Modal, formatCurrency, inputClass, selectClass } from '../components/UI';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


// Get bank-specific card background image based on bank name and account type
const getBankCardTheme = (bankName, accountType) => {
    if (!bankName) return null;
    const n = bankName.toLowerCase().replace(/\s+/g, '');
    const isCreditCard = accountType === 'Credit Card';

    // STC Bank
    if (n.includes('stc')) {
        return {
            backgroundImage: '/banks/stc-card.png',
            fallbackGradient: 'linear-gradient(135deg, #7c3aed 0%, #581c87 100%)',
            textColor: 'text-white'
        };
    }
    // Alrajhi Bank
    if (n.includes('rajhi') || n.includes('alrajhi')) {
        return {
            backgroundImage: isCreditCard ? '/banks/alrajhi-credit.png' : '/banks/alrajhi-card.png',
            fallbackGradient: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
            textColor: 'text-white'
        };
    }
    // Jazira Bank (AJB)
    if (n.includes('jazira') || n.includes('ajb')) {
        return {
            backgroundImage: isCreditCard ? '/banks/jazira-credit.png' : '/banks/jazira-card.png',
            fallbackGradient: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            textColor: 'text-white'
        };
    }

    return null;
};

// Fallback gradient themes for banks without custom images
const getAccountTheme = (type) => {
    switch (type) {
        case 'Savings': return {
            // CSS gradient for Safari compatibility (Tailwind classes don't always work)
            backgroundGradient: 'linear-gradient(to bottom right, #059669, #134e4a)',
            icon: <PiggyBank className="w-5 h-5 text-emerald-200" />,
            text: 'text-emerald-100'
        };
        case 'Credit Card': return {
            backgroundGradient: 'linear-gradient(to bottom right, #7c3aed, #581c87)',
            icon: <CreditCard className="w-5 h-5 text-violet-200" />,
            text: 'text-violet-100'
        };
        default: return {
            // Default for Checking and other account types
            backgroundGradient: 'linear-gradient(to bottom right, #475569, #0f172a)',
            icon: <Wallet className="w-5 h-5 text-slate-200" />,
            text: 'text-slate-100'
        };
    }
};

// Get local logo path based on bank name
const getLocalLogo = (bankName) => {
    if (!bankName) return '/banks/bank2.png';
    const n = bankName.toLowerCase().replace(/\s+/g, '');

    if (n.includes('stc')) return '/banks/stc-logo.png';
    if (n.includes('rajhi') || n.includes('alrajhi')) return '/banks/alrajhi-logo.png';
    if (n.includes('jazira') || n.includes('ajb')) return '/banks/jazira-logo.png';
    if (n.includes('snb') || n.includes('ahli')) return '/banks/snb-logo.png';
    if (n.includes('riyad')) return '/banks/riyad-logo.png';
    if (n.includes('samba')) return '/banks/samba-logo.png';
    if (n.includes('arab') || n.includes('anb')) return '/banks/anb-logo.png';

    return '/banks/bank2.png';
};

const AccountCard = ({ acc, onEdit = null, onClick = null }) => {
    const theme = getAccountTheme(acc.account_type);
    const bankTheme = getBankCardTheme(acc.bank_name, acc.account_type);
    const isCreditCard = acc.account_type === 'Credit Card';
    const hasLimit = isCreditCard && acc.credit_limit > 0;
    const utilPercent = hasLimit ? Math.min(100, (Math.abs(acc.current_balance) / acc.credit_limit) * 100) : 0;
    const hasCustomBackground = !!bankTheme;

    // Determine if we should show mada or visa logo
    // Credit cards: show Visa
    // Checking/Savings with linked card (aliases): show Mada
    const hasLinkedCard = !isCreditCard && acc.aliases && acc.aliases.length > 0;
    const showVisa = isCreditCard;
    const showMada = hasLinkedCard;
    const cardDigits = isCreditCard ? acc.last_4_digits : (hasLinkedCard ? acc.aliases[0].last_4_digits : null);

    // Calculate padding percentage for 1.586:1 aspect ratio = 100 / 1.586 = 63.05%
    return (
        <div className="relative w-full" style={{ paddingBottom: '63.05%' }}>
            <div
                className={`absolute inset-0 rounded-xl p-5 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 border border-white/10 ${onClick ? 'cursor-pointer' : ''}`}
                style={{
                    // Background styling
                    backgroundImage: hasCustomBackground
                        ? `url(${bankTheme.backgroundImage})`
                        : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    // Apply gradient when no custom background image
                    ...(hasCustomBackground ? {} : { background: bankTheme?.fallbackGradient || theme.backgroundGradient })
                }}
                onClick={onClick}
            >
                {/* Background Decor - decorative blur circles */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/5 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-black/20 blur-3xl"></div>

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full justify-end">

                    {/* Edit Button */}
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(acc); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute top-3 right-3 p-1.5 bg-black/30 hover:bg-black/50 rounded-full backdrop-blur-md transition opacity-0 group-hover:opacity-100 z-20"
                        >
                            <Edit3 size={14} />
                        </button>
                    )}

                    {/* Footer (Balance and Payment Network Logo) */}
                    <div>
                        {/* Balance Row - Account name as label above balance */}
                        <div className="flex justify-between items-end mb-1">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider opacity-90 mb-0.5 drop-shadow-sm font-bold">{acc.name}</p>
                                <p className="text-2xl font-bold tracking-tight text-white drop-shadow-md">{formatCurrency(acc.current_balance)}</p>
                            </div>

                            {/* Right side: Payment Network Logo (Mada/Visa) */}
                            <div className="text-right flex flex-col items-end gap-1">
                                {/* Mada or Visa Logo */}
                                {showVisa && (
                                    <img src="/visa-logo.png" alt="Visa" className="h-6 w-auto object-contain drop-shadow-md" />
                                )}
                                {showMada && (
                                    <img src="/mada-logo.png" alt="Mada" className="h-10 w-auto object-contain drop-shadow-md" />
                                )}

                                {/* Card digits if available */}
                                {cardDigits && (
                                    <span className="text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-sm">
                                        •••• {cardDigits}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Utilization Bar for Credit Cards */}
                        {hasLimit && (
                            <div className="mt-2">
                                <div className="flex justify-between text-[10px] opacity-70 mb-0.5 drop-shadow-sm">
                                    <span>Credit Limit: {formatCurrency(acc.credit_limit)}</span>
                                    <span>{utilPercent.toFixed(0)}% Used</span>
                                </div>
                                <div className="w-full bg-black/30 h-1 rounded-full overflow-hidden backdrop-blur-sm">
                                    <div
                                        className={`h-full rounded-full shadow-sm transition-all duration-1000 ${utilPercent > 90 ? 'bg-red-400' : utilPercent > 50 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                                        style={{ width: `${utilPercent}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SortableAccountCard = ({ acc, onEdit, onClick }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: acc.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="h-full">
            {/* Drag handle wrapper - only this part captures drag events */}
            <div {...listeners} className="touch-none cursor-grab active:cursor-grabbing h-full">
                <AccountCard acc={acc} onEdit={onEdit} onClick={onClick} />
            </div>
        </div>
    );
};

const OverviewAccountRow = ({ acc, allTransactions }) => {
    const [expanded, setExpanded] = useState(false);

    // Filter transactions for this account
    // Assuming transactions have an account_id field. If not, matching by last_4 might be needed if account_id isn't populated on frontend.
    // Let's assume account_id is available or we match by simple heuristic for now.
    // Ideally backend sends account_id. Checking schemas.py would confirm. 
    // START_DEBUG: Assuming 'account_id' is present in transaction objects.
    const accountTransactions = allTransactions
        .filter(t => t.account_id === acc.id)
        .slice(0, 5); // Show top 5

    return (
        <div className="bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-700 w-full max-w-md mx-auto md:max-w-none">
            {/* Top Row: Balance & Logo */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-white tracking-tight">{formatCurrency(acc.current_balance)}</span>
                    </div>
                </div>
                {/* Logo Image */}
                <div className="flex flex-col items-end">
                    {acc.account_type === 'Credit Card' ? (
                        <img src="/visa-logo.png" alt="Visa" className="w-6 h-auto object-contain" />
                    ) : (
                        <img src="/mada-logo.png" alt="Mada" className="h-10 w-auto object-contain drop-shadow-md" />
                    )}
                </div>
            </div>

            {/* Middle Row: Name & Last 4 */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-300 font-medium text-sm">{acc.name}</span>
                <span className="text-gray-500 text-xs">•</span>
                <span className="text-gray-400 text-sm font-mono">{acc.last_4_digits}</span>
            </div>

            {/* Bottom Row: View Transactions Toggle */}
            <div className="border-t border-white/10 pt-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex justify-between items-center text-blue-400 text-xs font-medium hover:text-blue-300 transition-colors w-full"
                >
                    <span>View Transactions</span>
                    <svg
                        className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Expanded Content: Transactions List */}
            {expanded && (
                <div className="mt-3 space-y-2 animate-fade-in border-t border-white/5 pt-2">
                    {accountTransactions.length > 0 ? (
                        accountTransactions.map(tx => (
                            <div key={tx.id} className="flex justify-between items-center text-xs py-1.5 border-b border-white/5 last:border-0">
                                <div>
                                    <p className="text-white truncate max-w-[150px]">{tx.merchant}</p>
                                    <p className="text-[10px] text-gray-500">{new Date(tx.timestamp).toLocaleDateString()}</p>
                                </div>
                                <span className="text-red-400 font-mono">-{formatCurrency(tx.amount)}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-[10px] text-gray-500 italic py-1">No recent transactions.</p>
                    )}
                    <button className="text-[10px] text-center text-gray-500 w-full pt-1 hover:text-white transition">View All in Transactions Tab</button>
                </div>
            )}
        </div>
    );
};

const Accounts = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Initialize activeTab: Strictly from URL to ensure History works
    const activeTab = searchParams.get('tab') || 'overview';

    // Sync URL on mount if missing
    useEffect(() => {
        if (!searchParams.get('tab')) {
            const saved = localStorage.getItem('finance_accounts_tab');
            if (saved) {
                setSearchParams({ tab: saved }, { replace: true });
            }
        }
    }, [searchParams, setSearchParams]);

    // Save to localStorage whenever tab changes
    useEffect(() => {
        if (searchParams.get('tab')) {
            localStorage.setItem('finance_accounts_tab', searchParams.get('tab'));
        }
    }, [searchParams]);
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    // Filtering & Sorting State — persisted to sessionStorage
    const _storedAccFilters = (() => { try { const s = sessionStorage.getItem('filters_accounts'); return s ? JSON.parse(s) : {}; } catch { return {}; } })();
    const _persistAcc = (key, val) => { try { const cur = JSON.parse(sessionStorage.getItem('filters_accounts') || '{}'); cur[key] = val; sessionStorage.setItem('filters_accounts', JSON.stringify(cur)); } catch { } };
    const [searchTerm, setSearchTermRaw] = useState(_storedAccFilters.searchTerm || '');
    const [categoryFilter, setCategoryFilterRaw] = useState(_storedAccFilters.categoryFilter || '');
    const [accountFilter, setAccountFilterRaw] = useState(_storedAccFilters.accountFilter || '');
    const [typeFilter, setTypeFilterRaw] = useState(_storedAccFilters.typeFilter || '');
    const [dateRange, setDateRangeRaw] = useState(_storedAccFilters.dateRange || { start: '', end: '' });
    const setSearchTerm = (v) => { setSearchTermRaw(v); _persistAcc('searchTerm', v); };
    const setCategoryFilter = (v) => { setCategoryFilterRaw(v); _persistAcc('categoryFilter', v); };
    const setAccountFilter = (v) => { setAccountFilterRaw(v); _persistAcc('accountFilter', v); };
    const setTypeFilter = (v) => { setTypeFilterRaw(v); _persistAcc('typeFilter', v); };
    const setDateRange = (v) => { setDateRangeRaw(v); _persistAcc('dateRange', v); };

    // Bulk Selection State
    const [selectedTxIds, setSelectedTxIds] = useState(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Order State
    const [accountOrder, setAccountOrder] = useState([]);

    // Sensors for DnD
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setAccountOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('accounts_layout', JSON.stringify(newOrder));
                return newOrder;
            });
        }
    };

    // Account Modal State
    // Account Modal State
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [accountForm, setAccountForm] = useState({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [], is_income: false, notes: '' });

    // Transaction Modal State
    const [showTxModal, setShowTxModal] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [txForm, setTxForm] = useState({
        account_id: '',
        amount: '',
        merchant: '',
        category: '',
        notes: '',
        timestamp: new Date().toISOString().split('T')[0]
    });

    const Categories = ['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Housing', 'Health', 'Income', 'Transfer', 'Subscription', 'Obligation', 'Credit Card Payment', 'Deposit', 'Refund'];
    // Transaction type (credit/debit) is now determined by tx.type from the Agent, not category
    // Backward compatibility fallback for legacy transactions without type field
    const LEGACY_CREDIT_CATEGORIES = ['Income', 'Deposit', 'Refund', 'Interest'];
    const isCredit = (tx) => tx.type ? tx.type === 'credit' : LEGACY_CREDIT_CATEGORIES.includes(tx.category);
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [accRes, txRes] = await Promise.all([
                axios.get(`${API_URL}/accounts/`),
                axios.get(`${API_URL}/transactions/`)
            ]);
            setAccounts(accRes.data);
            setTransactions(txRes.data);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Derived Data
    useEffect(() => {
        if (accounts.length > 0) {
            const savedLayout = JSON.parse(localStorage.getItem('accounts_layout') || '[]');
            const currentIds = accounts.map(a => a.id);

            // Filter saved layout to remove deleted accounts
            const validSaved = savedLayout.filter(id => currentIds.includes(id));

            // Find new accounts not in layout
            const newAccounts = accounts.filter(a => !validSaved.includes(a.id));

            // Sort new accounts by type (default logic)
            const sortOrder = { 'Checking': 1, 'Savings': 2, 'Credit Card': 3 };
            newAccounts.sort((a, b) => (sortOrder[a.account_type] || 99) - (sortOrder[b.account_type] || 99));

            // Combine
            const finalOrder = [...validSaved, ...newAccounts.map(a => a.id)];

            // Auto-save the determined order to lock it in (prevents jumping on edit)
            if (JSON.stringify(finalOrder) !== JSON.stringify(savedLayout)) {
                localStorage.setItem('accounts_layout', JSON.stringify(finalOrder));
            }

            // Only update if different to avoid infinite loop (though array ref changes, checking length/content helps)
            setAccountOrder(finalOrder);
        }
    }, [accounts]);

    const sortedAccounts = accountOrder
        .map(id => accounts.find(a => a.id === id))
        .filter(Boolean); // Filter out any undefined if sync issues occur


    const filteredTransactions = transactions.filter(tx => {
        // Search Term (Merchant or Category)
        const matchSearch = tx.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (tx.category && tx.category.toLowerCase().includes(searchTerm.toLowerCase()));

        // Category Filter
        const matchCategory = categoryFilter ? tx.category === categoryFilter : true;

        // Account Filter
        const matchAccount = accountFilter ? tx.account_id === accountFilter : true;

        // Type Filter (Credit vs Debit vs Transfer) - uses tx.type from Agent with fallback
        const txIsCredit = isCredit(tx);
        const isTransfer = tx.category === 'Transfer';
        let matchType = true;
        if (typeFilter === 'Credit') matchType = txIsCredit;
        else if (typeFilter === 'Debit') matchType = !txIsCredit && !isTransfer;
        else if (typeFilter === 'Transfer') matchType = isTransfer;

        // Date Range Filter
        let matchDate = true;
        if (dateRange.start) matchDate = matchDate && tx.timestamp >= dateRange.start;
        if (dateRange.end) matchDate = matchDate && tx.timestamp.split('T')[0] <= dateRange.end;

        return matchSearch && matchCategory && matchAccount && matchType && matchDate;
    });

    // --- Account Handlers ---
    // (Existing Handlers will remain below, we just insert Tx handlers before return)

    // --- Transaction Handlers ---
    const openTxModal = (tx = null) => {
        if (tx) {
            setEditingTx(tx);
            setTxForm({
                account_id: tx.account_id,
                amount: tx.amount,
                merchant: tx.merchant,
                category: tx.category || '',
                notes: tx.notes || '',
                timestamp: tx.timestamp ? new Date(tx.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            });
        } else {
            setEditingTx(null);
            setTxForm({
                account_id: accounts.length > 0 ? accounts[0].id : '',
                amount: '',
                merchant: '',
                category: '',
                notes: '',
                timestamp: new Date().toISOString().split('T')[0]
            });
        }
        setShowTxModal(true);
    };

    const handleSaveTx = async (e) => {
        e.preventDefault();
        try {
            if (editingTx) {
                await axios.put(`${API_URL}/transactions/${editingTx.id}`, {
                    merchant: txForm.merchant,
                    category: txForm.category,
                    amount: parseFloat(txForm.amount),
                    account_id: txForm.account_id,
                    notes: txForm.notes,
                    timestamp: new Date(txForm.timestamp).toISOString()
                });
            } else {
                await axios.post(`${API_URL}/transactions/`, {
                    ...txForm,
                    amount: parseFloat(txForm.amount),
                    timestamp: new Date(txForm.timestamp).toISOString()
                });
            }
            setShowTxModal(false);
            fetchData();
        } catch (err) { alert('Error saving transaction'); }
    };

    const handleDeleteTx = async (id) => {
        if (confirm('Are you sure you want to delete this transaction?')) {
            try {
                await axios.delete(`${API_URL}/transactions/${id}`);
                fetchData();
            } catch (err) { alert('Error deleting transaction'); }
        }
    };

    const handleDeleteAccount = async () => {
        if (!editingId || !confirm('Are you sure you want to delete this account? This action cannot be undone.')) return;
        try {
            await axios.delete(`${API_URL}/accounts/${editingId}`);
            setShowAccountModal(false);
            setEditingId(null);
            fetchData();
        } catch (err) { alert('Error deleting account'); }
    };

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        try {
            // Sanitize payload: valid float or null
            const payload = {
                ...accountForm,
                credit_limit: accountForm.credit_limit ? parseFloat(accountForm.credit_limit) : null
            };
            // Remove aliases from payload if sending to main account endpoint
            delete payload.aliases;

            if (editingId) {
                await axios.put(`${API_URL}/accounts/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/accounts/`, payload);
            }
            setShowAccountModal(false);
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [], bank_name: '', bank_logo_url: '', is_income: false });
            fetchData();
        } catch (err) { alert('Error saving account'); }
    };

    const openAccountModal = (acc = null) => {
        if (acc) {
            setEditingId(acc.id);
            setAccountForm({
                name: acc.name,
                account_type: acc.account_type,
                last_4_digits: acc.last_4_digits,
                current_balance: acc.current_balance,
                credit_limit: acc.credit_limit || '',
                aliases: acc.aliases || [],
                bank_name: acc.bank_name || '',
                bank_logo_url: acc.bank_logo_url || '',
                bank_website: acc.bank_logo_url ? acc.bank_logo_url.replace('https://logo.clearbit.com/', '') : '',
                is_income: acc.is_income || false,
                notes: acc.notes || ''
            });
        } else {
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [], bank_name: '', bank_logo_url: '', bank_website: '', is_income: false, notes: '' });
        }
        setShowAccountModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white">Loading Accounts...</div>;

    const totalBalance = accounts.reduce((acc, item) => acc + item.current_balance, 0);

    return (
        <div>
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white">Accounts</h1>
                    <p className="text-gray-400">Manage your bank accounts and credit cards</p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg mb-8 w-fit border border-slate-700">
                <button
                    onClick={() => setSearchParams({ tab: 'overview' })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <LayoutGrid size={16} /> Overview
                </button>
                <button
                    onClick={() => setSearchParams({ tab: 'manager' })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'manager' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <List size={16} /> Manager
                </button>
                <button
                    onClick={() => setSearchParams({ tab: 'transactions' })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <Receipt size={16} /> Transactions
                </button>
            </div>

            {/* --- OVERVIEW TAB --- */}
            {activeTab === 'overview' && (
                <div className="animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card title="Total Net Worth" value={formatCurrency(totalBalance)} color="green" />
                        <Card title="Active Accounts" value={accounts.length} color="indigo" />
                        <Card title="Recent Transactions" value={transactions.length} color="blue" />
                    </div>

                    {/* Group accounts by type */}
                    {(() => {
                        const grouped = sortedAccounts.reduce((acc, account) => {
                            const type = account.account_type || 'Other';
                            if (!acc[type]) acc[type] = [];
                            acc[type].push(account);
                            return acc;
                        }, {});

                        // Define order and styling for account types
                        const typeConfig = {
                            'Credit Card': { icon: '💳', color: 'text-pink-400', order: 1 },
                            'Checking': { icon: '🏦', color: 'text-blue-400', order: 2 },
                            'Savings': { icon: '💰', color: 'text-emerald-400', order: 3 },
                            'Investment': { icon: '📈', color: 'text-purple-400', order: 4 },
                            'Loan': { icon: '📋', color: 'text-orange-400', order: 5 },
                            'Other': { icon: '📁', color: 'text-gray-400', order: 99 }
                        };

                        // Sort types by order
                        const sortedTypes = Object.keys(grouped).sort((a, b) => {
                            const orderA = typeConfig[a]?.order || 99;
                            const orderB = typeConfig[b]?.order || 99;
                            return orderA - orderB;
                        });

                        return sortedTypes.map(type => {
                            const config = typeConfig[type] || typeConfig['Other'];
                            const typeAccounts = grouped[type];
                            const typeTotal = typeAccounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

                            return (
                                <div key={type} className="mb-8">
                                    {/* Section Header */}
                                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{config.icon}</span>
                                            <h2 className={`text-xl font-bold ${config.color}`}>{type}</h2>
                                            <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-700">
                                                {typeAccounts.length}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 uppercase tracking-wider">Total</span>
                                            <div className={`text-lg font-bold font-mono ${typeTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {formatCurrency(typeTotal)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Account Cards Grid */}
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            <SortableContext items={typeAccounts.map(a => a.id)} strategy={rectSortingStrategy}>
                                                {typeAccounts.map(acc => (
                                                    <SortableAccountCard
                                                        key={acc.id}
                                                        acc={acc}
                                                        onEdit={openAccountModal}
                                                        onClick={() => navigate(`/transactions?account_id=${acc.id}`)}
                                                    />
                                                ))}
                                            </SortableContext>
                                        </div>
                                    </DndContext>
                                </div>
                            );
                        });
                    })()}

                    {/* Add New Account Button */}
                    <button
                        onClick={() => openAccountModal(null)}
                        className="w-full max-w-xs mx-auto aspect-[1.586/1] rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group flex flex-col items-center justify-center gap-3"
                    >
                        <div className="p-4 bg-slate-800 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors text-slate-400">
                            <Plus size={24} />
                        </div>
                        <span className="text-sm font-medium text-slate-400 group-hover:text-white">Add Account</span>
                    </button>
                </div>
            )}

            {/* --- MANAGER TAB --- */}
            {activeTab === 'manager' && (
                <div className="animate-fade-in">
                    <SectionHeader title="Manage Accounts" onAdd={() => openAccountModal(null)} />

                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-700">
                            <thead className="bg-slate-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Account Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last 4</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider pl-8">Aliases</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-slate-800 divide-y divide-slate-700">
                                {sortedAccounts.map(acc => (
                                    <tr key={acc.id} className="hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{acc.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{acc.account_type}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">•••• {acc.last_4_digits}</td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${acc.current_balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {formatCurrency(acc.current_balance)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm pl-8">
                                            {acc.aliases && acc.aliases.length > 0 ? (
                                                <div className="flex gap-1 flex-wrap">
                                                    {acc.aliases.map(a => (
                                                        <span key={a.id} className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full border border-slate-600 text-gray-400">
                                                            {a.alias_name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 italic text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(`Recalculate ${acc.name} balance from transactions?`)) return;
                                                        try {
                                                            const res = await axios.post(`${API_URL}/accounts/${acc.id}/recalculate-balance`);
                                                            const d = res.data;
                                                            const fmt = (v) => v.toLocaleString('en-SA', {style:'currency',currency:'SAR'});
                                                            const baseline = d.baseline != null ? `\nBaseline: ${fmt(d.baseline)} (${d.baseline_tx})` : '';
                                                            const corrections = d.corrections > 0 ? `\n⚡ ${d.corrections} transaction(s) corrected` : '\n✅ All transactions OK';
                                                            alert(`${acc.name}${baseline}\nOld: ${fmt(d.old_balance)}\nNew: ${fmt(d.new_balance)}\nDiff: ${fmt(d.new_balance - d.old_balance)}\n(${d.transaction_count} transactions)${corrections}`);
                                                            fetchData();
                                                        } catch (e) { alert('Recalculate failed'); }
                                                    }}
                                                    className="text-amber-400 hover:text-amber-300 transition-colors p-2 bg-slate-700/50 rounded-lg hover:bg-slate-700"
                                                    title="Recalculate balance from transactions"
                                                >
                                                    <RefreshCw size={16} />
                                                </button>
                                                <button
                                                    onClick={() => openAccountModal(acc)}
                                                    className="text-blue-400 hover:text-blue-300 transition-colors p-2 bg-slate-700/50 rounded-lg hover:bg-slate-700"
                                                >
                                                    <Edit3 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {accounts.length === 0 && (
                                    <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">No accounts found. Add one to get started.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TRANSACTIONS TAB --- */}
            {activeTab === 'transactions' && (
                <div className="animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <SectionHeader title="Transaction Log" />
                        <div className="flex gap-2">
                            {isSelectionMode && selectedTxIds.size > 0 && (
                                <button
                                    onClick={async () => {
                                        if (!window.confirm(`Delete ${selectedTxIds.size} transaction(s)?`)) return;
                                        try {
                                            await axios.post(`${API_URL}/transactions/bulk-delete`, { ids: Array.from(selectedTxIds) });
                                            setSelectedTxIds(new Set());
                                            setIsSelectionMode(false);
                                            fetchData();
                                        } catch (e) {
                                            console.error('Bulk delete failed', e);
                                            alert('Delete failed');
                                        }
                                    }}
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
                                    <option value="">All Accounts</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
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

                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
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
                                                title="Select All"
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
                                    const acc = accounts.find(a => a.id === tx.account_id);
                                    const txIsCredit = isCredit(tx); // Use helper with fallback
                                    const isTransfer = tx.category === 'Transfer';

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
                                                {acc ? (
                                                    <div className="flex flex-col">
                                                        <span>{acc.name}</span>
                                                        <span className="text-xs text-gray-500 font-mono">•••• {acc.last_4_digits}</span>
                                                    </div>
                                                ) : <span className="text-gray-500">Unknown Account</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                                {isTransfer && <span className="text-xs text-blue-400 mr-2 uppercase font-bold tracking-wider">{txIsCredit ? 'FROM:' : 'TO:'}</span>}
                                                {tx.merchant}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                {tx.category ? <span className={`px-2 py-0.5 rounded text-xs border ${txIsCredit ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : 'bg-slate-700 text-blue-300 border-slate-600'}`}>{tx.category}</span> : '-'}
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${txIsCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {txIsCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-mono">
                                                {tx.balance_after_transaction !== null && tx.balance_after_transaction !== undefined
                                                    ? formatCurrency(tx.balance_after_transaction)
                                                    : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => openTxModal(tx)} className="text-blue-400 hover:text-blue-300 p-1"><Edit3 size={16} /></button>
                                                    <button onClick={() => handleDeleteTx(tx.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredTransactions.length === 0 && (
                                    <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">No transactions recorded yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {showTxModal && (
                <Modal isOpen={true} title={editingTx ? "Edit Transaction" : "Add Transaction"} onClose={() => setShowTxModal(false)}>
                    <form onSubmit={handleSaveTx} className="space-y-4">
                        {/* Transaction Type Indicator */}
                        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-700 rounded-lg mb-4">
                            <button
                                type="button"
                                onClick={() => setTxForm(f => ({ ...f, type: 'debit' }))}
                                className={`py-1.5 text-xs font-bold uppercase rounded-md transition text-center ${txForm.type === 'debit' ? 'bg-red-600 text-white' : 'bg-slate-800 text-gray-400 hover:bg-slate-600'}`}
                            >
                                Expense
                            </button>
                            <button
                                type="button"
                                onClick={() => setTxForm(f => ({ ...f, type: 'credit' }))}
                                className={`py-1.5 text-xs font-bold uppercase rounded-md transition text-center ${txForm.type === 'credit' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-gray-400 hover:bg-slate-600'}`}
                            >
                                Income
                            </button>
                            <button
                                type="button"
                                onClick={() => setTxForm(f => ({ ...f, type: 'transfer', category: 'Transfer' }))}
                                className={`py-1.5 text-xs font-bold uppercase rounded-md transition text-center ${txForm.type === 'transfer' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-gray-400 hover:bg-slate-600'}`}
                            >
                                Transfer
                            </button>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Account</label>
                            <select
                                required
                                className={selectClass}
                                value={txForm.account_id}
                                onChange={e => setTxForm({ ...txForm, account_id: e.target.value })}
                            >
                                <option value="" disabled>Select Account</option>
                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (...{acc.last_4_digits})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Merchant</label>
                            <input
                                type="text" required placeholder="Starbucks, Uber, etc."
                                className={inputClass}
                                value={txForm.merchant}
                                onChange={e => setTxForm({ ...txForm, merchant: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Amount</label>
                            <input
                                type="number" required step="0.01" placeholder="0.00"
                                className={inputClass}
                                value={txForm.amount}
                                onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Category</label>
                            <select
                                className={selectClass}
                                value={txForm.category}
                                onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                            >
                                <option value="">Select Category (Optional)</option>
                                {Categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Date</label>
                            <input
                                type="date" required
                                className={inputClass}
                                value={txForm.timestamp}
                                onChange={e => setTxForm({ ...txForm, timestamp: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase font-bold mb-1 block">Notes</label>
                            <textarea
                                placeholder="Optional details..."
                                className={`${inputClass} h-20 resize-none`}
                                value={txForm.notes}
                                onChange={e => setTxForm({ ...txForm, notes: e.target.value })}
                            />
                        </div>

                        {/* Show Raw SMS if available (read-only) */}
                        {editingTx?.raw_sms_content && (
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
                                <label className="text-xs text-gray-400 uppercase font-bold mb-2 block flex items-center gap-2">
                                    <img src="/sms-icon.png" alt="SMS" className="w-4 h-4" />
                                    Original SMS
                                </label>
                                <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded max-h-32 overflow-y-auto">
                                    {editingTx.raw_sms_content}
                                </pre>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-6">
                            <button type="button" onClick={() => setShowTxModal(false)} className="px-4 py-2 text-gray-300 hover:text-white transition">Cancel</button>
                            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-lg border border-green-500">Save Transaction</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* --- ACCOUNT MODAL (Shared) --- */}
            {showAccountModal && (
                <Modal isOpen={true} title={editingId ? "Edit Account" : "Add New Account"} onClose={() => setShowAccountModal(false)}>
                    <form onSubmit={handleSaveAccount} className="space-y-4">
                        <div className="space-y-4">
                            {/* Bank Name & Logo */}
                            <div className="flex gap-2 items-start">
                                <div className="flex-1">
                                    <div>
                                        <label className="text-xs text-gray-400 mb-1 block">Bank Name <span className="text-red-400">*</span></label>
                                        <input
                                            type="text"
                                            placeholder="e.g. AlJazira (AJB) or SNB"
                                            required
                                            className={inputClass}
                                            value={accountForm.bank_name || ''}
                                            onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })}
                                            onBlur={(e) => {
                                                if (e.target.value) {
                                                    const logo = getLocalLogo(e.target.value);
                                                    setAccountForm(prev => ({
                                                        ...prev,
                                                        bank_logo_url: logo,
                                                        bank_website: '' // Clear website legacy
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">Using local icons (Focus: AJB & Other).</p>
                                </div>
                                <div className="mt-5 flex flex-col items-center gap-2">
                                    {(accountForm.bank_logo_url || accountForm.bank_name) && (
                                        <img
                                            src={(accountForm.bank_logo_url && accountForm.bank_logo_url.startsWith('/')) ? accountForm.bank_logo_url : (accountForm.bank_logo_url || getLocalLogo(accountForm.bank_name))}
                                            alt="Logo"
                                            className="w-10 h-10 rounded-xl bg-slate-800 p-1 object-contain border border-slate-600 shadow-sm"
                                            onError={(e) => { e.target.src = '/banks/bank2.png'; }}
                                        />
                                    )}
                                    {/* Tiny Input for Custom URL */}
                                    <input
                                        type="text"
                                        placeholder="Logo URL"
                                        className="w-20 text-[10px] bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-gray-400 focus:w-48 transition-all"
                                        value={accountForm.bank_logo_url || ''}
                                        onChange={e => setAccountForm({ ...accountForm, bank_logo_url: e.target.value })}
                                        title="Paste a custom logo URL here"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600 my-4">
                                <input
                                    type="checkbox"
                                    id="isIncome"
                                    checked={accountForm.is_income || false}
                                    onChange={e => setAccountForm({ ...accountForm, is_income: e.target.checked })}
                                    className="w-5 h-5 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-slate-700 cursor-pointer"
                                />
                                <label htmlFor="isIncome" className="text-sm font-medium text-gray-300 select-none cursor-pointer">
                                    Mark as Income Account (Salary/Deposit)
                                </label>
                            </div>

                            {/* Account Details */}
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Account Label</label>
                                <input type="text" placeholder="e.g. Salary Account" required className={inputClass} value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                            </div>

                            <select className={selectClass} value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}>
                                <option value="Checking">Checking</option>
                                <option value="Savings">Savings</option>
                                <option value="Credit Card">Credit Card</option>
                            </select>

                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Last 4 Digits (Optional)" className={inputClass} value={accountForm.last_4_digits} onChange={e => setAccountForm({ ...accountForm, last_4_digits: e.target.value })} />
                                <input type="number" step="0.01" placeholder="Current Balance" required className={inputClass} value={accountForm.current_balance} onChange={e => setAccountForm({ ...accountForm, current_balance: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                                <textarea
                                    placeholder="Account details, purpose, etc."
                                    className={`${inputClass} h-20 resize-none`}
                                    value={accountForm.notes}
                                    onChange={e => setAccountForm({ ...accountForm, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Credit Limit Input (Only for Credit Cards) */}
                        {accountForm.account_type === 'Credit Card' && (
                            <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                                <label className="text-xs text-gray-400 uppercase font-semibold">Credit Limit</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Enter Credit Limit"
                                    className={`${inputClass} mt-1`}
                                    value={accountForm.credit_limit || ''}
                                    onChange={e => setAccountForm({ ...accountForm, credit_limit: e.target.value })}
                                />
                            </div>
                        )}

                        {/* Income Account Toggle */}
                        <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded border border-slate-600">
                            <input
                                type="checkbox"
                                id="is_income"
                                checked={accountForm.is_income || false}
                                onChange={e => setAccountForm({ ...accountForm, is_income: e.target.checked })}
                                className="w-4 h-4 accent-emerald-500"
                            />
                            <label htmlFor="is_income" className="text-sm text-gray-300">
                                <span className="font-medium">Income Account</span>
                                <span className="text-gray-500 text-xs block">Use as source for Smart Allocation (e.g., Salary)</span>
                            </label>
                        </div>

                        <div className="flex justify-between items-center mt-6 gap-3">
                            {editingId && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleDeleteAccount}
                                        className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 px-3 py-2 hover:bg-red-500/10 rounded-lg transition border border-transparent hover:border-red-500/30"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                const res = await axios.post(`${API_URL}/accounts/${editingId}/recalculate-balance`);
                                                const d = res.data;
                                                const diff = d.new_balance - d.old_balance;
                                                const diffStr = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
                                                alert(
                                                    `Balance Recalculated ✅\n\n` +
                                                    `Old: ${d.old_balance.toFixed(2)}\n` +
                                                    `New: ${d.new_balance.toFixed(2)} (${diffStr})\n\n` +
                                                    `Credits: ${d.total_credits.toFixed(2)}\n` +
                                                    `Debits: ${d.total_debits.toFixed(2)}\n` +
                                                    `Fees: ${d.total_fees.toFixed(2)}\n` +
                                                    `Transactions: ${d.transaction_count}`
                                                );
                                                setAccountForm(prev => ({ ...prev, current_balance: d.new_balance }));
                                                fetchData();
                                            } catch (err) { alert('Failed to recalculate: ' + (err.response?.data?.detail || err.message)); }
                                        }}
                                        className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 px-3 py-2 hover:bg-blue-500/10 rounded-lg transition border border-transparent hover:border-blue-500/30"
                                    >
                                        <RefreshCw size={14} /> Recalculate
                                    </button>
                                </div>
                            )}
                            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex-1 shadow-md border border-green-500 transition">
                                Save Account
                            </button>
                        </div>
                    </form>

                    {/* Linked Aliases Section (Only when editing) */}
                    {editingId && (
                        <div className="mt-6 pt-4 border-t border-slate-700">
                            <h3 className="text-sm font-bold text-gray-300 mb-2">Linked Cards / Identifiers</h3>
                            <div className="space-y-2 mb-3">
                                {accountForm.aliases && accountForm.aliases.map(alias => (
                                    <div key={alias.id} className="flex justify-between items-center bg-slate-700/50 p-2 rounded text-sm">
                                        <span>{alias.alias_name} (x{alias.last_4_digits})</span>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Delete this alias?')) return;
                                                try {
                                                    await axios.delete(`${API_URL}/aliases/${alias.id}`);
                                                    // Refresh list locally
                                                    setAccountForm(prev => ({
                                                        ...prev,
                                                        aliases: prev.aliases.filter(a => a.id !== alias.id)
                                                    }));
                                                    fetchData(); // Sync global state
                                                } catch (err) { alert('Failed to delete alias'); }
                                            }}
                                            className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                {(!accountForm.aliases || accountForm.aliases.length === 0) && (
                                    <p className="text-xs text-gray-500 italic">No linked cards yet.</p>
                                )}
                            </div>

                            {/* Add Alias Mini-Form */}
                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const aliasName = e.target.aliasName.value;
                                    const aliasLast4 = e.target.aliasLast4.value;
                                    if (!aliasName || !aliasLast4) return;

                                    try {
                                        const res = await axios.post(`${API_URL}/accounts/${editingId}/aliases`, {
                                            alias_name: aliasName,
                                            last_4_digits: aliasLast4
                                        });
                                        // Update UI
                                        setAccountForm(prev => ({
                                            ...prev,
                                            aliases: [...(prev.aliases || []), res.data]
                                        }));
                                        e.target.reset();
                                        fetchData();
                                    } catch (err) { alert('Failed to add alias'); }
                                }}
                                className="flex gap-2"
                            >
                                <input name="aliasName" type="text" placeholder="Name (e.g. Virtual Card)" className={inputClass + " text-xs"} required />
                                <input name="aliasLast4" type="text" placeholder="Last 4" className={inputClass + " w-20 text-xs"} required maxLength={4} />
                                <button type="submit" className="bg-slate-700 text-blue-300 text-xs px-3 rounded hover:bg-slate-600">Add</button>
                            </form>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default Accounts;
