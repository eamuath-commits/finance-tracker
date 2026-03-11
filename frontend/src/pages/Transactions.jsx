import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSearchParams } from 'react-router-dom';
import { format } from "date-fns";
import { Search, Edit3, Trash2, Plus, User, Calendar, Filter, X, MessageSquare, Upload, ChevronLeft, ChevronRight } from "lucide-react";
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
    const [periodStartDay, setPeriodStartDay] = useState(1);
    const [monthOffset, setMonthOffset] = useState(null); // null = no month filter active

    // Confirm modal state (replaces window.confirm for Chrome compatibility)
    const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });

    // Resolve discrepancy modal state
    const [resolveModal, setResolveModal] = useState({ open: false, tx: null, discrepancy: null });
    const [resolveReason, setResolveReason] = useState('');

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

    // Filter State — persisted to sessionStorage
    const storedFilters = (() => {
        try {
            const s = sessionStorage.getItem('filters_transactions');
            return s ? JSON.parse(s) : {};
        } catch { return {}; }
    })();
    const saveFilters = (f) => { try { sessionStorage.setItem('filters_transactions', JSON.stringify(f)); } catch { } };

    const [searchTerm, setSearchTermRaw] = useState(storedFilters.searchTerm || '');
    const [accountFilter, setAccountFilterRaw] = useState(storedFilters.accountFilter || '');
    const [typeFilter, setTypeFilterRaw] = useState(storedFilters.typeFilter || '');
    const [categoryFilter, setCategoryFilterRaw] = useState(storedFilters.categoryFilter || '');
    const [dateRange, setDateRangeRaw] = useState(storedFilters.dateRange || { start: '', end: '' });
    const [sortColumn, setSortColumnRaw] = useState(storedFilters.sortColumn || 'date');
    const [sortDir, setSortDirRaw] = useState(storedFilters.sortDir || 'desc');
    const [countLimit, setCountLimitRaw] = useState(storedFilters.countLimit || '');

    // Wrap setters to persist to sessionStorage
    const persist = (key, val) => { const cur = JSON.parse(sessionStorage.getItem('filters_transactions') || '{}'); cur[key] = val; saveFilters(cur); };
    const setSearchTerm = (v) => { setSearchTermRaw(v); persist('searchTerm', v); };
    const setAccountFilter = (v) => { setAccountFilterRaw(v); persist('accountFilter', v); };
    const setTypeFilter = (v) => { setTypeFilterRaw(v); persist('typeFilter', v); };
    const setCategoryFilter = (v) => { setCategoryFilterRaw(v); persist('categoryFilter', v); };
    const setDateRange = (v) => { setDateRangeRaw(v); persist('dateRange', v); };
    const setSortColumn = (v) => { setSortColumnRaw(v); persist('sortColumn', v); };
    const setSortDir = (v) => { setSortDirRaw(v); persist('sortDir', v); };
    const setCountLimit = (v) => { setCountLimitRaw(v); persist('countLimit', v); };

    // Initialize filter from URL params (for navigation from account/credit card pages)
    useEffect(() => {
        const accountId = searchParams.get('account_id');
        const creditCardId = searchParams.get('credit_card_id');

        if (accountId) {
            setAccountFilter(accountId);
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', account_id: accountId });
            }
        } else if (creditCardId) {
            setAccountFilter(creditCardId);
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', credit_card_id: creditCardId });
            }
        }

        const categoryParam = searchParams.get('category');
        if (categoryParam) {
            setCategoryFilter(categoryParam);
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', category: categoryParam });
            }
        }

        const merchantParam = searchParams.get('merchant');
        if (merchantParam) {
            setSearchTerm(merchantParam);
            if (activeTab !== 'all') {
                setSearchParams({ tab: 'all', merchant: merchantParam });
            }
        }
    }, [searchParams]);

    // Fetch periodStartDay from settings
    useEffect(() => {
        axios.get(`${API_URL}/settings`).then(res => {
            const val = res.data?.period_start_day?.value;
            if (val) setPeriodStartDay(parseInt(val) || 1);
        }).catch(() => { });
    }, []);

    // Compute month period date range from monthOffset + periodStartDay
    const monthPeriod = useMemo(() => {
        if (monthOffset === null) return null;
        const now = new Date();
        const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const y = targetMonth.getFullYear();
        const m = targetMonth.getMonth(); // 0-indexed

        let start, end;
        if (periodStartDay === 1) {
            // Standard: 1st to last day of month
            start = new Date(y, m, 1);
            end = new Date(y, m + 1, 0); // last day
        } else {
            // Custom cycle: e.g. 25th of prev month to 24th of this month
            start = new Date(y, m - 1, periodStartDay);
            end = new Date(y, m, periodStartDay - 1);
        }

        const label = targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { start: fmtDate(start), end: fmtDate(end), label };
    }, [monthOffset, periodStartDay]);

    // When monthPeriod changes, update dateRange
    useEffect(() => {
        if (monthPeriod) {
            setDateRange({ start: monthPeriod.start, end: monthPeriod.end });
        }
    }, [monthPeriod]);

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

        // Sort by selected column
        const sorted = filtered.sort((a, b) => {
            let cmp = 0;
            switch (sortColumn) {
                case 'category':
                    cmp = (a.category || '').localeCompare(b.category || '');
                    break;
                case 'amount':
                    cmp = a.amount - b.amount;
                    break;
                case 'balance':
                    cmp = (a.balance_after ?? 0) - (b.balance_after ?? 0);
                    break;
                case 'date':
                default:
                    cmp = new Date(a.timestamp) - new Date(b.timestamp);
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        // Apply count limit if set
        if (countLimit && !isNaN(parseInt(countLimit))) {
            return sorted.slice(0, parseInt(countLimit));
        }
        return sorted;
    }, [transactions, searchTerm, accountFilter, typeFilter, categoryFilter, dateRange, sortColumn, sortDir, countLimit]);

    // Calculate totals based on filtered transactions
    const totals = useMemo(() => {
        let totalCredit = 0;
        let totalDebit = 0;
        let totalFees = 0;
        filteredTransactions.forEach(tx => {
            if (isCredit(tx)) {
                totalCredit += tx.amount || 0;
            } else {
                totalDebit += tx.amount || 0;
            }
            totalFees += tx.fees || 0;
        });

        // When filtering by account, show actual DB balance instead of calculated net
        let net = totalCredit - totalDebit - totalFees;
        let isActualBalance = false;
        if (accountFilter) {
            const acc = accounts.find(a => a.id === accountFilter);
            if (acc && acc.current_balance !== undefined) {
                net = acc.current_balance;
                isActualBalance = true;
            }
        }

        return { totalCredit, totalDebit, net, isActualBalance };
    }, [filteredTransactions, accountFilter, accounts]);

    const handleDeleteTx = (id) => {
        setConfirmModal({
            open: true,
            message: 'Delete this transaction?',
            onConfirm: async () => {
                try {
                    await axios.delete(`${API_URL}/transactions/${id}`);
                    setTransactions(prev => prev.filter(t => t.id !== id));
                } catch (e) {
                    console.error("Delete failed:", e);
                }
                setConfirmModal({ open: false, message: '', onConfirm: null });
            }
        });
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
                    // For transfers, the From dropdown sets account_id directly
                    // For regular transactions, source_id is used
                    payload.account_id = txForm.account_id || txForm.source_id;
                    payload.credit_card_id = null;
                }

                // Include previous_balance if user provided one (for cascade recalculation)
                if (txForm.previous_balance !== '' && !isNaN(parseFloat(txForm.previous_balance))) {
                    payload.previous_balance = parseFloat(txForm.previous_balance);
                }

                console.log('[TX-EDIT] PUT payload:', JSON.stringify(payload), 'source_type:', txForm.source_type, 'source_id:', txForm.source_id, 'account_id:', txForm.account_id);
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
                // Regular transaction - only send backend-expected fields
                const payload = {
                    amount,
                    merchant: txForm.merchant,
                    category: txForm.category || 'Other',
                    type: txForm.type,
                    notes: txForm.notes,
                    timestamp
                };

                // Add the correct source ID based on source_type
                if (txForm.source_type === 'credit_card' && txForm.source_id) {
                    payload.credit_card_id = txForm.source_id;
                } else if (txForm.source_id || txForm.account_id) {
                    payload.account_id = txForm.account_id || txForm.source_id;
                }

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
        setConfirmModal({
            open: true,
            message: `Delete ${ids.length} items?`,
            onConfirm: async () => {
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
                setConfirmModal({ open: false, message: '', onConfirm: null });
            }
        });
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
        try { sessionStorage.removeItem('filters_transactions'); } catch { }
        setSearchTermRaw('');
        setAccountFilterRaw('');
        setTypeFilterRaw('');
        setCategoryFilterRaw('');
        setDateRangeRaw({ start: '', end: '' });
        setCountLimitRaw('');
        setMonthOffset(null);
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

    const hasActiveFilters = searchTerm || accountFilter || typeFilter || categoryFilter || dateRange.start || dateRange.end || monthOffset !== null;

    // Export state
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Export functions - all use filteredTransactions to respect filters
    const exportToCSV = () => {
        const headers = ['Date', 'Merchant', 'Amount', 'Type', 'Category', 'Account', 'Balance After', 'Notes'];
        const rows = filteredTransactions.map(tx => [
            format(new Date(tx.timestamp), 'yyyy-MM-dd HH:mm'),
            tx.merchant || '',
            tx.amount,
            tx.type || 'debit',
            tx.category || '',
            accounts.find(a => a.id === tx.account_id)?.name || creditCards.find(c => c.id === tx.credit_card_id)?.name || '',
            tx.balance_after_transaction || '',
            (tx.notes || '').replace(/,/g, ';')
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadFile(csvContent, 'transactions.csv', 'text/csv');
        setShowExportMenu(false);
    };

    const exportToExcel = () => {
        // Tab-separated values that Excel can open directly
        const headers = ['Date', 'Merchant', 'Amount', 'Type', 'Category', 'Account', 'Balance After', 'Notes'];
        const rows = filteredTransactions.map(tx => [
            format(new Date(tx.timestamp), 'yyyy-MM-dd HH:mm'),
            tx.merchant || '',
            tx.amount,
            tx.type || 'debit',
            tx.category || '',
            accounts.find(a => a.id === tx.account_id)?.name || creditCards.find(c => c.id === tx.credit_card_id)?.name || '',
            tx.balance_after_transaction || '',
            tx.notes || ''
        ]);

        const tsvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        downloadFile(tsvContent, 'transactions.xls', 'application/vnd.ms-excel');
        setShowExportMenu(false);
    };

    const exportToTXT = () => {
        let content = 'TRANSACTION EXPORT\n';
        content += '='.repeat(60) + '\n';
        content += `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}\n`;
        content += `Total Transactions: ${filteredTransactions.length}\n`;
        content += '='.repeat(60) + '\n\n';

        filteredTransactions.forEach((tx, i) => {
            content += `${i + 1}. ${tx.merchant || 'N/A'}\n`;
            content += `   Date: ${format(new Date(tx.timestamp), 'yyyy-MM-dd HH:mm')}\n`;
            content += `   Amount: ${tx.type === 'credit' ? '+' : '-'}${formatCurrency(tx.amount)}\n`;
            content += `   Category: ${tx.category || 'N/A'}\n`;
            const accName = accounts.find(a => a.id === tx.account_id)?.name || creditCards.find(c => c.id === tx.credit_card_id)?.name;
            content += `   Account: ${accName || 'N/A'}\n`;
            if (tx.balance_after_transaction != null) {
                content += `   Balance After: ${formatCurrency(tx.balance_after_transaction)}\n`;
            }
            if (tx.notes) content += `   Notes: ${tx.notes}\n`;
            content += '\n';
        });

        downloadFile(content, 'transactions.txt', 'text/plain');
        setShowExportMenu(false);
    };

    const exportToPDF = () => {
        // Create printable HTML that browser can print to PDF
        const printWindow = window.open('', '_blank');
        let html = `
            <html>
            <head>
                <title>Transactions Export</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #1e40af; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #1e40af; color: white; padding: 8px; text-align: left; }
                    td { padding: 8px; border-bottom: 1px solid #ddd; }
                    tr:nth-child(even) { background: #f8f9fa; }
                    .credit { color: #16a34a; }
                    .debit { color: #dc2626; }
                    .summary { margin: 20px 0; padding: 10px; background: #f0f9ff; border-radius: 8px; }
                </style>
            </head>
            <body>
                <h1>Transaction Report</h1>
                <div class="summary">
                    <strong>Generated:</strong> ${format(new Date(), 'yyyy-MM-dd HH:mm')} | 
                    <strong>Total:</strong> ${filteredTransactions.length} transactions
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Merchant</th>
                            <th>Amount</th>
                            <th>Category</th>
                            <th>Account</th>
                            <th>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filteredTransactions.forEach(tx => {
            const accName = accounts.find(a => a.id === tx.account_id)?.name || creditCards.find(c => c.id === tx.credit_card_id)?.name || '';
            html += `
                <tr>
                    <td>${format(new Date(tx.timestamp), 'yyyy-MM-dd')}</td>
                    <td>${tx.merchant || '-'}</td>
                    <td class="${tx.type === 'credit' ? 'credit' : 'debit'}">
                        ${tx.type === 'credit' ? '+' : '-'}${tx.amount?.toFixed(2) || '0.00'}
                    </td>
                    <td>${tx.category || '-'}</td>
                    <td>${accName}</td>
                    <td>${tx.balance_after_transaction?.toFixed(2) || '-'}</td>
                </tr>
            `;
        });

        html += `</tbody></table>
            <script>window.print();</script>
            </body></html>`;

        printWindow.document.write(html);
        printWindow.document.close();
        setShowExportMenu(false);
    };

    const downloadFile = (content, filename, type) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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

                    {/* Month Navigation */}
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMonthOffset(prev => (prev ?? 0) - 1)}
                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-white font-semibold text-sm min-w-[140px] text-center">
                                {monthPeriod ? monthPeriod.label : 'All Time'}
                            </span>
                            <button
                                onClick={() => setMonthOffset(prev => (prev ?? 0) + 1)}
                                className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
                            >
                                <ChevronRight size={16} />
                            </button>
                            <button
                                onClick={() => setMonthOffset(0)}
                                className={`ml-2 px-3 py-1 rounded-lg text-xs font-medium transition ${monthOffset === 0 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                                    }`}
                            >
                                Today
                            </button>
                            {monthOffset !== null && (
                                <button
                                    onClick={() => { setMonthOffset(null); setDateRange({ start: '', end: '' }); }}
                                    className="ml-1 px-3 py-1 rounded-lg text-xs font-medium bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition"
                                >
                                    All Time
                                </button>
                            )}
                        </div>
                        {monthPeriod && periodStartDay !== 1 && (
                            <span className="text-slate-500 text-xs">
                                {new Date(monthPeriod.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {new Date(monthPeriod.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        )}
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
                                onChange={e => { setMonthOffset(null); setDateRange({ ...dateRange, start: e.target.value }); }}
                            />

                            {/* End Date */}
                            <input
                                type="date"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={dateRange.end}
                                onChange={e => { setMonthOffset(null); setDateRange({ ...dateRange, end: e.target.value }); }}
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
                                <span className="text-gray-400 text-sm">{totals.isActualBalance ? 'Balance:' : 'Net:'}</span>
                                <span className={`font-bold ${totals.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net)}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-sm">{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</span>

                            {/* Export Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
                                >
                                    <Upload size={14} className="rotate-180" />
                                    Export
                                </button>
                                {showExportMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                                        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                                            <button onClick={exportToCSV} className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3">
                                                📊 CSV
                                            </button>
                                            <button onClick={exportToExcel} className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3">
                                                📗 Excel (.xls)
                                            </button>
                                            <button onClick={exportToPDF} className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3">
                                                📄 PDF (Print)
                                            </button>
                                            <button onClick={exportToTXT} className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-3">
                                                📝 Text (.txt)
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
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
                                    {[
                                        { key: 'date', label: 'Date', align: 'left' },
                                        { key: null, label: 'From:', align: 'left' },
                                        { key: null, label: 'To:', align: 'left' },
                                        { key: 'category', label: 'Category', align: 'left' },
                                        { key: 'amount', label: 'Amount', align: 'right' },
                                        { key: 'balance', label: 'Balance', align: 'right' },
                                        { key: null, label: 'Actions', align: 'right' },
                                    ].map(col => (
                                        <th
                                            key={col.label}
                                            className={`px-6 py-3 text-${col.align} text-xs font-medium text-gray-400 uppercase tracking-wider ${col.key ? 'cursor-pointer hover:text-white transition-colors group' : ''}`}
                                            onClick={col.key ? () => {
                                                if (sortColumn === col.key) {
                                                    setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortColumn(col.key);
                                                    setSortDir(col.key === 'date' ? 'desc' : 'asc');
                                                }
                                            } : undefined}
                                        >
                                            <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                {col.label}
                                                {col.key && sortColumn === col.key && (
                                                    <span className="text-blue-400 group-hover:text-blue-300">
                                                        {sortDir === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                            </span>
                                        </th>
                                    ))}
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

                                    // Check for balance discrepancy or resolved discrepancy from SMS
                                    let balanceDiscrepancy = null;
                                    let discrepancyResolved = null;
                                    if (tx.parsed_data) {
                                        try {
                                            const parsed = typeof tx.parsed_data === 'string' ? JSON.parse(tx.parsed_data) : tx.parsed_data;
                                            if (parsed.balance_discrepancy) {
                                                balanceDiscrepancy = parsed.balance_discrepancy;
                                            }
                                            if (parsed.discrepancy_resolved) {
                                                discrepancyResolved = parsed.discrepancy_resolved;
                                            }
                                        } catch (e) { }
                                    }

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
                                                {tx.status === 'pending_action' ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-amber-400 uppercase font-bold tracking-wider">
                                                            {!acc && !cc ? 'ASSIGN:' : 'FROM:'}
                                                        </span>
                                                        <select
                                                            className="bg-slate-700 border border-amber-600 text-amber-400 rounded px-2 py-1 text-xs cursor-pointer"
                                                            defaultValue=""
                                                            onChange={async (e) => {
                                                                const accountId = e.target.value;
                                                                if (!accountId) return;
                                                                try {
                                                                    if (acc) {
                                                                        // Has destination already — use complete-transfer
                                                                        await fetch(`${API_URL}/transactions/${tx.id}/complete-transfer?source_account_id=${accountId}`, { method: 'POST' });
                                                                    } else {
                                                                        // No account at all — assign via the sms assign endpoint
                                                                        await fetch(`${API_URL}/api/sms/assign-account?transaction_id=${tx.id}&account_id=${accountId}`, { method: 'POST' });
                                                                    }
                                                                    fetchData();
                                                                } catch (err) {
                                                                    console.error('Failed to assign account:', err);
                                                                }
                                                            }}
                                                        >
                                                            <option value="">Select account...</option>
                                                            <option value="external" className="text-gray-400">— Unknown / External —</option>
                                                            {accounts.filter(a => a.id !== tx.account_id).map(a => (
                                                                <option key={a.id} value={a.id}>{a.name} {a.last_4_digits ? `•${a.last_4_digits}` : ''}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {isTransfer && <span className="text-xs text-blue-400 mr-2 uppercase font-bold tracking-wider">{txIsCredit ? 'FROM:' : 'TO:'}</span>}
                                                        {/* Counterparty display with type badge */}
                                                        {tx.beneficiary_info ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="text-[10px] bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded font-medium">Beneficiary</span>
                                                                <span>{tx.beneficiary_info.name}</span>
                                                                {tx.beneficiary_info.bank_name && <span className="text-xs text-gray-500">({tx.beneficiary_info.bank_name})</span>}
                                                            </span>
                                                        ) : tx.biller_info ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="text-[10px] bg-amber-600/30 text-amber-300 px-1.5 py-0.5 rounded font-medium">Biller</span>
                                                                <span>{tx.biller_info.name}</span>
                                                            </span>
                                                        ) : tx.merchant_info ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                {tx.merchant_info.logo_url && (
                                                                    <img
                                                                        src={tx.merchant_info.logo_url}
                                                                        alt=""
                                                                        className="w-6 h-6 rounded-sm"
                                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                                    />
                                                                )}
                                                                <span className="text-[10px] bg-emerald-600/30 text-emerald-300 px-1.5 py-0.5 rounded font-medium">Merchant</span>
                                                                <span>{tx.merchant_info.name}</span>
                                                            </span>
                                                        ) : (
                                                            <span>{tx.merchant || 'Unknown'}</span>
                                                        )}
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
                                                {tx.fees > 0 && (
                                                    <div className="text-[10px] text-amber-400 font-normal">+ {formatCurrency(tx.fees)} fees</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-mono">
                                                <div className="flex items-center justify-end gap-1">
                                                    {tx.balance_after_transaction !== null && tx.balance_after_transaction !== undefined
                                                        ? formatCurrency(tx.balance_after_transaction)
                                                        : '-'}
                                                    {balanceDiscrepancy && (
                                                        <span
                                                            className="text-amber-400 cursor-pointer hover:opacity-80"
                                                            title={`⚠️ Balance mismatch! Click to resolve\nDB: ${formatCurrency(balanceDiscrepancy.db_balance)}\nSMS: ${formatCurrency(balanceDiscrepancy.sms_balance)}\nDiff: ${formatCurrency(balanceDiscrepancy.difference)}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setResolveModal({ open: true, tx, discrepancy: balanceDiscrepancy });
                                                                setResolveReason('');
                                                            }}
                                                        >
                                                            ⚠️
                                                        </span>
                                                    )}
                                                    {discrepancyResolved && !balanceDiscrepancy && (
                                                        <span
                                                            className="text-green-400 cursor-help text-xs"
                                                            title={`✅ Resolved: ${formatCurrency(discrepancyResolved.amount)} SAR\nReason: ${discrepancyResolved.reason || 'N/A'}\nResolved: ${discrepancyResolved.resolved_at ? new Date(discrepancyResolved.resolved_at).toLocaleString() : 'N/A'}`}
                                                        >
                                                            ✅
                                                        </span>
                                                    )}
                                                </div>
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

                    {/* Account Selection - Transfer UI only for creating new transactions */}
                    {txForm.type === 'transfer' && !editingTx ? (
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

                    {/* Previous Balance - show when editing existing transaction (account or credit card) */}
                    {editingTx && (
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

            {/* Confirm Modal (replaces window.confirm for Chrome compatibility) */}
            {confirmModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
                        <p className="text-white text-lg font-medium mb-6">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal({ open: false, message: '', onConfirm: null })}
                                className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-600 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-500 transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Resolve Discrepancy Modal */}
            {resolveModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-white text-lg font-semibold mb-4">⚠️ Resolve Balance Discrepancy</h3>

                        <div className="bg-slate-900/50 rounded-lg p-4 mb-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">System Balance:</span>
                                <span className="text-white font-mono">{formatCurrency(resolveModal.discrepancy?.db_balance)} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">SMS Balance:</span>
                                <span className="text-green-400 font-mono">{formatCurrency(resolveModal.discrepancy?.sms_balance)} SAR</span>
                            </div>
                            <hr className="border-slate-700" />
                            <div className="flex justify-between text-sm font-semibold">
                                <span className="text-amber-400">Discrepancy:</span>
                                <span className="text-amber-400 font-mono">{formatCurrency(resolveModal.discrepancy?.difference)} SAR</span>
                            </div>
                        </div>

                        <p className="text-gray-400 text-xs mb-3">
                            Resolving will adopt the SMS balance and record the discrepancy for your reference.
                        </p>

                        <label className="block text-sm text-gray-300 mb-1">Reason (optional)</label>
                        <input
                            type="text"
                            className={inputClass}
                            placeholder="e.g. Bank fee not received via SMS"
                            value={resolveReason}
                            onChange={(e) => setResolveReason(e.target.value)}
                        />

                        <div className="flex gap-3 mt-5">
                            <button
                                onClick={() => setResolveModal({ open: false, tx: null, discrepancy: null })}
                                className="flex-1 bg-slate-700 text-white py-2.5 rounded-lg font-medium hover:bg-slate-600 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await axios.put(`${API_URL}/transactions/${resolveModal.tx.id}/resolve-discrepancy`, {
                                            reason: resolveReason
                                        });
                                        setResolveModal({ open: false, tx: null, discrepancy: null });
                                        fetchData();
                                    } catch (e) {
                                        console.error(e);
                                        alert('Error resolving discrepancy');
                                    }
                                }}
                                className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-500 transition"
                            >
                                Resolve & Adopt
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Transactions;
