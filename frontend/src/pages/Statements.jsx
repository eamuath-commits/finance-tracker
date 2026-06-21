import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { FileUp, FileText, AlertTriangle, Trash2, CheckCircle2, Clock, XCircle, Loader2, Upload, ArrowLeft, ArrowUpRight, ArrowDownLeft, ChevronRight, ChevronDown, RefreshCw, Filter, Wallet, Calendar, Search, X, Download, Edit3, Check, MoreVertical, Eye, ShieldCheck, Link2, GitBranch } from 'lucide-react';

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
    // Commit to ledger state
    const [committing, setCommitting] = useState(false);
    const [commitResult, setCommitResult] = useState(null);
    // Approve state
    const [approving, setApproving] = useState(false);
    const [approveResult, setApproveResult] = useState(null);
    // Selection state for approval
    const [committedTxs, setCommittedTxs] = useState([]);  // DB transactions with IDs
    const [selectedTxIds, setSelectedTxIds] = useState(new Set());
    // Validation state
    const [validationResult, setValidationResult] = useState(null);
    const [validating, setValidating] = useState(false);
    const [showValidationDetails, setShowValidationDetails] = useState(false);
    // Confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
    // Accounts for linking
    const [accounts, setAccounts] = useState([]);
    // Duplicate detection state
    const [matchSummary, setMatchSummary] = useState(null);
    const [matchFilter, setMatchFilter] = useState('all'); // 'all' | 'new' | 'matched'
    // Reconciliation timeline state
    const [timelineData, setTimelineData] = useState(null);
    const [showTimeline, setShowTimeline] = useState(false);

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
        // Fetch accounts for linking
        api.get('/accounts/').then(res => setAccounts(res.data)).catch(() => {});
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
            // Store match summary from duplicate detection
            setMatchSummary(txRes.data.match_summary || null);
            setMatchFilter('all');
            // Store committed DB transactions for selection
            const cTxs = txRes.data.committed_transactions || [];
            setCommittedTxs(cTxs);
            // Auto-select all draft transactions
            setSelectedTxIds(new Set(cTxs.filter(t => t.status === 'draft').map(t => t.id)));
            // Fetch reconciliation timeline if statement is linked to an account
            if (detailRes.data.account_id) {
                try {
                    const tlRes = await api.get(`/api/statements/reconciliation/${detailRes.data.account_id}`);
                    setTimelineData(tlRes.data);
                } catch (e) {
                    console.warn('Timeline fetch failed:', e);
                    setTimelineData(null);
                }
            } else {
                setTimelineData(null);
            }
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

    const handleCommitToLedger = async () => {
        if (!selectedStatement) return;
        const matchedRows = parsedTransactions.filter(tx => tx.match_status === 'matched');
        const newRows = parsedTransactions.filter(tx => tx.match_status !== 'matched');
        const newCount = newRows.length;
        const matchedCount = matchedRows.length;
        const acctLabel = statementDetail?.account_number ? `****${statementDetail.account_number.slice(-4)}` : 'linked account';
        
        const matchInfo = matchedCount > 0 
            ? `\n\n${matchedCount} duplicate transaction${matchedCount !== 1 ? 's' : ''} (already captured via SMS) will be skipped.`
            : '';
        
        setConfirmDialog({
            open: true,
            title: 'Commit to Ledger',
            message: `This will create ${newCount} draft transactions in the main ledger for account ${acctLabel}.${matchInfo}\n\nDraft transactions do NOT affect your account balance until approved.`,
            variant: 'primary',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));
                setCommitting(true);
                setCommitResult(null);
                setError(null);
                try {
                    // Pass matched row indices to exclude from commit
                    const excludeIndices = matchedRows.map(tx => tx.row_index);
                    const res = await api.post(`/api/statements/${selectedStatement}/commit`, {
                        exclude_row_indices: excludeIndices.length > 0 ? excludeIndices : undefined
                    });
                    setCommitResult(res.data);
                    const detailRes = await api.get(`/api/statements/${selectedStatement}`);
                    setStatementDetail(detailRes.data);
                    fetchStatements();
                } catch (err) {
                    setError(err.response?.data?.detail || 'Commit to ledger failed');
                } finally {
                    setCommitting(false);
                }
            }
        });
    };

    const handleApprove = async () => {
        if (!selectedStatement) return;
        const draftTxs = committedTxs.filter(t => t.status === 'draft');
        const selectedCount = selectedTxIds.size;
        const allSelected = selectedCount === draftTxs.length;
        const acctLabel = statementDetail?.account_number ? `****${statementDetail.account_number.slice(-4)}` : 'linked account';
        
        setConfirmDialog({
            open: true,
            title: allSelected ? 'Approve All Transactions' : `Approve ${selectedCount} Transactions`,
            message: `This will promote ${selectedCount} draft transaction${selectedCount !== 1 ? 's' : ''} to completed for account ${acctLabel}.\n\nThis will update the account balance. This action cannot be undone.`,
            variant: 'primary',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));
                setApproving(true);
                setApproveResult(null);
                setError(null);
                try {
                    const payload = allSelected ? {} : { transaction_ids: [...selectedTxIds] };
                    const res = await api.post(`/api/statements/${selectedStatement}/approve`, payload);
                    setApproveResult(res.data);
                    // Refresh detail and transactions
                    const [detailRes, txRes] = await Promise.all([
                        api.get(`/api/statements/${selectedStatement}`),
                        api.get(`/api/statements/${selectedStatement}/transactions`),
                    ]);
                    setStatementDetail(detailRes.data);
                    setParsedTransactions(txRes.data.transactions || []);
                    const cTxs = txRes.data.committed_transactions || [];
                    setCommittedTxs(cTxs);
                    setSelectedTxIds(new Set(cTxs.filter(t => t.status === 'draft').map(t => t.id)));
                    fetchStatements();
                } catch (err) {
                    setError(err.response?.data?.detail || 'Approval failed');
                } finally {
                    setApproving(false);
                }
            }
        });
    };

    const handleCommitAndApprove = async () => {
        if (!selectedStatement) return;
        const matchedRows = parsedTransactions.filter(tx => tx.match_status === 'matched');
        const newCount = parsedTransactions.filter(tx => tx.match_status !== 'matched').length;
        const matchedCount = matchedRows.length;
        const acctLabel = statementDetail?.account_number ? `****${statementDetail.account_number.slice(-4)}` : 'linked account';
        
        const matchInfo = matchedCount > 0 
            ? `\n\n${matchedCount} duplicate${matchedCount !== 1 ? 's' : ''} (already via SMS) will be skipped.`
            : '';
        
        setConfirmDialog({
            open: true,
            title: 'Commit & Approve',
            message: `This will commit ${newCount} new transactions and immediately approve them for account ${acctLabel}.${matchInfo}\n\nThe account balance will be updated. This cannot be undone.`,
            variant: 'primary',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));
                setCommitting(true);
                setCommitResult(null);
                setError(null);
                try {
                    // Step 1: Commit
                    const excludeIndices = matchedRows.map(tx => tx.row_index);
                    const commitRes = await api.post(`/api/statements/${selectedStatement}/commit`, {
                        exclude_row_indices: excludeIndices.length > 0 ? excludeIndices : undefined
                    });
                    
                    // Step 2: Approve all
                    const approveRes = await api.post(`/api/statements/${selectedStatement}/approve`, {});
                    setApproveResult(approveRes.data);
                    
                    // Refresh everything
                    const [detailRes, txRes] = await Promise.all([
                        api.get(`/api/statements/${selectedStatement}`),
                        api.get(`/api/statements/${selectedStatement}/transactions`),
                    ]);
                    setStatementDetail(detailRes.data);
                    setParsedTransactions(txRes.data.transactions || []);
                    setMatchSummary(txRes.data.match_summary || null);
                    const cTxs = txRes.data.committed_transactions || [];
                    setCommittedTxs(cTxs);
                    setSelectedTxIds(new Set(cTxs.filter(t => t.status === 'draft').map(t => t.id)));
                    // Refresh timeline
                    if (detailRes.data.account_id) {
                        try {
                            const tlRes = await api.get(`/api/statements/reconciliation/${detailRes.data.account_id}`);
                            setTimelineData(tlRes.data);
                        } catch (e) { /* ignore */ }
                    }
                    fetchStatements();
                } catch (err) {
                    setError(err.response?.data?.detail || 'Commit & Approve failed');
                } finally {
                    setCommitting(false);
                }
            }
        });
    };

    const handleValidate = async () => {
        if (!selectedStatement) return;
        setValidating(true);
        setValidationResult(null);
        try {
            const res = await api.get(`/api/statements/${selectedStatement}/validate`);
            setValidationResult(res.data);
            setShowValidationDetails(true);
        } catch (err) {
            setError(err.response?.data?.detail || 'Validation failed');
        } finally {
            setValidating(false);
        }
    };

    const handleDelete = async (id) => {
        setConfirmDialog({
            open: true,
            title: 'Delete Statement',
            message: 'Delete this statement and all its draft transactions? This action cannot be undone.',
            variant: 'danger',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));
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
            }
        });
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

        // Match status filter
        if (matchFilter === 'new') {
            result = result.filter(tx => tx.match_status !== 'matched');
        } else if (matchFilter === 'matched') {
            result = result.filter(tx => tx.match_status === 'matched');
        }

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
    }, [parsedTransactions, txSearch, txTypeFilter, txDateRange, txAmountMin, txAmountMax, txCountLimit, matchFilter]);

    const totalDebits = filteredParsedTx.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
    const totalCredits = filteredParsedTx.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
    const hasTxFilters = txSearch || txTypeFilter || txDateRange.start || txDateRange.end || txAmountMin || txAmountMax || txCountLimit || matchFilter !== 'all';
    const clearTxFilters = () => { setTxSearch(''); setTxTypeFilter(''); setTxDateRange({ start: '', end: '' }); setTxAmountMin(''); setTxAmountMax(''); setTxCountLimit(''); setMatchFilter('all'); };

    // System-computed balance: independent running balance from account's pre-statement balance
    // Uses the account's balance BEFORE statement transactions as anchor (not the bank's opening_balance)
    // Uses integer-cent arithmetic to avoid floating-point drift
    const systemBalances = useMemo(() => {
        const preStmtBalance = statementDetail?.account_balance_before_statement;
        if (preStmtBalance == null || parsedTransactions.length === 0) return {};
        const map = {};
        let runningCents = Math.round(preStmtBalance * 100);
        for (const tx of parsedTransactions) {
            const debitCents = Math.round((tx.debit_amount || 0) * 100);
            const creditCents = Math.round((tx.credit_amount || 0) * 100);
            runningCents = runningCents - debitCents + creditCents;
            map[tx.row_index] = runningCents / 100;
        }
        return map;
    }, [parsedTransactions, statementDetail?.account_balance_before_statement]);

    // Must be before conditional return (React hooks rules)
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

    // ─────────────── DETAIL VIEW ───────────────
    if (selectedStatement) {

        return (
        <>
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
                            {!statementDetail?.account_id && (
                                <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded">⚠ No account linked</span>
                            )}
                            {statementDetail?.account_name && (
                                <>
                                    <span className="text-gray-600">→</span>
                                    <span className="text-sm text-emerald-400">{statementDetail.account_name}</span>
                                </>
                            )}
                        </div>
                        {/* Account Link Selector — shown when no account is linked */}
                        {!statementDetail?.account_id && statementDetail?.status === 'draft' && (
                            <div className="flex items-center gap-2 mt-1">
                                <Wallet size={14} className="text-amber-400" />
                                <select
                                    className="bg-slate-800 border border-amber-600/50 text-amber-300 rounded px-2 py-1 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    defaultValue=""
                                    onChange={async (e) => {
                                        const accountId = e.target.value;
                                        if (!accountId) return;
                                        try {
                                            await api.patch(`/api/statements/${selectedStatement}`, { account_id: accountId });
                                            // Refresh detail
                                            const detailRes = await api.get(`/api/statements/${selectedStatement}`);
                                            setStatementDetail(detailRes.data);
                                            fetchStatements();
                                        } catch (err) {
                                            setError(err.response?.data?.detail || 'Failed to link account');
                                        }
                                    }}
                                >
                                    <option value="">Link to account...</option>
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name} {a.last_4_digits ? `•••• ${a.last_4_digits}` : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleReParse}
                        disabled={loadingDetail}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loadingDetail ? 'animate-spin' : ''} />
                        Re-parse
                    </button>
                    {parsedTransactions.length > 0 && statementDetail?.status === 'draft' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCommitToLedger}
                                disabled={committing || loadingDetail}
                                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                            >
                                {committing ? (
                                    <><Loader2 size={14} className="animate-spin" />Committing...</>
                                ) : (
                                    <><CheckCircle2 size={14} />Commit {matchSummary && matchSummary.matched > 0 ? `${matchSummary.new} New` : ''} to Ledger</>
                                )}
                            </button>
                            <button
                                onClick={handleCommitAndApprove}
                                disabled={committing || loadingDetail}
                                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-sm font-medium transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
                            >
                                {committing ? (
                                    <><Loader2 size={14} className="animate-spin" />Processing...</>
                                ) : (
                                    <><ShieldCheck size={14} />Commit & Approve</>
                                )}
                            </button>
                        </div>
                    )}
                    {(statementDetail?.status === 'reviewed' || (statementDetail?.status === 'approved' && committedTxs.some(t => t.status === 'draft'))) && selectedTxIds.size > 0 && (
                        <button
                            onClick={handleApprove}
                            disabled={approving || loadingDetail}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                            {approving ? (
                                <><Loader2 size={14} className="animate-spin" />Approving...</>
                            ) : (
                                <><CheckCircle2 size={14} />Approve {selectedTxIds.size === committedTxs.filter(t => t.status === 'draft').length ? 'All' : selectedTxIds.size} Transaction{selectedTxIds.size !== 1 ? 's' : ''}</>
                            )}
                        </button>
                    )}
                </div>

                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-400" />
                        <p className="text-red-300 text-sm flex-1">{error}</p>
                        <button onClick={() => setError(null)} className="text-gray-500 hover:text-gray-300"><XCircle size={16} /></button>
                    </div>
                )}

                {/* Commit Result Banner */}
                {commitResult && (
                    <div className={`rounded-xl border p-4 ${commitResult.excluded > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                        <div className="flex items-start gap-3">
                            {commitResult.excluded > 0 ? (
                                <AlertTriangle size={18} className="text-amber-400 mt-0.5" />
                            ) : (
                                <CheckCircle2 size={18} className="text-emerald-400 mt-0.5" />
                            )}
                            <div className="flex-1">
                                <p className={`text-sm font-medium ${commitResult.excluded > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                                    Committed {commitResult.created} draft transactions to the ledger
                                </p>
                                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                                    <span>{commitResult.created} created</span>
                                    {commitResult.excluded > 0 && (
                                        <span className="text-blue-400">{commitResult.excluded} duplicates skipped</span>
                                    )}
                                    {commitResult.skipped > 0 && (
                                        <span>{commitResult.skipped} skipped (zero amount)</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setCommitResult(null)} className="text-gray-500 hover:text-gray-300">
                                <XCircle size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Approve Result Banner */}
                {approveResult && (
                    <div className="rounded-xl border p-4 bg-blue-500/5 border-blue-500/20">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 size={18} className="text-blue-400 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-blue-300">
                                    ✓ Approved {approveResult.approved_count} transactions
                                </p>
                                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                                    <span>{approveResult.approved_count} promoted to completed</span>
                                    {approveResult.old_balance != null && approveResult.new_balance != null && (
                                        <span className="text-blue-400">
                                            Balance: {Number(approveResult.old_balance).toLocaleString('en-US', {minimumFractionDigits: 2})} → {Number(approveResult.new_balance).toLocaleString('en-US', {minimumFractionDigits: 2})} SAR
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setApproveResult(null)} className="text-gray-500 hover:text-gray-300">
                                <XCircle size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Validation Panel */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
                    <button
                        onClick={() => validationResult ? setShowValidationDetails(!showValidationDetails) : handleValidate()}
                        disabled={validating}
                        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-800/50 transition-colors"
                    >
                        {validating ? (
                            <Loader2 size={16} className="text-blue-400 animate-spin" />
                        ) : validationResult?.valid ? (
                            <ShieldCheck size={16} className="text-emerald-400" />
                        ) : validationResult ? (
                            <AlertTriangle size={16} className="text-amber-400" />
                        ) : (
                            <ShieldCheck size={16} className="text-gray-500" />
                        )}
                        <span className={`text-sm font-medium flex-1 text-left ${
                            validationResult?.valid ? 'text-emerald-300' : validationResult ? 'text-amber-300' : 'text-gray-300'
                        }`}>
                            {validating ? 'Validating...' : validationResult ? validationResult.summary : 'Validate Balance Chain'}
                        </span>
                        {validationResult && (
                            <ChevronDown size={16} className={`text-gray-500 transition-transform ${showValidationDetails ? 'rotate-180' : ''}`} />
                        )}
                        {!validationResult && !validating && (
                            <span className="text-xs text-gray-600">Click to run</span>
                        )}
                    </button>

                    {showValidationDetails && validationResult && (
                        <div className="border-t border-slate-800 px-5 py-4 space-y-3">
                            {/* Check results */}
                            <div className="space-y-2">
                                {validationResult.checks.map((check, i) => (
                                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                                        check.status === 'pass'
                                            ? 'bg-emerald-500/5 border-emerald-500/20'
                                            : 'bg-red-500/5 border-red-500/20'
                                    }`}>
                                        {check.status === 'pass' ? (
                                            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                                        ) : (
                                            <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${check.status === 'pass' ? 'text-emerald-300' : 'text-red-300'}`}>
                                                {check.name}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5 font-mono">{check.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Aggregates */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                                <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                                    <p className="text-[10px] text-gray-500 uppercase">Total Debits</p>
                                    <p className="text-sm text-red-400 font-mono">{validationResult.total_debits?.toLocaleString('en-SA', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                                    <p className="text-[10px] text-gray-500 uppercase">Total Credits</p>
                                    <p className="text-sm text-green-400 font-mono">{validationResult.total_credits?.toLocaleString('en-SA', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                                    <p className="text-[10px] text-gray-500 uppercase">Net Change</p>
                                    <p className="text-sm text-gray-300 font-mono">{(validationResult.total_debits - validationResult.total_credits)?.toLocaleString('en-SA', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                                    <p className="text-[10px] text-gray-500 uppercase">Rows Checked</p>
                                    <p className="text-sm text-gray-300">{validationResult.transaction_count}</p>
                                </div>
                            </div>

                            {/* Row errors table */}
                            {validationResult.row_errors?.length > 0 && (
                                <div className="mt-3">
                                    <p className="text-xs text-red-400 font-medium mb-2">Row-Level Errors ({validationResult.row_error_count})</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-[10px] text-gray-500 uppercase border-b border-slate-700">
                                                    <th className="px-3 py-2 text-left">Row</th>
                                                    <th className="px-3 py-2 text-left">Date</th>
                                                    <th className="px-3 py-2 text-left">Merchant</th>
                                                    <th className="px-3 py-2 text-right">Amount</th>
                                                    <th className="px-3 py-2 text-right">Expected</th>
                                                    <th className="px-3 py-2 text-right">Reported</th>
                                                    <th className="px-3 py-2 text-right">Drift</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {validationResult.row_errors.map((err, i) => (
                                                    <tr key={i} className="border-b border-slate-800/50">
                                                        <td className="px-3 py-2 text-gray-400">#{err.row}</td>
                                                        <td className="px-3 py-2 text-gray-300 font-mono">{err.date}</td>
                                                        <td className="px-3 py-2 text-gray-300 truncate max-w-[150px]">{err.merchant}</td>
                                                        <td className="px-3 py-2 text-right font-mono">
                                                            {err.debit > 0 ? <span className="text-red-400">{err.debit.toFixed(2)}</span> : <span className="text-green-400">{err.credit.toFixed(2)}</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-mono text-gray-400">{err.expected_balance.toFixed(2)}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-gray-300">{err.reported_balance.toFixed(2)}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-red-400">{err.drift > 0 ? '+' : ''}{err.drift.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Re-validate button */}
                            <div className="flex justify-end pt-1">
                                <button
                                    onClick={handleValidate}
                                    disabled={validating}
                                    className="text-xs text-gray-500 hover:text-gray-300 transition flex items-center gap-1"
                                >
                                    <RefreshCw size={12} className={validating ? 'animate-spin' : ''} />
                                    Re-validate
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary Cards */}
                {statementDetail && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Period</p>
                            <p className="text-sm text-white font-medium">
                                {formatDate(statementDetail.statement_period_start)}<br/>
                                <span className="text-gray-500">to</span> {formatDate(statementDetail.statement_period_end)}
                            </p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Bank Opening</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.opening_balance)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Bank Closing</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.closing_balance)} <span className="text-[11px] text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-blue-500/20 p-4">
                            <p className="text-[11px] text-blue-400 uppercase tracking-wider mb-1.5">System Start</p>
                            <p className="text-lg text-blue-300 font-semibold">{statementDetail.account_balance_before_statement != null ? formatAmount(statementDetail.account_balance_before_statement) : '—'} <span className="text-[11px] text-gray-500">SAR</span></p>
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

                {/* Reconciliation Timeline */}
                {timelineData && timelineData.timeline.length > 0 && (
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
                        <button
                            onClick={() => setShowTimeline(!showTimeline)}
                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <GitBranch size={16} className="text-purple-400" />
                                <span className="text-white font-medium text-sm">Account Timeline</span>
                                <span className="text-xs text-gray-500">{timelineData.account_name}</span>
                                <span className="text-xs text-gray-600">•</span>
                                <span className="text-xs text-gray-500">{timelineData.statement_count} statement{timelineData.statement_count !== 1 ? 's' : ''}</span>
                                {timelineData.checks.length > 0 && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${timelineData.checks.every(c => c.pass) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                        {timelineData.checks.every(c => c.pass) ? '✅ All Checks Pass' : `⚠️ ${timelineData.checks.filter(c => !c.pass).length} Issue${timelineData.checks.filter(c => !c.pass).length !== 1 ? 's' : ''}`}
                                    </span>
                                )}
                            </div>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${showTimeline ? 'rotate-180' : ''}`} />
                        </button>
                        {showTimeline && (
                            <div className="px-5 pb-5">
                                {/* Horizontal timeline */}
                                <div className="flex items-stretch gap-0 overflow-x-auto pb-3 pt-2">
                                    {timelineData.timeline.map((block, idx) => {
                                        const isCurrent = block.type === 'statement' && block.statement_id === selectedStatement;
                                        if (block.type === 'statement') {
                                            const periodLabel = block.period_start && block.period_end
                                                ? `${new Date(block.period_start).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })} — ${new Date(block.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                                : 'No dates';
                                            const statusColor = block.status === 'approved'
                                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                                : block.status === 'reviewed'
                                                    ? 'border-blue-500/40 bg-blue-500/5'
                                                    : 'border-slate-700 bg-slate-800/50';
                                            return (
                                                <React.Fragment key={idx}>
                                                    <div
                                                        className={`flex-shrink-0 rounded-xl border-2 p-4 min-w-[180px] cursor-pointer transition-all hover:bg-slate-700/30 ${
                                                            isCurrent ? 'border-purple-500/60 bg-purple-500/10 ring-1 ring-purple-500/30' : statusColor
                                                        }`}
                                                        onClick={() => { if (!isCurrent) openStatementDetail(block.statement_id); }}
                                                    >
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <FileText size={14} className={isCurrent ? 'text-purple-400' : 'text-gray-400'} />
                                                            <span className={`text-xs font-medium ${isCurrent ? 'text-purple-300' : 'text-gray-300'}`}>Statement</span>
                                                            {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">Current</span>}
                                                        </div>
                                                        <p className="text-xs text-gray-400 mb-1">{periodLabel}</p>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-sm font-mono text-white">{formatAmount(block.opening_balance)}</span>
                                                            <span className="text-[10px] text-gray-500">→</span>
                                                            <span className="text-sm font-mono text-white">{formatAmount(block.closing_balance)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <span className="text-[10px] text-gray-500">{block.transaction_count} txs</span>
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                                block.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400'
                                                                : block.status === 'reviewed' ? 'bg-blue-500/10 text-blue-400'
                                                                : 'bg-slate-700 text-gray-400'
                                                            }`}>{block.status}</span>
                                                        </div>
                                                    </div>
                                                    {/* Continuity arrow between statements */}
                                                    {idx < timelineData.timeline.length - 1 && (
                                                        <div className="flex items-center flex-shrink-0 px-1">
                                                            {(() => {
                                                                const nextBlock = timelineData.timeline[idx + 1];
                                                                // Find continuity check for this pair
                                                                const check = nextBlock?.type === 'statement'
                                                                    ? timelineData.checks.find(c => c.from_statement_id === block.statement_id && c.to_statement_id === nextBlock.statement_id)
                                                                    : null;
                                                                return (
                                                                    <div className="flex flex-col items-center gap-0.5">
                                                                        <div className={`w-8 h-0.5 ${check ? (check.pass ? 'bg-emerald-500/50' : 'bg-amber-500/50') : 'bg-slate-700'}`}></div>
                                                                        {check && (
                                                                            <span className={`text-[9px] ${check.pass ? 'text-emerald-500' : 'text-amber-400'}`}>
                                                                                {check.pass ? '✓' : `Δ ${check.discrepancy}`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        } else {
                                            // Gap block
                                            return (
                                                <React.Fragment key={idx}>
                                                    <div className="flex items-center flex-shrink-0 px-1">
                                                        <div className="w-6 h-0.5 bg-slate-700 border-dashed"></div>
                                                    </div>
                                                    <div className="flex-shrink-0 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-3 min-w-[140px]">
                                                        <div className="flex items-center gap-1.5 mb-1.5">
                                                            <Clock size={12} className="text-gray-500" />
                                                            <span className="text-[10px] text-gray-500 font-medium">Gap</span>
                                                            <span className="text-[10px] text-gray-600">{block.gap_days}d</span>
                                                        </div>
                                                        {block.sms_transaction_count > 0 ? (
                                                            <>
                                                                <p className="text-xs text-gray-400">{block.sms_transaction_count} SMS tx{block.sms_transaction_count !== 1 ? 's' : ''}</p>
                                                                <p className={`text-xs font-mono mt-0.5 ${block.sms_net_amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                    {block.sms_net_amount >= 0 ? '+' : ''}{formatAmount(block.sms_net_amount)}
                                                                </p>
                                                            </>
                                                        ) : (
                                                            <p className="text-[10px] text-gray-600">No transactions</p>
                                                        )}
                                                    </div>
                                                    {idx < timelineData.timeline.length - 1 && (
                                                        <div className="flex items-center flex-shrink-0 px-1">
                                                            <div className="w-6 h-0.5 bg-slate-700"></div>
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        }
                                    })}
                                </div>

                                {/* Continuity checks detail */}
                                {timelineData.checks.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-800">
                                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Balance Continuity Checks</p>
                                        <div className="space-y-1.5">
                                            {timelineData.checks.map((check, i) => (
                                                <div key={i} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${check.pass ? 'bg-emerald-500/5' : 'bg-amber-500/5'}`}>
                                                    <span className={check.pass ? 'text-emerald-400' : 'text-amber-400'}>{check.pass ? '✅' : '⚠️'}</span>
                                                    <span className="text-gray-400">
                                                        Closing {formatAmount(check.from_closing)}
                                                        {check.gap_sms_count > 0 && (
                                                            <span className="text-gray-500"> + {check.gap_sms_count} SMS txs ({check.gap_net_amount >= 0 ? '+' : ''}{formatAmount(check.gap_net_amount)})</span>
                                                        )}
                                                        {' → '}
                                                        Opening {formatAmount(check.to_opening)}
                                                    </span>
                                                    {!check.pass && (
                                                        <span className="text-amber-400 font-medium">Δ {formatAmount(check.discrepancy)} SAR</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Match Summary Banner */}
                {matchSummary && matchSummary.matched > 0 && statementDetail?.status === 'draft' && (
                    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                                <span className="text-sm text-emerald-400 font-medium">{matchSummary.new} New</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Link2 size={14} className="text-blue-400" />
                                <span className="text-sm text-blue-400 font-medium">{matchSummary.matched} Already Captured</span>
                                <span className="text-xs text-gray-500">(via SMS/Webhook)</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {['all', 'new', 'matched'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setMatchFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        matchFilter === f
                                            ? 'bg-slate-600 text-white'
                                            : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700'
                                    }`}
                                >
                                    {f === 'all' ? 'All' : f === 'new' ? `New (${matchSummary.new})` : `Matched (${matchSummary.matched})`}
                                </button>
                            ))}
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
                                        {committedTxs.some(t => t.status === 'draft') && (
                                            <th className="px-2 py-3 w-8">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedTxIds.size > 0 && selectedTxIds.size === committedTxs.filter(t => t.status === 'draft').length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedTxIds(new Set(committedTxs.filter(t => t.status === 'draft').map(t => t.id)));
                                                        } else {
                                                            setSelectedTxIds(new Set());
                                                        }
                                                    }}
                                                />
                                            </th>
                                        )}
                                        <th className="px-4 py-3 text-left w-8">#</th>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Time</th>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Merchant / Beneficiary</th>
                                        <th className="px-4 py-3 text-right">Debit</th>
                                        <th className="px-4 py-3 text-right">Credit</th>
                                        <th className="px-4 py-3 text-right">Bank Bal</th>
                                        <th className="px-4 py-3 text-right">System Bal</th>
                                        {matchSummary && matchSummary.matched > 0 && <th className="px-3 py-3 text-center w-20">Match</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredParsedTx.map((tx, idx) => {
                                        // Match parsed tx to committed DB tx by index
                                        const dbTx = committedTxs[tx.row_index];
                                        const isDraft = dbTx?.status === 'draft';
                                        const isApproved = dbTx?.status === 'completed';
                                        const isMatched = tx.match_status === 'matched';
                                        return (
                                        <tr key={idx} className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors ${isApproved ? 'opacity-60' : ''} ${isMatched && !isApproved ? 'opacity-50' : ''}`}>
                                            {committedTxs.some(t => t.status === 'draft') && (
                                                <td className="px-2 py-2.5 text-center">
                                                    {isDraft && dbTx ? (
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedTxIds.has(dbTx.id)}
                                                            onChange={(e) => {
                                                                setSelectedTxIds(prev => {
                                                                    const next = new Set(prev);
                                                                    if (e.target.checked) next.add(dbTx.id);
                                                                    else next.delete(dbTx.id);
                                                                    return next;
                                                                });
                                                            }}
                                                        />
                                                    ) : isApproved ? (
                                                        <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
                                                    ) : null}
                                                </td>
                                            )}
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
                                                    <span dir="auto" className="text-gray-200 text-xs truncate max-w-[220px]" title={tx.merchant_or_beneficiary || tx.note_text}>
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
                                            <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                                                {(() => {
                                                    const sysBal = systemBalances[tx.row_index];
                                                    if (sysBal == null) return <span className="text-gray-700">—</span>;
                                                    const bankBal = tx.balance;
                                                    const mismatch = Math.abs(sysBal - bankBal) > 0.01;
                                                    return (
                                                        <span className={mismatch ? 'text-amber-400' : 'text-emerald-400'}>
                                                            {mismatch && '⚠ '}{formatAmount(sysBal)}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            {matchSummary && matchSummary.matched > 0 && (
                                                <td className="px-3 py-2.5 text-center">
                                                    {isMatched ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20" title={`Matched: ${tx.matched_tx_merchant || ''} (${tx.matched_tx_source || 'SMS'})`}>
                                                            <Link2 size={10} />
                                                            Captured
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                            New
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                        );
                                    })}
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

            {/* Confirmation Dialog Modal */}
            {confirmDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white mb-3">{confirmDialog.title}</h3>
                        <p className="text-sm text-gray-400 whitespace-pre-line mb-6">{confirmDialog.message}</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDialog.onConfirm}
                                className={`px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                                    confirmDialog.variant === 'danger'
                                        ? 'bg-red-600 hover:bg-red-500'
                                        : 'bg-emerald-600 hover:bg-emerald-500'
                                }`}
                            >
                                {confirmDialog.variant === 'danger' ? 'Delete' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
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
    <>
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
                <div className="bg-slate-900/60 rounded-xl border border-slate-800">
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
                                                            <div className="absolute left-0 bottom-full mb-1 w-36 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
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

        {/* Confirmation Dialog Modal */}
        {confirmDialog.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
                <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-semibold text-white mb-3">{confirmDialog.title}</h3>
                    <p className="text-sm text-gray-400 whitespace-pre-line mb-6">{confirmDialog.message}</p>
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDialog.onConfirm}
                            className={`px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                                confirmDialog.variant === 'danger'
                                    ? 'bg-red-600 hover:bg-red-500'
                                    : 'bg-emerald-600 hover:bg-emerald-500'
                            }`}
                        >
                            {confirmDialog.variant === 'danger' ? 'Delete' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
};

export default Statements;
