import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { FileUp, FileText, AlertTriangle, Trash2, CheckCircle2, Clock, XCircle, Loader2, Upload, ArrowLeft, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCw, Filter, Wallet, Calendar, Search, X, Download, Edit3, Check, MoreVertical, Eye } from 'lucide-react';

const Statements = () => {
    const [statements, setStatements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [error, setError] = useState(null);
    // Filters
    const [accountFilter, setAccountFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    // Detail view state
    const [selectedStatement, setSelectedStatement] = useState(null);
    const [statementDetail, setStatementDetail] = useState(null);
    const [parsedTransactions, setParsedTransactions] = useState([]);
    const [loadingDetail, setLoadingDetail] = useState(false);
    // Detail view filters (matching Transactions page pattern)
    const [txSearch, setTxSearch] = useState('');
    const [txTypeFilter, setTxTypeFilter] = useState('');
    const [txDateRange, setTxDateRange] = useState({ start: '', end: '' });
    const [txAmountMin, setTxAmountMin] = useState('');
    const [txAmountMax, setTxAmountMax] = useState('');
    const [txCountLimit, setTxCountLimit] = useState('');
    // List management state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortColumn, setSortColumn] = useState('imported_at');
    const [sortDir, setSortDir] = useState('desc');
    const [editingId, setEditingId] = useState(null);
    const [editingField, setEditingField] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [actionMenuId, setActionMenuId] = useState(null);
    const [API_URL] = useState('/api/statements');
    // Accounts for filter dropdown (not needed - derived from statements)

    const fetchStatements = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/statements/');
            setStatements(res.data);
        } catch (err) {
            console.error('Failed to fetch statements:', err);
            setError('Failed to load statements');
        } finally {
            setLoading(false);
        }
    }, []);


    useEffect(() => {
        fetchStatements();
    }, [fetchStatements]);

    // Derive unique accounts from statements' own parsed account numbers
    const statementAccounts = useMemo(() => {
        const acctMap = new Map();
        statements.forEach(s => {
            const acctNum = s.account_number;
            if (!acctNum) return;
            const last4 = acctNum.slice(-4);
            if (!acctMap.has(last4)) {
                acctMap.set(last4, {
                    last4,
                    name: s.account_name || `****${last4}`,
                    bank: s.bank_name || 'Unknown',
                    count: 0,
                });
            }
            acctMap.get(last4).count += 1;
        });
        return Array.from(acctMap.values());
    }, [statements]);

    // Filtered statements
    const filteredStatements = useMemo(() => {
        let result = [...statements];
        
        if (accountFilter !== 'all') {
            result = result.filter(s => {
                return s.account_number && s.account_number.endsWith(accountFilter);
            });
        }
        
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(s =>
                (s.original_filename || '').toLowerCase().includes(q) ||
                (s.account_number || '').includes(q) ||
                (s.account_name || '').toLowerCase().includes(q) ||
                (s.bank_name || '').toLowerCase().includes(q)
            );
        }
        
        return result;
    }, [statements, accountFilter, searchQuery]);

    const handleFileUpload = async (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setError('Only PDF files are accepted');
            return;
        }

        setUploading(true);
        setError(null);
        setUploadResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/api/statements/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadResult(res.data);
            fetchStatements();
            if (res.data.transaction_count > 0) {
                openStatementDetail(res.data.id);
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const openStatementDetail = async (statementId) => {
        setLoadingDetail(true);
        setSelectedStatement(statementId);
        try {
            const [detailRes, txRes] = await Promise.all([
                api.get(`/api/statements/${statementId}`),
                api.get(`/api/statements/${statementId}/transactions`),
            ]);
            setStatementDetail(detailRes.data);
            setParsedTransactions(txRes.data.transactions || []);
        } catch (err) {
            setError('Failed to load statement details');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleReParse = async () => {
        if (!selectedStatement) return;
        setLoadingDetail(true);
        try {
            const res = await api.post(`/api/statements/${selectedStatement}/parse`);
            setParsedTransactions(res.data.transactions || []);
            const detailRes = await api.get(`/api/statements/${selectedStatement}`);
            setStatementDetail(detailRes.data);
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Re-parse failed');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); const file = e.dataTransfer?.files?.[0]; if (file) handleFileUpload(file); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
    const handleFileInput = (e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = ''; };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this statement and all its draft transactions?')) return;
        try {
            await api.delete(`/api/statements/${id}`);
            fetchStatements();
            if (selectedStatement === id) {
                setSelectedStatement(null);
                setStatementDetail(null);
                setParsedTransactions([]);
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Delete failed');
        }
    };

    const formatAmount = (amount) => {
        if (amount == null) return '—';
        return new Intl.NumberFormat('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return dateStr; }
    };

    const getStatusBadge = (status) => {
        const configs = {
            draft: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Draft' },
            approved: { color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle2, label: 'Approved' },
            rejected: { color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle, label: 'Rejected' },
        };
        const config = configs[status] || configs.draft;
        const Icon = config.icon;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
                <Icon size={12} />{config.label}
            </span>
        );
    };

    // Filter parsed transactions (must be above conditional return — React hooks rules)
    const filteredParsedTx = useMemo(() => {
        let result = [...parsedTransactions];

        if (txSearch.trim()) {
            const q = txSearch.toLowerCase();
            result = result.filter(tx =>
                (tx.merchant_or_beneficiary || '').toLowerCase().includes(q) ||
                (tx.type_line || '').toLowerCase().includes(q) ||
                (tx.note_text || '').toLowerCase().includes(q)
            );
        }

        if (txTypeFilter === 'debit') {
            result = result.filter(tx => tx.direction === 'debit');
        } else if (txTypeFilter === 'credit') {
            result = result.filter(tx => tx.direction === 'credit');
        }

        if (txDateRange.start) {
            const start = txDateRange.start.replace(/-/g, '/');
            result = result.filter(tx => tx.transaction_date && tx.transaction_date >= start);
        }
        if (txDateRange.end) {
            const end = txDateRange.end.replace(/-/g, '/');
            result = result.filter(tx => tx.transaction_date && tx.transaction_date <= end);
        }

        if (txAmountMin) {
            const min = parseFloat(txAmountMin);
            if (!isNaN(min)) result = result.filter(tx => (tx.debit_amount || tx.credit_amount || 0) >= min);
        }
        if (txAmountMax) {
            const max = parseFloat(txAmountMax);
            if (!isNaN(max)) result = result.filter(tx => (tx.debit_amount || tx.credit_amount || 0) <= max);
        }

        if (txCountLimit) {
            const limit = parseInt(txCountLimit);
            if (!isNaN(limit) && limit > 0) result = result.slice(0, limit);
        }

        return result;
    }, [parsedTransactions, txSearch, txTypeFilter, txDateRange, txAmountMin, txAmountMax, txCountLimit]);

    const totalDebits = filteredParsedTx.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
    const totalCredits = filteredParsedTx.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
    const hasTxFilters = txSearch || txTypeFilter || txDateRange.start || txDateRange.end || txAmountMin || txAmountMax || txCountLimit;
    const clearTxFilters = () => { setTxSearch(''); setTxTypeFilter(''); setTxDateRange({ start: '', end: '' }); setTxAmountMin(''); setTxAmountMax(''); setTxCountLimit(''); };

    // ─────────────── DETAIL VIEW ───────────────
    if (selectedStatement) {

        return (
            <div className="space-y-6">
                {/* Back + Header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => { setSelectedStatement(null); setStatementDetail(null); setParsedTransactions([]); clearTxFilters(); }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-white truncate">
                            {statementDetail?.original_filename || 'Statement'}
                        </h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-400 text-sm">{statementDetail?.bank_name}</span>
                            {statementDetail?.account_number && (
                                <>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-sm text-blue-400 font-mono">****{statementDetail.account_number.slice(-4)}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleReParse}
                        disabled={loadingDetail}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loadingDetail ? 'animate-spin' : ''} />
                        Re-parse
                    </button>
                </div>

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-400" />
                        <p className="text-red-300 text-sm flex-1">{error}</p>
                        <button onClick={() => setError(null)} className="text-gray-500 hover:text-gray-300"><XCircle size={16} /></button>
                    </div>
                )}

                {/* Summary Cards */}
                {statementDetail && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Period</p>
                            <p className="text-sm text-white font-medium">
                                {formatDate(statementDetail.statement_period_start)}<br/>
                                <span className="text-gray-500">to</span> {formatDate(statementDetail.statement_period_end)}
                            </p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Opening</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.opening_balance)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Closing</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.closing_balance)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-red-500/10 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Total Debits{hasTxFilters ? ' (filtered)' : ''}</p>
                            <p className="text-lg text-red-400 font-semibold">{formatAmount(totalDebits)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-green-500/10 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Total Credits{hasTxFilters ? ' (filtered)' : ''}</p>
                            <p className="text-lg text-green-400 font-semibold">{formatAmount(totalCredits)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Transactions</p>
                            <p className="text-lg text-white font-semibold">
                                {hasTxFilters ? `${filteredParsedTx.length} / ${parsedTransactions.length}` : parsedTransactions.length}
                            </p>
                        </div>
                    </div>
                )}

                {/* Transaction Filters Bar */}
                {parsedTransactions.length > 0 && (
                    <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg space-y-4">
                        {/* Search Row */}
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search merchant, type, or note..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                value={txSearch}
                                onChange={e => setTxSearch(e.target.value)}
                            />
                        </div>

                        {/* Filters Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {/* Type */}
                            <div className="relative">
                                <select
                                    className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                    value={txTypeFilter}
                                    onChange={e => setTxTypeFilter(e.target.value)}
                                >
                                    <option value="">All Types</option>
                                    <option value="debit">Debit (Expense)</option>
                                    <option value="credit">Credit (Income)</option>
                                </select>
                                <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none text-xs">▼</div>
                            </div>

                            {/* Amount Min */}
                            <input
                                type="number"
                                placeholder="Min amount"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={txAmountMin}
                                onChange={e => setTxAmountMin(e.target.value)}
                            />

                            {/* Amount Max */}
                            <input
                                type="number"
                                placeholder="Max amount"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={txAmountMax}
                                onChange={e => setTxAmountMax(e.target.value)}
                            />

                            {/* Start Date */}
                            <input
                                type="date"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={txDateRange.start}
                                onChange={e => setTxDateRange({ ...txDateRange, start: e.target.value })}
                            />

                            {/* End Date */}
                            <input
                                type="date"
                                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                value={txDateRange.end}
                                onChange={e => setTxDateRange({ ...txDateRange, end: e.target.value })}
                            />

                            {/* Count Limit */}
                            <div className="relative">
                                <select
                                    className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none"
                                    value={txCountLimit}
                                    onChange={e => setTxCountLimit(e.target.value)}
                                >
                                    <option value="">Show All</option>
                                    <option value="10">First 10</option>
                                    <option value="25">First 25</option>
                                    <option value="50">First 50</option>
                                    <option value="100">First 100</option>
                                </select>
                                <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none text-xs">▼</div>
                            </div>
                        </div>

                        {hasTxFilters && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">
                                    Showing {filteredParsedTx.length} of {parsedTransactions.length} transactions
                                </span>
                                <button onClick={clearTxFilters} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                                    <X size={14} /> Clear Filters
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Parsed Transactions Table */}
                {loadingDetail ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={32} className="text-blue-400 animate-spin" />
                    </div>
                ) : filteredParsedTx.length > 0 ? (
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-white font-medium">
                                {hasTxFilters ? `Filtered Transactions (${filteredParsedTx.length})` : `Parsed Transactions (${parsedTransactions.length})`}
                            </h3>
                            <span className="text-xs text-gray-500">Print order preserved</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-slate-800">
                                        <th className="px-4 py-3 text-left w-8">#</th>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Time</th>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Merchant / Beneficiary</th>
                                        <th className="px-4 py-3 text-right">Debit</th>
                                        <th className="px-4 py-3 text-right">Credit</th>
                                        <th className="px-4 py-3 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredParsedTx.map((tx, idx) => (
                                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                                            <td className="px-4 py-2.5 text-gray-600 text-xs">{tx.row_index + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-300 font-mono text-xs whitespace-nowrap">{tx.transaction_date || '—'}</td>
                                            <td className="px-4 py-2.5 text-gray-400 font-mono text-xs whitespace-nowrap">{tx.transaction_time || '—'}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-gray-400 text-xs block max-w-[200px] truncate" title={tx.type_line}>{tx.type_line || '—'}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    {tx.direction === 'credit' ? (
                                                        <ArrowDownLeft size={14} className="text-green-400 flex-shrink-0" />
                                                    ) : (
                                                        <ArrowUpRight size={14} className="text-red-400 flex-shrink-0" />
                                                    )}
                                                    <span className="text-gray-200 text-xs truncate max-w-[220px]" title={tx.merchant_or_beneficiary || tx.note_text}>
                                                        {tx.merchant_or_beneficiary || tx.note_text?.substring(0, 40) || '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                                                {tx.debit_amount > 0 ? <span className="text-red-400">{formatAmount(tx.debit_amount)}</span> : <span className="text-gray-700">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                                                {tx.credit_amount > 0 ? <span className="text-green-400">{formatAmount(tx.credit_amount)}</span> : <span className="text-gray-700">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300 whitespace-nowrap">{formatAmount(tx.balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : parsedTransactions.length > 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <Search size={32} className="mx-auto mb-3 text-gray-700" />
                        <p>No transactions match your filters</p>
                        <button onClick={clearTxFilters} className="text-blue-400 text-sm mt-2 hover:underline">Clear filters</button>
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        <p>No transactions parsed. Click "Re-parse" to try again.</p>
                    </div>
                )}
            </div>
        );
    }

    // ─────────────── LIST MANAGEMENT HELPERS ───────────────

    const handleSort = (col) => {
        if (sortColumn === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDir(col === 'imported_at' ? 'desc' : 'asc');
        }
    };

    const sortedFilteredStatements = useMemo(() => {
        let result = [...filteredStatements];
        if (statusFilter !== 'all') {
            result = result.filter(s => s.status === statusFilter);
        }
        result.sort((a, b) => {
            let aVal, bVal;
            switch (sortColumn) {
                case 'filename': aVal = a.original_filename || ''; bVal = b.original_filename || ''; break;
                case 'account': aVal = a.account_name || a.account_number || ''; bVal = b.account_name || b.account_number || ''; break;
                case 'period': aVal = a.statement_period_start || ''; bVal = b.statement_period_start || ''; break;
                case 'tx_count': aVal = a.transaction_count || 0; bVal = b.transaction_count || 0; break;
                case 'status': aVal = a.status || ''; bVal = b.status || ''; break;
                case 'imported_at': default: aVal = a.imported_at || ''; bVal = b.imported_at || ''; break;
            }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [filteredStatements, statusFilter, sortColumn, sortDir]);

    const summaryStats = useMemo(() => {
        const s = filteredStatements;
        return {
            totalStatements: s.length,
            totalTransactions: s.reduce((sum, st) => sum + (st.transaction_count || 0), 0),
            totalDebits: s.reduce((sum, st) => {
                if (st.opening_balance != null && st.closing_balance != null) {
                    const diff = st.opening_balance - st.closing_balance;
                    return sum + Math.max(0, diff);
                }
                return sum;
            }, 0),
        };
    }, [filteredStatements]);

    const toggleSelectAll = () => {
        if (selectedIds.size === sortedFilteredStatements.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(sortedFilteredStatements.map(s => s.id)));
        }
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.size} statement(s)?`)) return;
        try {
            await api.post('/api/statements/bulk-delete', { ids: Array.from(selectedIds) });
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Bulk delete failed');
        }
    };

    const handleBulkReparse = async () => {
        try {
            const res = await api.post('/api/statements/bulk-reparse', { ids: Array.from(selectedIds) });
            setSelectedIds(new Set());
            fetchStatements();
            setUploadResult({ message: `Re-parsed ${res.data.results?.length || 0} statements` });
        } catch (err) {
            setError(err.response?.data?.detail || 'Bulk re-parse failed');
        }
    };

    const handleBulkStatus = async (status) => {
        try {
            await api.post('/api/statements/bulk-status', { ids: Array.from(selectedIds), status });
            setSelectedIds(new Set());
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Status update failed');
        }
    };

    const handleInlineEdit = async (id, field, value) => {
        try {
            await api.patch(`/api/statements/${id}`, { [field]: value });
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Update failed');
        }
        setEditingId(null);
        setEditingField(null);
    };

    const handleStatusChange = async (id, status) => {
        try {
            await api.patch(`/api/statements/${id}`, { status });
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Status update failed');
        }
        setActionMenuId(null);
    };

    const downloadPdf = (id) => {
        window.open(`/api/statements/${id}/pdf`, '_blank');
    };

    const getStatusConfig = (status) => {
        const configs = {
            draft: { color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock, label: 'Draft' },
            reviewed: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Eye, label: 'Reviewed' },
            approved: { color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle2, label: 'Approved' },
            rejected: { color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle, label: 'Rejected' },
        };
        return configs[status] || configs.draft;
    };

    const SortHeader = ({ col, label, align = 'left' }) => (
        <th
            className={`px-4 py-3 text-${align} text-[11px] text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group whitespace-nowrap`}
            onClick={() => handleSort(col)}
        >
            <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                {sortColumn === col && <span className="text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </span>
        </th>
    );

    // ─────────────── LIST VIEW ───────────────
    return (
        <div className="space-y-6">
            {/* Header Row */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Statements</h1>
                    <p className="text-gray-400 mt-1 text-sm">Upload and manage bank statement PDFs</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedIds(new Set()); }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                            isSelectionMode
                                ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-gray-300'
                        }`}
                    >
                        {isSelectionMode ? 'Cancel' : 'Select'}
                    </button>
                    <button
                        onClick={() => document.getElementById('pdf-file-input').click()}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                    >
                        <Upload size={16} />Upload PDF
                    </button>
                </div>
            </div>

            {/* Upload Zone (compact) */}
            <div
                id="statement-upload-zone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`rounded-xl border-2 border-dashed transition-all duration-300 p-5 text-center cursor-pointer ${
                    dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'
                }`}
                onClick={() => document.getElementById('pdf-file-input').click()}
            >
                <input id="pdf-file-input" type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput} />
                {uploading ? (
                    <div className="flex items-center justify-center gap-3">
                        <Loader2 size={18} className="text-blue-400 animate-spin" />
                        <p className="text-gray-300 text-sm">Uploading & parsing...</p>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-3">
                        <Upload size={16} className={dragActive ? 'text-blue-400' : 'text-gray-600'} />
                        <span className="text-gray-400 text-sm">Drop PDF here or click to browse</span>
                    </div>
                )}
            </div>

            {/* Upload Result */}
            {uploadResult && (
                <div className={`rounded-xl border p-4 ${uploadResult.warning ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                    <div className="flex items-start gap-3">
                        {uploadResult.warning ? <AlertTriangle size={18} className="text-amber-400 mt-0.5" /> : <CheckCircle2 size={18} className="text-emerald-400 mt-0.5" />}
                        <p className={`flex-1 text-sm font-medium ${uploadResult.warning ? 'text-amber-300' : 'text-emerald-300'}`}>
                            {uploadResult.warning || uploadResult.message}
                        </p>
                        <button onClick={() => setUploadResult(null)} className="text-gray-500 hover:text-gray-300"><XCircle size={16} /></button>
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                    <AlertTriangle size={18} className="text-red-400" />
                    <p className="text-red-300 text-sm flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-gray-500 hover:text-gray-300"><XCircle size={16} /></button>
                </div>
            )}

            {/* Summary Stats */}
            {statements.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Statements</p>
                        <p className="text-xl text-white font-bold">{summaryStats.totalStatements}</p>
                    </div>
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Total Transactions</p>
                        <p className="text-xl text-white font-bold">{summaryStats.totalTransactions.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Accounts</p>
                        <p className="text-xl text-white font-bold">{statementAccounts.length}</p>
                    </div>
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Net Change</p>
                        <p className={`text-xl font-bold ${summaryStats.totalDebits >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {formatAmount(summaryStats.totalDebits)} <span className="text-[11px] text-gray-500">SAR</span>
                        </p>
                    </div>
                </div>
            )}

            {/* Filters Bar */}
            {statements.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search statements..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Filter size={14} className="text-gray-500 mr-1" />
                        <button
                            onClick={() => setAccountFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                accountFilter === 'all'
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-slate-900 text-gray-400 border border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            All ({statements.length})
                        </button>
                        {statementAccounts.map((acct) => (
                            <button
                                key={acct.last4}
                                onClick={() => setAccountFilter(acct.last4)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                                    accountFilter === acct.last4
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'bg-slate-900 text-gray-400 border border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <Wallet size={12} />{acct.name}
                                <span className="text-gray-600">({acct.count})</span>
                            </button>
                        ))}
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-900 text-gray-300 border border-slate-800 focus:outline-none focus:border-blue-500/50 appearance-none"
                    >
                        <option value="all">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            )}

            {/* Bulk Action Bar */}
            {isSelectionMode && selectedIds.size > 0 && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-blue-300 font-medium">{selectedIds.size} selected</span>
                    <div className="flex gap-2 ml-auto">
                        <button onClick={() => handleBulkStatus('reviewed')} className="px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 text-xs font-medium border border-blue-500/30 hover:bg-blue-600/30 transition">
                            <Eye size={12} className="inline mr-1" />Mark Reviewed
                        </button>
                        <button onClick={() => handleBulkStatus('approved')} className="px-3 py-1.5 rounded-lg bg-green-600/20 text-green-300 text-xs font-medium border border-green-500/30 hover:bg-green-600/30 transition">
                            <CheckCircle2 size={12} className="inline mr-1" />Approve
                        </button>
                        <button onClick={handleBulkReparse} className="px-3 py-1.5 rounded-lg bg-slate-700 text-gray-300 text-xs font-medium border border-slate-600 hover:bg-slate-600 transition">
                            <RefreshCw size={12} className="inline mr-1" />Re-parse All
                        </button>
                        <button onClick={handleBulkDelete} className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-300 text-xs font-medium border border-red-500/30 hover:bg-red-600/30 transition">
                            <Trash2 size={12} className="inline mr-1" />Delete
                        </button>
                    </div>
                </div>
            )}

            {/* Statements Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="text-blue-400 animate-spin" />
                </div>
            ) : sortedFilteredStatements.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-slate-800">
                    {statements.length === 0 ? (
                        <>
                            <FileUp size={48} className="text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-400 text-lg">No statements imported yet</p>
                            <p className="text-gray-600 text-sm mt-1">Upload a bank statement PDF to get started</p>
                        </>
                    ) : (
                        <>
                            <Search size={40} className="text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-400">No statements match your filters</p>
                            <button onClick={() => { setAccountFilter('all'); setSearchQuery(''); setStatusFilter('all'); }} className="text-blue-400 text-sm mt-2 hover:underline">Clear filters</button>
                        </>
                    )}
                </div>
            ) : (
                <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    {isSelectionMode && (
                                        <th className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === sortedFilteredStatements.length && sortedFilteredStatements.length > 0}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 accent-blue-500 rounded"
                                            />
                                        </th>
                                    )}
                                    <SortHeader col="filename" label="Statement" />
                                    <SortHeader col="account" label="Account" />
                                    <SortHeader col="period" label="Period" />
                                    <SortHeader col="tx_count" label="Txns" align="right" />
                                    <th className="px-4 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider">Balance</th>
                                    <SortHeader col="status" label="Status" />
                                    <th className="px-4 py-3 text-[11px] text-gray-500 uppercase tracking-wider">Notes</th>
                                    <SortHeader col="imported_at" label="Imported" />
                                    <th className="px-4 py-3 text-right text-[11px] text-gray-500 uppercase tracking-wider w-28">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedFilteredStatements.map((s) => {
                                    const sc = getStatusConfig(s.status);
                                    const StatusIcon = sc.icon;
                                    return (
                                        <tr
                                            key={s.id}
                                            className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors group ${
                                                selectedIds.has(s.id) ? 'bg-blue-900/15' : ''
                                            }`}
                                        >
                                            {isSelectionMode && (
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(s.id)}
                                                        onChange={() => toggleSelect(s.id)}
                                                        className="w-4 h-4 accent-blue-500 rounded"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-4 py-3">
                                                {editingId === s.id && editingField === 'original_filename' ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            autoFocus
                                                            className="bg-slate-800 border border-blue-500 rounded px-2 py-1 text-xs text-white w-48 focus:outline-none"
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(s.id, 'original_filename', editValue); if (e.key === 'Escape') setEditingId(null); }}
                                                        />
                                                        <button onClick={() => handleInlineEdit(s.id, 'original_filename', editValue)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                                                        <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 cursor-pointer group/name" onClick={() => openStatementDetail(s.id)}>
                                                        <FileText size={16} className="text-blue-400 flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-white text-xs font-medium truncate max-w-[200px] group-hover/name:text-blue-400 transition-colors">{s.original_filename}</p>
                                                            <p className="text-[10px] text-gray-600">{s.bank_name}</p>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditingField('original_filename'); setEditValue(s.original_filename || ''); }}
                                                            className="text-gray-700 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition"
                                                            title="Rename"
                                                        >
                                                            <Edit3 size={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {(s.account_name || s.account_number) ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-xs text-gray-300 border border-slate-700">
                                                        <Wallet size={10} className="text-blue-400" />
                                                        {s.account_name || `****${s.account_number?.slice(-4)}`}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-600">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {s.statement_period_start ? (
                                                    <span className="text-xs text-gray-400">
                                                        {formatDate(s.statement_period_start)}
                                                        <br/>
                                                        <span className="text-gray-600">to</span> {formatDate(s.statement_period_end)}
                                                    </span>
                                                ) : <span className="text-xs text-gray-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs text-white font-semibold">{s.transaction_count || 0}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                {s.opening_balance != null ? (
                                                    <div className="text-xs font-mono">
                                                        <span className="text-gray-400">{formatAmount(s.opening_balance)}</span>
                                                        <span className="text-gray-600 mx-1">→</span>
                                                        <span className="text-gray-300">{formatAmount(s.closing_balance)}</span>
                                                    </div>
                                                ) : <span className="text-xs text-gray-600">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setActionMenuId(actionMenuId === s.id + '-status' ? null : s.id + '-status')}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition hover:opacity-80 ${sc.color}`}
                                                    >
                                                        <StatusIcon size={11} />{sc.label}
                                                    </button>
                                                    {actionMenuId === s.id + '-status' && (
                                                        <>
                                                            <div className="fixed inset-0 z-40" onClick={() => setActionMenuId(null)} />
                                                            <div className="absolute left-0 mt-1 w-36 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
                                                                {['draft', 'reviewed', 'approved', 'rejected'].map(st => (
                                                                    <button
                                                                        key={st}
                                                                        onClick={() => handleStatusChange(s.id, st)}
                                                                        className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition ${
                                                                            s.status === st ? 'bg-blue-600/20 text-blue-300' : 'text-gray-300 hover:bg-slate-700'
                                                                        }`}
                                                                    >
                                                                        {React.createElement(getStatusConfig(st).icon, { size: 12 })}
                                                                        {getStatusConfig(st).label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingId === s.id && editingField === 'notes' ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            autoFocus
                                                            className="bg-slate-800 border border-blue-500 rounded px-2 py-1 text-xs text-white w-32 focus:outline-none"
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            placeholder="Add notes..."
                                                            onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(s.id, 'notes', editValue); if (e.key === 'Escape') setEditingId(null); }}
                                                        />
                                                        <button onClick={() => handleInlineEdit(s.id, 'notes', editValue)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <span
                                                        className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition max-w-[120px] truncate block"
                                                        title={s.notes || 'Click to add notes'}
                                                        onClick={() => { setEditingId(s.id); setEditingField('notes'); setEditValue(s.notes || ''); }}
                                                    >
                                                        {s.notes || <span className="text-gray-700 italic">Add notes...</span>}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="text-[11px] text-gray-500">
                                                    {s.imported_at ? new Date(s.imported_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                                                    <button onClick={() => openStatementDetail(s.id)} className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition" title="View transactions">
                                                        <Eye size={14} />
                                                    </button>
                                                    <button onClick={() => downloadPdf(s.id)} className="p-1.5 rounded text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition" title="Download PDF">
                                                        <Download size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition" title="Delete">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Statements;
