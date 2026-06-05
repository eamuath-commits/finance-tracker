import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
    FileSearch,
    Upload,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ArrowRight,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Plus,
    FileSpreadsheet,
    FileText,
    File,
    ArrowUpFromLine,
    Check,
    X,
    Info,
    ArrowLeft,
    Loader2,
    Search,
    Trash2,
    Eye,
    Zap
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://' + window.location.hostname + ':8000';

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—';
    const absAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('en-SA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absAmount);
    return amount < 0 ? `-${formatted} SAR` : `${formatted} SAR`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

// File format badge
const FormatBadge = ({ format, active }) => {
    const icons = {
        CSV: FileText,
        Excel: FileSpreadsheet,
        PDF: File,
        Text: FileText
    };
    const Icon = icons[format] || File;

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            active
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                : 'bg-slate-700/60 text-slate-400 border border-slate-600'
        }`}>
            <Icon size={12} />
            {format}
        </span>
    );
};


export default function Settlement() {
    // === State ===
    const [stage, setStage] = useState('upload'); // 'upload' | 'report' | 'done'
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Report state
    const [report, setReport] = useState(null);
    const [selectedIndices, setSelectedIndices] = useState(new Set());
    const [sortField, setSortField] = useState('date');
    const [sortDir, setSortDir] = useState('asc');
    const [loggingIds, setLoggingIds] = useState(new Set()); // indices currently being logged
    const [loggedIds, setLoggedIds] = useState(new Set()); // indices already logged
    const [batchLogging, setBatchLogging] = useState(false);

    // Tab for report view
    const [reportTab, setReportTab] = useState('missing'); // 'missing' | 'matched'

    // Logged transaction count for done screen
    const [loggedCount, setLoggedCount] = useState(0);

    // Description filter
    const [descFilter, setDescFilter] = useState('');

    // Previous report (for rerun comparison)
    const [previousReport, setPreviousReport] = useState(null);
    const [rerunning, setRerunning] = useState(false);

    // Dismiss + Rerun state
    const [dismissedIds, setDismissedIds] = useState(new Set());
    const [rerunPreview, setRerunPreview] = useState(null); // { tx, preview, loading, confirming }
    const [rerunLoadingIdx, setRerunLoadingIdx] = useState(null);

    // === Effects ===
    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const res = await axios.get(`${API}/accounts`);
            setAccounts(res.data);
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        }
    };

    const isAllAccounts = selectedAccountId === 'all';
    const selectedAccount = isAllAccounts ? null : accounts.find(a => a.id === selectedAccountId);

    // === File Handling ===
    const acceptedFormats = '.csv,.xlsx,.xls,.pdf,.txt';
    const formatLabel = (filename) => {
        if (!filename) return '';
        const ext = filename.split('.').pop().toLowerCase();
        if (ext === 'csv') return 'CSV';
        if (ext === 'xlsx' || ext === 'xls') return 'Excel';
        if (ext === 'pdf') return 'PDF';
        if (ext === 'txt') return 'Text';
        return ext.toUpperCase();
    };

    const handleFileDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
        if (droppedFile) {
            setFile(droppedFile);
            setError(null);
        }
    }, []);

    const handleFileSelect = useCallback((e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);
        }
    }, []);

    // === Upload & Reconcile ===
    const handleUpload = async () => {
        if (!selectedAccountId || !file) return;

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('account_id', selectedAccountId);

        try {
            const res = await axios.post(`${API}/settlement/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            });
            setReport(res.data);
            setSelectedIndices(new Set());
            setLoggedIds(new Set());
            setStage('report');
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                setError(detail.map(d => d.msg || JSON.stringify(d)).join('; '));
            } else {
                setError('Failed to process file. Please check the format and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    // === Rerun (re-submit same file + account) ===
    const handleRerun = async () => {
        if (!selectedAccountId || !file) return;

        setRerunning(true);
        setError(null);
        setPreviousReport(report); // Save current as "before"

        const formData = new FormData();
        formData.append('file', file);
        formData.append('account_id', selectedAccountId);

        try {
            const res = await axios.post(`${API}/settlement/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            });
            setReport(res.data);
            setSelectedIndices(new Set());
            setLoggedIds(new Set());
            setDescFilter('');
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError('Rerun failed. Please try again.');
            }
        } finally {
            setRerunning(false);
        }
    };

    // === Transaction Logging ===
    const handleLogSingle = async (tx) => {
        setLoggingIds(prev => new Set([...prev, tx.index]));
        try {
            await axios.post(`${API}/settlement/log-transaction`, {
                account_id: selectedAccountId,
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                type: tx.type
            });
            setLoggedIds(prev => new Set([...prev, tx.index]));
            setSelectedIndices(prev => {
                const next = new Set(prev);
                next.delete(tx.index);
                return next;
            });
        } catch (err) {
            setError(`Failed to log transaction: ${err.response?.data?.detail || err.message}`);
        } finally {
            setLoggingIds(prev => {
                const next = new Set(prev);
                next.delete(tx.index);
                return next;
            });
        }
    };

    const handleLogBatch = async () => {
        if (selectedIndices.size === 0) return;

        setBatchLogging(true);
        setError(null);

        const transactions = report.missing_transactions
            .filter(tx => selectedIndices.has(tx.index) && !loggedIds.has(tx.index))
            .map(tx => ({
                account_id: selectedAccountId,
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                type: tx.type
            }));

        try {
            const res = await axios.post(`${API}/settlement/log-batch`, {
                account_id: selectedAccountId,
                transactions
            });

            const newLogged = new Set(loggedIds);
            report.missing_transactions
                .filter(tx => selectedIndices.has(tx.index))
                .forEach(tx => newLogged.add(tx.index));
            setLoggedIds(newLogged);
            setSelectedIndices(new Set());
            setLoggedCount(res.data.successful);
        } catch (err) {
            setError(`Batch logging failed: ${err.response?.data?.detail || err.message}`);
        } finally {
            setBatchLogging(false);
        }
    };

    // === Sorting & Filtering ===
    const sortedMissing = useMemo(() => {
        if (!report?.missing_transactions) return [];
        let items = [...report.missing_transactions];

        // Filter dismissed
        items = items.filter(tx => !dismissedIds.has(tx.index));

        // Apply description filter
        if (descFilter.trim()) {
            const q = descFilter.trim().toLowerCase();
            items = items.filter(tx =>
                tx.description.toLowerCase().includes(q) ||
                (tx.raw_line && tx.raw_line.toLowerCase().includes(q))
            );
        }

        items.sort((a, b) => {
            let cmp = 0;
            if (sortField === 'date') {
                cmp = new Date(a.date) - new Date(b.date);
            } else if (sortField === 'amount') {
                cmp = a.amount - b.amount;
            } else if (sortField === 'description') {
                cmp = a.description.localeCompare(b.description);
            } else if (sortField === 'type') {
                cmp = a.type.localeCompare(b.type);
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return items;
    }, [report, sortField, sortDir, descFilter, dismissedIds]);

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ChevronDown size={14} className="text-slate-600" />;
        return sortDir === 'asc'
            ? <ChevronUp size={14} className="text-blue-400" />
            : <ChevronDown size={14} className="text-blue-400" />;
    };

    // === Selection ===
    const toggleSelectAll = () => {
        const unloggedIndices = report.missing_transactions
            .filter(tx => !loggedIds.has(tx.index))
            .map(tx => tx.index);

        if (selectedIndices.size === unloggedIndices.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(unloggedIndices));
        }
    };

    const toggleSelect = (index) => {
        setSelectedIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    // Count unlogged (exclude dismissed)
    const unloggedCount = report
        ? report.missing_transactions.filter(tx => !loggedIds.has(tx.index) && !dismissedIds.has(tx.index)).length
        : 0;

    // === Dismiss ===
    const handleDismiss = (index) => {
        setDismissedIds(prev => new Set([...prev, index]));
        setSelectedIndices(prev => {
            const next = new Set(prev);
            next.delete(index);
            return next;
        });
    };

    // === SMS Rerun (AI parse preview) ===
    const handleRerunPreview = async (tx) => {
        setRerunLoadingIdx(tx.index);
        setError(null);

        try {
            const res = await axios.post(`${API}/settlement/parse-sms`, {
                sms_text: tx.raw_line || tx.description,
                account_id: isAllAccounts ? null : selectedAccountId
            }, { timeout: 30000 });

            setRerunPreview({
                tx,
                preview: res.data,
                confirming: false
            });
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(`Rerun failed: ${typeof detail === 'string' ? detail : 'AI parsing error'}`);
        } finally {
            setRerunLoadingIdx(null);
        }
    };

    const handleConfirmRerun = async () => {
        if (!rerunPreview) return;
        const { tx, preview } = rerunPreview;
        setRerunPreview(prev => ({ ...prev, confirming: true }));

        try {
            const accountId = preview.resolved_account_id || selectedAccountId;
            await axios.post(`${API}/settlement/confirm-sms-ingest`, {
                sms_text: tx.raw_line || tx.description,
                account_id: accountId,
                amount: preview.amount,
                merchant: preview.merchant || preview.description,
                description: preview.description,
                category: preview.category,
                transaction_type: preview.transaction_type,
                timestamp: preview.timestamp
            });

            setLoggedIds(prev => new Set([...prev, tx.index]));
            setRerunPreview(null);
        } catch (err) {
            setError(`Confirm failed: ${err.response?.data?.detail || err.message}`);
            setRerunPreview(prev => ({ ...prev, confirming: false }));
        }
    };

    const handleCancelRerun = () => setRerunPreview(null);

    // === Reset ===
    const handleReset = () => {
        setStage('upload');
        setFile(null);
        setReport(null);
        setPreviousReport(null);
        setDismissedIds(new Set());
        setRerunPreview(null);
        setRerunLoadingIdx(null);
        setSelectedIndices(new Set());
        setLoggedIds(new Set());
        setError(null);
        setDescFilter('');
        setLoggedCount(0);
        setReportTab('missing');
    };

    // === Render ===
    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <FileSearch className="text-white" size={28} />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">Statement Settlement</h1>
                    <p className="text-gray-400">Upload a bank statement to find and log missing transactions</p>
                </div>
            </div>

            {/* Stage: Upload */}
            {stage === 'upload' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Upload Form */}
                    <div className="space-y-6">
                        {/* Step 1: Select Account */}
                        <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">1</span>
                                <h2 className="text-lg font-semibold text-white">Select Account</h2>
                            </div>

                            <select
                                id="settlement-account-select"
                                value={selectedAccountId}
                                onChange={(e) => {
                                    setSelectedAccountId(e.target.value);
                                    setError(null);
                                }}
                                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none text-white transition-all"
                            >
                                <option value="">Choose an account...</option>
                                <option value="all">⚡ All Accounts (multi-account matching)</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.name} {acc.last_4_digits ? `(****${acc.last_4_digits})` : ''}
                                    </option>
                                ))}
                            </select>

                            {isAllAccounts && (
                                <div className="mt-4 p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                    <div className="flex items-start gap-2">
                                        <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                                        <div className="text-sm text-cyan-400/90">
                                            Matching against <strong>{accounts.length} accounts</strong>. Ideal for SMS export files containing transactions from multiple banks.
                                        </div>
                                    </div>
                                </div>
                            )}
                            {selectedAccount && (
                                <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Current Balance</span>
                                        <span className="text-xl font-bold text-white font-mono">
                                            {formatCurrency(selectedAccount.current_balance)}
                                        </span>
                                    </div>
                                    {selectedAccount.bank_name && (
                                        <p className="text-xs text-gray-500 mt-1">{selectedAccount.bank_name}</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Step 2: Upload File */}
                        <div className={`bg-slate-800/40 rounded-2xl p-6 border border-slate-700 transition-opacity ${!selectedAccountId ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">2</span>
                                <h2 className="text-lg font-semibold text-white">Upload Bank Statement</h2>
                            </div>

                            {/* Format badges */}
                            <div className="flex gap-2 mb-4">
                                <FormatBadge format="CSV" active={file && formatLabel(file.name) === 'CSV'} />
                                <FormatBadge format="Excel" active={file && formatLabel(file.name) === 'Excel'} />
                                <FormatBadge format="PDF" active={file && formatLabel(file.name) === 'PDF'} />
                                <FormatBadge format="Text" active={file && formatLabel(file.name) === 'Text'} />
                            </div>

                            {/* Drop zone */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleFileDrop}
                                onClick={() => document.getElementById('file-input').click()}
                                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                                    dragOver
                                        ? 'border-cyan-400 bg-cyan-500/10'
                                        : file
                                            ? 'border-emerald-500/50 bg-emerald-500/5'
                                            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'
                                }`}
                            >
                                <input
                                    id="file-input"
                                    type="file"
                                    accept={acceptedFormats}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {file ? (
                                    <div className="space-y-2">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                                            <CheckCircle size={24} className="text-emerald-400" />
                                        </div>
                                        <p className="text-white font-medium">{file.name}</p>
                                        <p className="text-sm text-gray-400">
                                            {formatLabel(file.name)} • {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFile(null);
                                            }}
                                            className="text-xs text-gray-500 hover:text-red-400 transition mt-1"
                                        >
                                            Remove file
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="w-14 h-14 rounded-xl bg-slate-700/50 flex items-center justify-center mx-auto">
                                            <ArrowUpFromLine size={24} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">Drop your file here or click to browse</p>
                                            <p className="text-sm text-gray-500 mt-1">CSV, Excel (.xlsx), PDF, or Text (.txt) files up to 10MB</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Step 3: Analyze */}
                        <button
                            id="settlement-analyze-btn"
                            onClick={handleUpload}
                            disabled={!selectedAccountId || !file || loading}
                            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw size={20} className="animate-spin" />
                                    Analyzing Statement...
                                </>
                            ) : (
                                <>
                                    <FileSearch size={20} />
                                    Analyze Statement
                                </>
                            )}
                        </button>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}
                    </div>

                    {/* Right: Information */}
                    <div className="space-y-6">
                        <div className="bg-slate-800/40 rounded-2xl p-8 border border-slate-700">
                            <div className="w-20 h-20 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-6">
                                <FileSearch size={40} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-white text-center mb-3">How it works</h3>
                            <div className="space-y-4 text-sm">
                                <div className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                                    <p className="text-gray-400">Select an account, or "All Accounts" for multi-bank SMS files</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                                    <p className="text-gray-400">Upload your bank statement file (CSV, Excel, or PDF)</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                                    <p className="text-gray-400">We'll compare every transaction against your logged records</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                                    <p className="text-gray-400">Review missing transactions and choose which ones to log</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-500/10 rounded-2xl p-5 border border-amber-500/20">
                            <div className="flex items-start gap-3">
                                <Info size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                <div className="text-sm text-amber-400/90">
                                    <strong>Non-destructive</strong> — This tool only identifies missing transactions.
                                    It will never modify or delete your existing records. You choose what gets logged.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stage: Report */}
            {stage === 'report' && report && (
                <div className="space-y-6">
                    {/* Back + Rerun buttons */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            <ArrowLeft size={16} />
                            Upload another statement
                        </button>
                        <button
                            onClick={handleRerun}
                            disabled={rerunning}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={rerunning ? 'animate-spin' : ''} />
                            {rerunning ? 'Re-analyzing...' : 'Rerun Analysis'}
                        </button>
                    </div>

                    {/* Before/After Comparison (shown after rerun) */}
                    {previousReport && (
                        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-700">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Before → After Rerun</h3>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Matched</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-lg font-bold text-gray-500">{previousReport.matched_count}</span>
                                        <ArrowRight size={14} className="text-gray-600" />
                                        <span className={`text-lg font-bold ${
                                            report.matched_count > previousReport.matched_count ? 'text-emerald-400' : 'text-white'
                                        }`}>{report.matched_count}</span>
                                        {report.matched_count > previousReport.matched_count && (
                                            <span className="text-xs text-emerald-400 font-medium">+{report.matched_count - previousReport.matched_count}</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Missing</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-lg font-bold text-gray-500">{previousReport.missing_count}</span>
                                        <ArrowRight size={14} className="text-gray-600" />
                                        <span className={`text-lg font-bold ${
                                            report.missing_count < previousReport.missing_count ? 'text-emerald-400' : 'text-white'
                                        }`}>{report.missing_count}</span>
                                        {report.missing_count < previousReport.missing_count && (
                                            <span className="text-xs text-emerald-400 font-medium">{report.missing_count - previousReport.missing_count}</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Reconciled</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-lg font-bold text-gray-500">
                                            {previousReport.total_bank_transactions > 0 ? Math.round((previousReport.matched_count / previousReport.total_bank_transactions) * 100) : 0}%
                                        </span>
                                        <ArrowRight size={14} className="text-gray-600" />
                                        <span className={`text-lg font-bold ${
                                            report.matched_count > previousReport.matched_count ? 'text-emerald-400' : 'text-white'
                                        }`}>
                                            {report.total_bank_transactions > 0 ? Math.round((report.matched_count / report.total_bank_transactions) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setPreviousReport(null)}
                                className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition"
                            >
                                Dismiss comparison
                            </button>
                        </div>
                    )}

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-700">
                            <p className="text-xs text-gray-500 uppercase font-medium mb-1">File</p>
                            <p className="text-lg font-bold text-white truncate">{report.file_name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {report.date_range?.start && report.date_range?.end
                                    ? `${formatDate(report.date_range.start)} — ${formatDate(report.date_range.end)}`
                                    : 'Unknown date range'}
                            </p>
                        </div>
                        <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-700">
                            <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total Bank Transactions</p>
                            <p className="text-3xl font-bold text-white">{report.total_bank_transactions}</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/20">
                            <p className="text-xs text-emerald-400/70 uppercase font-medium mb-1">Matched</p>
                            <p className="text-3xl font-bold text-emerald-400">{report.matched_count}</p>
                            <p className="text-xs text-emerald-400/60 mt-1">
                                {report.total_bank_transactions > 0
                                    ? `${Math.round((report.matched_count / report.total_bank_transactions) * 100)}% reconciled`
                                    : ''}
                            </p>
                        </div>
                        <div className={`rounded-2xl p-5 border ${
                            report.missing_count > 0
                                ? 'bg-amber-500/10 border-amber-500/20'
                                : 'bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                            <p className={`text-xs uppercase font-medium mb-1 ${
                                report.missing_count > 0 ? 'text-amber-400/70' : 'text-emerald-400/70'
                            }`}>Missing</p>
                            <p className={`text-3xl font-bold ${
                                report.missing_count > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}>{report.missing_count}</p>
                            {loggedIds.size > 0 && (
                                <p className="text-xs text-emerald-400/60 mt-1">
                                    {loggedIds.size} already logged
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Parsing Warnings */}
                    {report.parsing_warnings?.length > 0 && (
                        <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
                            <details>
                                <summary className="flex items-center gap-2 text-sm text-amber-400 cursor-pointer">
                                    <AlertTriangle size={14} />
                                    {report.parsing_warnings.length} parsing warning{report.parsing_warnings.length !== 1 ? 's' : ''}
                                </summary>
                                <ul className="mt-2 space-y-1 text-xs text-amber-400/70 pl-6 list-disc">
                                    {report.parsing_warnings.slice(0, 20).map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                    {report.parsing_warnings.length > 20 && (
                                        <li>...and {report.parsing_warnings.length - 20} more</li>
                                    )}
                                </ul>
                            </details>
                        </div>
                    )}

                    {/* Error display */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <span className="text-sm">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Report Tabs + Filter */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
                            <button
                                onClick={() => setReportTab('missing')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                                    reportTab === 'missing'
                                        ? 'bg-amber-600 text-white shadow'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <AlertTriangle size={14} />
                                Missing ({unloggedCount})
                            </button>
                            <button
                                onClick={() => setReportTab('matched')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                                    reportTab === 'matched'
                                        ? 'bg-emerald-600 text-white shadow'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <CheckCircle size={14} />
                                Matched ({report.matched_count})
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Search filter */}
                            {reportTab === 'missing' && report?.missing_count > 0 && (
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        id="settlement-desc-filter"
                                        type="text"
                                        value={descFilter}
                                        onChange={(e) => setDescFilter(e.target.value)}
                                        placeholder="Filter by description..."
                                        className="pl-9 pr-8 py-2 w-56 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                                    />
                                    {descFilter && (
                                        <button
                                            onClick={() => setDescFilter('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Batch action bar */}
                            {reportTab === 'missing' && unloggedCount > 0 && !isAllAccounts && (
                                <div className="flex items-center gap-3">
                                {selectedIndices.size > 0 && (
                                    <button
                                        id="settlement-log-selected-btn"
                                        onClick={handleLogBatch}
                                        disabled={batchLogging}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-medium text-sm rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {batchLogging ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                Logging...
                                            </>
                                        ) : (
                                            <>
                                                <Plus size={14} />
                                                Log Selected ({selectedIndices.size})
                                            </>
                                        )}
                                    </button>
                                )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Missing Transactions Table */}
                    {reportTab === 'missing' && isAllAccounts && unloggedCount > 0 && (
                        <div className="flex items-start gap-3 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                            <Info size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-cyan-400/90">
                                <strong>View-only mode</strong> — To log missing transactions, re-run the analysis with a specific account selected so we know where to record them.
                            </div>
                        </div>
                    )}
                    {reportTab === 'missing' && (
                        <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
                            {report.missing_transactions.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} className="text-emerald-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-emerald-400">All transactions matched!</h3>
                                    <p className="text-gray-500 text-sm mt-1">Every transaction in the bank statement has a corresponding system record.</p>
                                </div>
                            ) : loggedIds.size === report.missing_transactions.length ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} className="text-emerald-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-emerald-400">All missing transactions logged!</h3>
                                    <p className="text-gray-500 text-sm mt-1">All {loggedIds.size} missing transactions have been added to the system.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-900/50 sticky top-0">
                                            <tr className="text-xs text-gray-500 uppercase">
                                                {!isAllAccounts && (
                                                <th className="text-left px-4 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIndices.size > 0 && selectedIndices.size === unloggedCount}
                                                        onChange={toggleSelectAll}
                                                        className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                                                    />
                                                </th>
                                                )}
                                                <th
                                                    className="text-left px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                                                    onClick={() => toggleSort('date')}
                                                >
                                                    <span className="flex items-center gap-1">Date <SortIcon field="date" /></span>
                                                </th>
                                                <th
                                                    className="text-right px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                                                    onClick={() => toggleSort('amount')}
                                                >
                                                    <span className="flex items-center gap-1 justify-end">Amount <SortIcon field="amount" /></span>
                                                </th>
                                                <th className="text-left px-4 py-3">Type</th>
                                                <th
                                                    className="text-left px-4 py-3 cursor-pointer hover:text-gray-300 select-none"
                                                    onClick={() => toggleSort('description')}
                                                >
                                                    <span className="flex items-center gap-1">Description <SortIcon field="description" /></span>
                                                </th>
                                                {!isAllAccounts && (
                                                <th className="text-right px-4 py-3 w-40">Action</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {sortedMissing.map(tx => {
                                                const isLogged = loggedIds.has(tx.index);
                                                const isLogging = loggingIds.has(tx.index);

                                                return (
                                                    <tr
                                                        key={tx.index}
                                                        className={`transition-colors ${
                                                            isLogged
                                                                ? 'bg-emerald-500/5 opacity-60'
                                                                : selectedIndices.has(tx.index)
                                                                    ? 'bg-cyan-500/5'
                                                                    : 'hover:bg-slate-700/30'
                                                        }`}
                                                    >
                                                        {!isAllAccounts && (
                                                        <td className="px-4 py-3">
                                                            {isLogged ? (
                                                                <Check size={16} className="text-emerald-400" />
                                                            ) : (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIndices.has(tx.index)}
                                                                    onChange={() => toggleSelect(tx.index)}
                                                                    className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                                                                />
                                                            )}
                                                        </td>
                                                        )}
                                                        <td className="px-4 py-3 text-sm text-gray-300 font-mono whitespace-nowrap">
                                                            {formatDate(tx.date)}
                                                        </td>
                                                        <td className={`px-4 py-3 text-sm text-right font-mono font-medium whitespace-nowrap ${
                                                            tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'
                                                        }`}>
                                                            {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                                                tx.type === 'credit'
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                            }`}>
                                                                {tx.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-white max-w-[300px] truncate" title={tx.description}>
                                                            {tx.description}
                                                        </td>
                                                        {!isAllAccounts && (
                                                        <td className="px-4 py-3 text-right">
                                                            {isLogged ? (
                                                                <span className="text-xs text-emerald-400 font-medium">Logged ✓</span>
                                                            ) : (
                                                                <div className="flex items-center gap-1.5 justify-end">
                                                                    <button
                                                                        onClick={() => handleDismiss(tx.index)}
                                                                        title="Dismiss"
                                                                        className="p-1.5 bg-slate-700 hover:bg-red-600/80 text-gray-400 hover:text-white rounded-md transition-all"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRerunPreview(tx)}
                                                                        disabled={rerunLoadingIdx === tx.index}
                                                                        title="Rerun via AI"
                                                                        className="p-1.5 bg-slate-700 hover:bg-purple-600/80 text-gray-400 hover:text-white rounded-md transition-all disabled:opacity-50"
                                                                    >
                                                                        {rerunLoadingIdx === tx.index ? (
                                                                            <Loader2 size={12} className="animate-spin" />
                                                                        ) : (
                                                                            <Zap size={12} />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleLogSingle(tx)}
                                                                        disabled={isLogging}
                                                                        title="Log as-is"
                                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-cyan-600 text-gray-300 hover:text-white text-xs font-medium rounded-md transition-all disabled:opacity-50"
                                                                    >
                                                                        {isLogging ? (
                                                                            <Loader2 size={12} className="animate-spin" />
                                                                        ) : (
                                                                            <Plus size={12} />
                                                                        )}
                                                                        Log
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Matched Transactions Table */}
                    {reportTab === 'matched' && (
                        <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
                            {report.matched_transactions.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                                        <FileSearch size={32} className="text-gray-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-400">No matched transactions</h3>
                                    <p className="text-gray-500 text-sm mt-1">None of the bank statement transactions matched system records.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-900/50 sticky top-0">
                                            <tr className="text-xs text-gray-500 uppercase">
                                                <th className="text-left px-4 py-3">Bank Date</th>
                                                <th className="text-right px-4 py-3">Bank Amount</th>
                                                <th className="text-left px-4 py-3">Bank Description</th>
                                                <th className="text-center px-4 py-3 w-12">
                                                    <ArrowRight size={14} className="mx-auto text-emerald-400" />
                                                </th>
                                                <th className="text-left px-4 py-3">System Date</th>
                                                <th className="text-right px-4 py-3">System Amount</th>
                                                <th className="text-left px-4 py-3">System Merchant</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {report.matched_transactions.map((tx, i) => (
                                                <tr key={i} className="hover:bg-slate-700/30 transition-colors">
                                                    <td className="px-4 py-3 text-sm text-gray-300 font-mono whitespace-nowrap">
                                                        {formatDate(tx.bank_date)}
                                                    </td>
                                                    <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${
                                                        tx.bank_type === 'credit' ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                        {tx.bank_type === 'credit' ? '+' : '-'}{formatCurrency(tx.bank_amount)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-white max-w-[200px] truncate" title={tx.bank_description}>
                                                        {tx.bank_description}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <CheckCircle size={16} className="text-emerald-400 mx-auto" />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-300 font-mono whitespace-nowrap">
                                                        {formatDate(tx.system_date)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-300">
                                                        {formatCurrency(tx.system_amount)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate" title={tx.system_merchant}>
                                                        {tx.system_merchant || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* Rerun Preview Modal */}
            {rerunPreview && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelRerun}>
                    <div className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                    <Zap size={20} className="text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">AI Parse Preview</h3>
                                    <p className="text-xs text-gray-500">Review before confirming</p>
                                </div>
                            </div>
                            <button onClick={handleCancelRerun} className="p-2 hover:bg-slate-700 rounded-lg transition">
                                <X size={18} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Original SMS */}
                        <div className="p-5 border-b border-slate-700">
                            <p className="text-xs text-gray-500 uppercase font-medium mb-2">Original SMS Text</p>
                            <div className="bg-slate-900/60 rounded-xl p-3 text-sm text-gray-300 font-mono leading-relaxed whitespace-pre-wrap break-all">
                                {rerunPreview.tx.raw_line || rerunPreview.tx.description}
                            </div>
                        </div>

                        {/* Parsed result */}
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-gray-500 uppercase font-medium mb-2">AI-Parsed Result</p>

                            {!rerunPreview.preview.is_transaction && (
                                <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                    <span className="text-sm text-amber-400">AI determined this is not a transaction</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-900/40 rounded-xl p-3">
                                    <p className="text-[10px] text-gray-500 uppercase mb-1">Amount</p>
                                    <p className={`text-xl font-bold font-mono ${rerunPreview.preview.transaction_type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {rerunPreview.preview.transaction_type === 'credit' ? '+' : '-'}{formatCurrency(rerunPreview.preview.amount)}
                                    </p>
                                </div>
                                <div className="bg-slate-900/40 rounded-xl p-3">
                                    <p className="text-[10px] text-gray-500 uppercase mb-1">Type</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase border ${
                                        rerunPreview.preview.transaction_type === 'credit'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                        {rerunPreview.preview.transaction_type}
                                    </span>
                                    {rerunPreview.preview.sub_type && (
                                        <span className="ml-2 text-xs text-gray-500">{rerunPreview.preview.sub_type}</span>
                                    )}
                                </div>
                            </div>

                            {[
                                { label: 'Merchant', value: rerunPreview.preview.merchant },
                                { label: 'Brand', value: rerunPreview.preview.brand_name },
                                { label: 'Description', value: rerunPreview.preview.description },
                                { label: 'Category', value: rerunPreview.preview.category },
                                { label: 'Date/Time', value: rerunPreview.preview.timestamp },
                                { label: 'Source Bank', value: rerunPreview.preview.source_bank },
                                { label: 'Source Account', value: rerunPreview.preview.source_account_last4 ? `•${rerunPreview.preview.source_account_last4}` : null },
                                { label: 'Dest Account', value: rerunPreview.preview.destination_account_last4 ? `•${rerunPreview.preview.destination_account_last4}` : null },
                                { label: 'Beneficiary', value: rerunPreview.preview.beneficiary },
                                { label: 'Matched Account', value: rerunPreview.preview.resolved_account_name },
                            ].filter(f => f.value).map((field, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5 px-1 border-b border-slate-700/30 last:border-0">
                                    <span className="text-xs text-gray-500">{field.label}</span>
                                    <span className="text-sm text-white font-medium">{field.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 p-5 border-t border-slate-700">
                            <button
                                onClick={handleCancelRerun}
                                className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-gray-300 font-medium rounded-xl transition-all text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmRerun}
                                disabled={rerunPreview.confirming || !rerunPreview.preview.is_transaction || (!rerunPreview.preview.resolved_account_id && isAllAccounts)}
                                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                {rerunPreview.confirming ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Logging...
                                    </>
                                ) : (
                                    <>
                                        <Check size={14} />
                                        Confirm & Log
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
