import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { FileUp, FileText, AlertTriangle, Trash2, CheckCircle2, Clock, XCircle, Loader2, Upload, ArrowLeft, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCw, Filter, Wallet, Calendar, Search, X } from 'lucide-react';

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
                        onClick={() => document.getElementById('pdf-file-input').click()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                    >
                        <Upload size={16} />
                        Upload PDF
                    </button>
                </div>
            </div>

            {/* Upload Zone (compact) */}
            <div
                id="statement-upload-zone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`rounded-xl border-2 border-dashed transition-all duration-300 p-6 text-center cursor-pointer ${
                    dragActive
                        ? 'border-blue-500 bg-blue-500/5'
                        : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50'
                }`}
                onClick={() => document.getElementById('pdf-file-input').click()}
            >
                <input id="pdf-file-input" type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileInput} />
                {uploading ? (
                    <div className="flex items-center justify-center gap-3">
                        <Loader2 size={20} className="text-blue-400 animate-spin" />
                        <p className="text-gray-300 text-sm">Uploading & parsing PDF...</p>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dragActive ? 'bg-blue-500/20' : 'bg-slate-800'}`}>
                            <Upload size={18} className={dragActive ? 'text-blue-400' : 'text-gray-500'} />
                        </div>
                        <div className="text-left">
                            <p className="text-gray-300 text-sm font-medium">Drop a PDF here or click to browse</p>
                            <p className="text-gray-600 text-xs">Al Rajhi bank statements (.pdf)</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload Result Toast */}
            {uploadResult && (
                <div className={`rounded-xl border p-4 ${uploadResult.warning ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                    <div className="flex items-start gap-3">
                        {uploadResult.warning ? <AlertTriangle size={18} className="text-amber-400 mt-0.5" /> : <CheckCircle2 size={18} className="text-emerald-400 mt-0.5" />}
                        <div className="flex-1 text-sm">
                            <p className={`font-medium ${uploadResult.warning ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {uploadResult.warning || uploadResult.message}
                            </p>
                            <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-400">
                                <span>{uploadResult.original_filename}</span>
                                {uploadResult.account_number && <span>Account: {uploadResult.account_number}</span>}
                                {uploadResult.transaction_count > 0 && <span className="text-emerald-400">{uploadResult.transaction_count} transactions</span>}
                            </div>
                        </div>
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

            {/* Filters Bar */}
            {statements.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Search */}
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

                    {/* Account Filter Pills */}
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
                                <Wallet size={12} />
                                {acct.name}
                                <span className="text-gray-600 ml-0.5">({acct.count})</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Statements Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="text-blue-400 animate-spin" />
                </div>
            ) : filteredStatements.length === 0 ? (
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
                            <p className="text-gray-400">No statements match your filter</p>
                            <button onClick={() => { setAccountFilter('all'); setSearchQuery(''); }} className="text-blue-400 text-sm mt-2 hover:underline">Clear filters</button>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {filteredStatements.map((s) => (
                        <div
                            key={s.id}
                            onClick={() => openStatementDetail(s.id)}
                            className="bg-slate-900/60 rounded-xl border border-slate-800/80 hover:border-blue-500/25 hover:bg-slate-900/90 transition-all cursor-pointer group"
                        >
                            <div className="flex items-center p-4 gap-4">
                                {/* Icon */}
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0">
                                    <FileText size={20} className="text-blue-400" />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-medium text-sm truncate">{s.original_filename}</p>
                                        {getStatusBadge(s.status)}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        {/* Account badge */}
                                        {(s.account_name || s.account_number) && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-xs text-gray-300 border border-slate-700">
                                                <Wallet size={10} className="text-blue-400" />
                                                {s.account_name || `****${s.account_number.slice(-4)}`}
                                                {s.account_last4 && <span className="text-gray-500 font-mono ml-0.5">({s.account_last4})</span>}
                                            </span>
                                        )}
                                        {/* Period */}
                                        {s.statement_period_start && s.statement_period_end && (
                                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                                <Calendar size={10} />
                                                {formatDate(s.statement_period_start)} – {formatDate(s.statement_period_end)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right side stats */}
                                <div className="flex items-center gap-5 flex-shrink-0">
                                    {/* Balance range */}
                                    {s.opening_balance != null && s.closing_balance != null && (
                                        <div className="text-right hidden md:block">
                                            <p className="text-xs text-gray-500">Balance</p>
                                            <p className="text-xs font-mono text-gray-400">
                                                {formatAmount(s.opening_balance)} → {formatAmount(s.closing_balance)}
                                            </p>
                                        </div>
                                    )}
                                    {/* Transaction count */}
                                    {s.transaction_count > 0 && (
                                        <div className="text-right">
                                            <p className="text-lg font-semibold text-white">{s.transaction_count}</p>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">txns</p>
                                        </div>
                                    )}
                                    {/* Delete */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                        className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                    <ChevronRight size={16} className="text-gray-700 group-hover:text-blue-400 transition-colors" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Statements;
