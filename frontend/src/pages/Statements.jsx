import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { FileUp, FileText, AlertTriangle, Trash2, CheckCircle2, Clock, XCircle, Loader2, Upload, Eye } from 'lucide-react';

const Statements = () => {
    const [statements, setStatements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [error, setError] = useState(null);

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
            fetchStatements(); // Refresh list
        } catch (err) {
            const detail = err.response?.data?.detail || 'Upload failed';
            setError(detail);
        } finally {
            setUploading(false);
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
        // Reset input so same file can be re-uploaded
        e.target.value = '';
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this statement and all its draft transactions?')) return;
        try {
            await api.delete(`/api/statements/${id}`);
            fetchStatements();
        } catch (err) {
            const detail = err.response?.data?.detail || 'Delete failed';
            setError(detail);
        }
    };

    const handleViewPdf = (id) => {
        // Open PDF in new tab
        const token = localStorage.getItem('auth_token');
        window.open(`${api.defaults.baseURL}/api/statements/${id}/pdf`, '_blank');
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

    const getReconciliationBadge = (status) => {
        const configs = {
            pending: { color: 'text-gray-400', icon: Clock, label: 'Pending' },
            reconciled: { color: 'text-green-400', icon: CheckCircle2, label: 'Reconciled ✓' },
            flagged: { color: 'text-amber-400', icon: AlertTriangle, label: 'Flagged ⚠' },
        };
        const config = configs[status] || configs.pending;
        const Icon = config.icon;
        return (
            <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    const getPdfTypeBadge = (type) => {
        if (type === 'text') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><FileText size={10} />Text PDF</span>;
        }
        if (type === 'scanned') {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20"><AlertTriangle size={10} />Scanned</span>;
        }
        return <span className="text-xs text-gray-500">Unknown</span>;
    };

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
                        <p className="text-gray-300 font-medium">Uploading & analyzing PDF...</p>
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
                        <div>
                            <p className={`font-medium ${uploadResult.warning ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {uploadResult.warning || uploadResult.message}
                            </p>
                            <div className="mt-2 space-y-1 text-sm text-gray-400">
                                <p>File: <span className="text-gray-300">{uploadResult.original_filename}</span></p>
                                <p>Type: {getPdfTypeBadge(uploadResult.pdf_type)}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setUploadResult(null)}
                            className="ml-auto text-gray-500 hover:text-gray-300"
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
                                className="bg-slate-900/80 rounded-xl border border-slate-800 p-5 hover:border-slate-700 transition-colors"
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
                                                    <span className="text-xs text-gray-500">{s.transaction_count} transactions</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                        {getPdfTypeBadge(s.pdf_type)}
                                        {getReconciliationBadge(s.reconciliation_status)}
                                        {getStatusBadge(s.status)}
                                        <button
                                            onClick={() => handleViewPdf(s.id)}
                                            className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                                            title="View PDF"
                                        >
                                            <Eye size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(s.id)}
                                            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
