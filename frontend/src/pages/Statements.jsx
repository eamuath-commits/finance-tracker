import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { FileUp, FileText, AlertTriangle, Trash2, CheckCircle2, Clock, XCircle, Loader2, Upload, Eye, ArrowLeft, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCw } from 'lucide-react';

const Statements = () => {
    const [statements, setStatements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [error, setError] = useState(null);
    // Detail view state
    const [selectedStatement, setSelectedStatement] = useState(null);
    const [statementDetail, setStatementDetail] = useState(null);
    const [parsedTransactions, setParsedTransactions] = useState([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

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
            // If parsing succeeded, auto-open the detail view
            if (res.data.transaction_count > 0) {
                openStatementDetail(res.data.id);
            }
        } catch (err) {
            const detail = err.response?.data?.detail || 'Upload failed';
            setError(detail);
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
            console.error('Failed to load statement detail:', err);
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
            // Refresh detail
            const detailRes = await api.get(`/api/statements/${selectedStatement}`);
            setStatementDetail(detailRes.data);
            fetchStatements();
        } catch (err) {
            setError(err.response?.data?.detail || 'Re-parse failed');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileUpload(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleFileInput = (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
        e.target.value = '';
    };

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
        return new Intl.NumberFormat('en-SA', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
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
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    const getPdfTypeBadge = (type) => {
        if (type === 'text') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><FileText size={10} />Text</span>;
        }
        if (type === 'scanned') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20"><AlertTriangle size={10} />Scanned</span>;
        }
        return <span className="text-xs text-gray-500">Unknown</span>;
    };

    // ─────────────── DETAIL VIEW ───────────────
    if (selectedStatement) {
        return (
            <div className="space-y-6">
                {/* Back + Header */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => { setSelectedStatement(null); setStatementDetail(null); setParsedTransactions([]); }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-white">
                            {statementDetail?.original_filename || 'Statement'}
                        </h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {statementDetail?.bank_name} • Account: {statementDetail?.account_number || '—'}
                        </p>
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

                {/* Error */}
                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
                        <p className="text-red-300 text-sm">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-gray-500 hover:text-gray-300"><XCircle size={16} /></button>
                    </div>
                )}

                {/* Summary Cards */}
                {statementDetail && (() => {
                    const totalDebits = parsedTransactions.reduce((sum, tx) => sum + (tx.debit_amount || 0), 0);
                    const totalCredits = parsedTransactions.reduce((sum, tx) => sum + (tx.credit_amount || 0), 0);
                    return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-xs text-gray-500 mb-1">Period</p>
                            <p className="text-sm text-white font-medium">
                                {statementDetail.statement_period_start || '—'}<br/>
                                to {statementDetail.statement_period_end || '—'}
                            </p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-xs text-gray-500 mb-1">Opening Balance</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.opening_balance)} <span className="text-xs text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-xs text-gray-500 mb-1">Closing Balance</p>
                            <p className="text-lg text-white font-semibold">{formatAmount(statementDetail.closing_balance)} <span className="text-xs text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-red-500/10 p-4">
                            <p className="text-xs text-gray-500 mb-1">Total Debits</p>
                            <p className="text-lg text-red-400 font-semibold">{formatAmount(totalDebits)} <span className="text-xs text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-green-500/10 p-4">
                            <p className="text-xs text-gray-500 mb-1">Total Credits</p>
                            <p className="text-lg text-green-400 font-semibold">{formatAmount(totalCredits)} <span className="text-xs text-gray-500">SAR</span></p>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                            <p className="text-xs text-gray-500 mb-1">Transactions</p>
                            <p className="text-lg text-white font-semibold">{parsedTransactions.length}</p>
                        </div>
                    </div>
                    );
                })()}

                {/* Parsed Transactions Table */}
                {loadingDetail ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={32} className="text-blue-400 animate-spin" />
                    </div>
                ) : parsedTransactions.length > 0 ? (
                    <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-white font-medium">Parsed Transactions ({parsedTransactions.length})</h3>
                            <span className="text-xs text-gray-500">Print order preserved</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-slate-800">
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
                                    {parsedTransactions.map((tx, idx) => (
                                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                                            <td className="px-4 py-2.5 text-gray-600 text-xs">{tx.row_index + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-300 font-mono text-xs whitespace-nowrap">{tx.transaction_date || '—'}</td>
                                            <td className="px-4 py-2.5 text-gray-400 font-mono text-xs whitespace-nowrap">{tx.transaction_time || '—'}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-gray-400 text-xs leading-tight block max-w-[200px] truncate" title={tx.type_line}>
                                                    {tx.type_line || '—'}
                                                </span>
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
                                                {tx.debit_amount > 0 ? (
                                                    <span className="text-red-400">{formatAmount(tx.debit_amount)}</span>
                                                ) : (
                                                    <span className="text-gray-700">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                                                {tx.credit_amount > 0 ? (
                                                    <span className="text-green-400">{formatAmount(tx.credit_amount)}</span>
                                                ) : (
                                                    <span className="text-gray-700">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300 whitespace-nowrap">
                                                {formatAmount(tx.balance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Import Statements</h1>
                <p className="text-gray-400 mt-1">Upload bank statement PDFs to import transactions</p>
            </div>

            {/* Upload Area */}
            <div
                id="statement-upload-zone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 p-10 text-center cursor-pointer group ${
                    dragActive
                        ? 'border-blue-500 bg-blue-500/5 scale-[1.01]'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-900/50 hover:bg-slate-900/80'
                }`}
                onClick={() => document.getElementById('pdf-file-input').click()}
            >
                <input
                    id="pdf-file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileInput}
                />
                
                {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 size={48} className="text-blue-400 animate-spin" />
                        <p className="text-gray-300 font-medium">Uploading & parsing PDF...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${
                            dragActive ? 'bg-blue-500/20' : 'bg-slate-800 group-hover:bg-slate-700'
                        }`}>
                            <Upload size={36} className={`transition-colors ${
                                dragActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'
                            }`} />
                        </div>
                        <div>
                            <p className="text-gray-200 font-semibold text-lg">Drop a PDF here or click to browse</p>
                            <p className="text-gray-500 text-sm mt-1">Supports Al Rajhi bank statement PDFs</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload Result */}
            {uploadResult && (
                <div className={`rounded-xl border p-5 ${
                    uploadResult.warning
                        ? 'bg-amber-500/5 border-amber-500/20'
                        : 'bg-emerald-500/5 border-emerald-500/20'
                }`}>
                    <div className="flex items-start gap-3">
                        {uploadResult.warning ? (
                            <AlertTriangle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        ) : (
                            <CheckCircle2 size={20} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                            <p className={`font-medium ${uploadResult.warning ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {uploadResult.warning || uploadResult.message}
                            </p>
                            <div className="mt-2 space-y-1 text-sm text-gray-400">
                                <p>File: <span className="text-gray-300">{uploadResult.original_filename}</span></p>
                                {uploadResult.account_number && (
                                    <p>Account: <span className="text-gray-300">{uploadResult.account_number}</span></p>
                                )}
                                {uploadResult.transaction_count > 0 && (
                                    <p>Transactions parsed: <span className="text-emerald-400 font-medium">{uploadResult.transaction_count}</span></p>
                                )}
                                {uploadResult.period_start && uploadResult.period_end && (
                                    <p>Period: <span className="text-gray-300">{uploadResult.period_start} → {uploadResult.period_end}</span></p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => setUploadResult(null)}
                            className="text-gray-500 hover:text-gray-300"
                        >
                            <XCircle size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
                    <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-sm">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-gray-500 hover:text-gray-300">
                        <XCircle size={16} />
                    </button>
                </div>
            )}

            {/* Statements List */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">Imported Statements</h2>
                
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={32} className="text-blue-400 animate-spin" />
                    </div>
                ) : statements.length === 0 ? (
                    <div className="text-center py-16 bg-slate-900/50 rounded-2xl border border-slate-800">
                        <FileUp size={48} className="text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 text-lg">No statements imported yet</p>
                        <p className="text-gray-500 text-sm mt-1">Upload a PDF to get started</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {statements.map((s) => (
                            <div
                                key={s.id}
                                onClick={() => openStatementDetail(s.id)}
                                className="bg-slate-900/80 rounded-xl border border-slate-800 p-5 hover:border-blue-500/30 hover:bg-slate-900 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                                            <FileText size={20} className="text-blue-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-white font-medium truncate">{s.original_filename}</p>
                                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                <span className="text-xs text-gray-500">{s.bank_name || 'Unknown Bank'}</span>
                                                {s.account_number && (
                                                    <span className="text-xs text-gray-500">Acc: ****{s.account_number.slice(-4)}</span>
                                                )}
                                                {s.statement_period_start && s.statement_period_end && (
                                                    <span className="text-xs text-gray-500">
                                                        {s.statement_period_start} → {s.statement_period_end}
                                                    </span>
                                                )}
                                                {s.transaction_count > 0 && (
                                                    <span className="text-xs text-emerald-400 font-medium">{s.transaction_count} transactions</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                        {getPdfTypeBadge(s.pdf_type)}
                                        {getStatusBadge(s.status)}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <ChevronRight size={18} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                </div>
                                {s.imported_at && (
                                    <p className="text-[10px] text-gray-600 mt-3">
                                        Imported {new Date(s.imported_at).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Statements;
