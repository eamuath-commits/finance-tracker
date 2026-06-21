import React, { useState, useEffect } from 'react';
import api, { API_URL } from '../utils/api';
import {
    ClipboardCheck,
    CheckCircle,
    AlertTriangle,
    XCircle,
    ArrowRight,
    Clock,
    RefreshCw,
    Search,
    AlertCircle
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—';
    const absAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('en-SA', {
        style: 'currency',
        currency: 'SAR',
        minimumFractionDigits: 2
    }).format(absAmount);
    return amount < 0 ? `-${formatted}` : formatted;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatRelativeTime = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
};

export default function Audit() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [actualBalance, setActualBalance] = useState('');
    const [auditResult, setAuditResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState(null);
    const [auditHistory, setAuditHistory] = useState([]);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            const res = await api.get(`${API}/accounts`);
            setAccounts(res.data);
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        }
    };

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    const handleCheck = async () => {
        if (!selectedAccountId || actualBalance === '') return;

        setLoading(true);
        setError(null);
        setAuditResult(null);

        try {
            const res = await api.post(`${API}/audit/check`, {
                account_id: selectedAccountId,
                actual_balance: parseFloat(actualBalance)
            });
            setAuditResult(res.data);

            // Fetch audit history
            const historyRes = await api.get(`${API}/audit/history/${selectedAccountId}`);
            setAuditHistory(historyRes.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to check audit');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async (forceConfirm = false) => {
        if (!selectedAccountId || actualBalance === '') return;

        if (forceConfirm && !notes.trim()) {
            setError('Please provide notes explaining the discrepancy');
            return;
        }

        setConfirming(true);
        setError(null);

        try {
            await api.post(`${API}/audit/confirm`, {
                account_id: selectedAccountId,
                actual_balance: parseFloat(actualBalance),
                notes: notes.trim() || null,
                force_confirm: forceConfirm
            });

            // Reset and show success
            setAuditResult(null);
            setActualBalance('');
            setNotes('');
            setSelectedAccountId('');

            // Refresh accounts to get updated last_successful_audit_date
            fetchAccounts();

            alert('Audit confirmed successfully!');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to confirm audit');
        } finally {
            setConfirming(false);
        }
    };

    const resetAudit = () => {
        setAuditResult(null);
        setActualBalance('');
        setNotes('');
        setError(null);
    };

    const inputClass = "w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-white placeholder-gray-500 transition-all";
    const selectClass = "w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-white";

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <ClipboardCheck className="text-white" size={28} />
                </div>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Balance Audit</h1>
                    <p className="text-gray-400">Verify system balance against your actual bank balance</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Audit Form */}
                <div className="space-y-6">
                    {/* Step 1: Select Account */}
                    <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold">1</span>
                            <h2 className="text-lg font-semibold text-white">Select Account</h2>
                        </div>

                        <select
                            value={selectedAccountId}
                            onChange={(e) => {
                                setSelectedAccountId(e.target.value);
                                resetAudit();
                            }}
                            className={selectClass}
                        >
                            <option value="">Choose an account...</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name} {acc.last_4_digits ? `(****${acc.last_4_digits})` : ''}
                                </option>
                            ))}
                        </select>

                        {selectedAccount && (
                            <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-400">System Balance</span>
                                    <span className="text-xl font-bold text-white font-mono">
                                        {formatCurrency(selectedAccount.current_balance)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <Clock size={12} />
                                    Last Audit: {selectedAccount.last_successful_audit_date
                                        ? `${formatDate(selectedAccount.last_successful_audit_date)} (${formatRelativeTime(selectedAccount.last_successful_audit_date)})`
                                        : 'Never'
                                    }
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Step 2: Enter Actual Balance */}
                    <div className={`bg-slate-800/40 rounded-2xl p-6 border border-slate-700 transition-opacity ${!selectedAccountId ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold">2</span>
                            <h2 className="text-lg font-semibold text-white">Enter Actual Balance</h2>
                        </div>

                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-mono">SAR</span>
                            <input
                                type="number"
                                step="0.01"
                                value={actualBalance}
                                onChange={(e) => setActualBalance(e.target.value)}
                                placeholder="Enter balance from bank app/statement"
                                className={`${inputClass} pl-14 font-mono text-lg`}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Enter the exact balance shown in your bank app or statement
                        </p>
                    </div>

                    {/* Step 3: Check Button */}
                    <button
                        onClick={handleCheck}
                        disabled={!selectedAccountId || actualBalance === '' || loading}
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {loading ? (
                            <>
                                <RefreshCw size={20} className="animate-spin" />
                                Checking...
                            </>
                        ) : (
                            <>
                                <Search size={20} />
                                Check Balance
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                            <AlertCircle size={18} />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                </div>

                {/* Right: Results */}
                <div className="space-y-6">
                    {!auditResult ? (
                        <div className="bg-slate-800/40 rounded-2xl p-12 border border-slate-700 text-center">
                            <div className="w-20 h-20 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                                <ClipboardCheck size={40} className="text-gray-500" />
                            </div>
                            <p className="text-gray-400">Select an account and enter the actual balance to begin audit</p>
                        </div>
                    ) : auditResult.is_match ? (
                        /* MATCH STATE */
                        <div className="bg-emerald-500/10 rounded-2xl p-8 border border-emerald-500/30">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle size={36} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-emerald-400">Balance Match!</h3>
                                    <p className="text-emerald-400/80">System and actual balances are in sync</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <div className="bg-slate-900/50 rounded-xl p-4">
                                    <span className="text-xs text-gray-500 block mb-1">System Balance</span>
                                    <span className="text-lg font-bold text-white font-mono">{formatCurrency(auditResult.system_balance)}</span>
                                </div>
                                <div className="bg-slate-900/50 rounded-xl p-4">
                                    <span className="text-xs text-gray-500 block mb-1">Actual Balance</span>
                                    <span className="text-lg font-bold text-emerald-400 font-mono">{formatCurrency(auditResult.actual_balance)}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleConfirm(false)}
                                disabled={confirming}
                                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {confirming ? (
                                    <>
                                        <RefreshCw size={20} className="animate-spin" />
                                        Confirming...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={20} />
                                        Confirm Audit
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* MISMATCH STATE */
                        <div className="space-y-6">
                            <div className="bg-red-500/10 rounded-2xl p-8 border border-red-500/30">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <XCircle size={36} className="text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-red-400">Balance Mismatch</h3>
                                        <p className="text-red-400/80">Discrepancy detected - review transactions below</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-slate-900/50 rounded-xl p-4">
                                        <span className="text-xs text-gray-500 block mb-1">System</span>
                                        <span className="text-lg font-bold text-white font-mono">{formatCurrency(auditResult.system_balance)}</span>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-xl p-4">
                                        <span className="text-xs text-gray-500 block mb-1">Actual</span>
                                        <span className="text-lg font-bold text-red-400 font-mono">{formatCurrency(auditResult.actual_balance)}</span>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-xl p-4">
                                        <span className="text-xs text-gray-500 block mb-1">Difference</span>
                                        <span className={`text-lg font-bold font-mono ${auditResult.discrepancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {auditResult.discrepancy > 0 ? '+' : ''}{formatCurrency(auditResult.discrepancy)}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 mb-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                        <div className="text-sm text-amber-400/90">
                                            <strong>Possible causes:</strong> Missing SMS transaction, manual transaction not recorded,
                                            bank fee not tracked, or pending transaction not yet settled.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Transactions Since Last Audit */}
                            <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-700">
                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        <Clock size={16} className="text-gray-400" />
                                        Transactions Since Last Audit
                                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-gray-400">
                                            {auditResult.transactions_since_audit?.length || 0}
                                        </span>
                                    </h3>
                                    {auditResult.last_audit_date && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Since {formatDate(auditResult.last_audit_date)}
                                        </p>
                                    )}
                                </div>

                                <div className="max-h-72 overflow-y-auto">
                                    {auditResult.transactions_since_audit?.length > 0 ? (
                                        <table className="w-full">
                                            <thead className="bg-slate-900/50 sticky top-0">
                                                <tr className="text-xs text-gray-500 uppercase">
                                                    <th className="text-left px-4 py-2">Date</th>
                                                    <th className="text-left px-4 py-2">Description</th>
                                                    <th className="text-right px-4 py-2">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {auditResult.transactions_since_audit.map(tx => (
                                                    <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                                                        <td className="px-4 py-3 text-sm text-gray-400">
                                                            {formatDate(tx.timestamp)}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-white">
                                                            {tx.merchant || tx.category || 'Transaction'}
                                                        </td>
                                                        <td className={`px-4 py-3 text-sm text-right font-mono ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="p-8 text-center text-gray-500">
                                            <p>No transactions found since last audit</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Force Confirm */}
                            <div className="bg-slate-800/40 rounded-2xl p-6 border border-slate-700">
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-amber-500" />
                                    Force Confirm Mismatch
                                </h3>
                                <p className="text-sm text-gray-400 mb-4">
                                    If you've reviewed the transactions and want to proceed anyway,
                                    provide a note explaining the discrepancy.
                                </p>

                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="e.g., Bank fee not tracked, will add manually..."
                                    className={`${inputClass} h-24 resize-none mb-4`}
                                />

                                <button
                                    onClick={() => handleConfirm(true)}
                                    disabled={confirming || !notes.trim()}
                                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {confirming ? (
                                        <>
                                            <RefreshCw size={18} className="animate-spin" />
                                            Confirming...
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle size={18} />
                                            Force Confirm with Note
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Audit History */}
                    {auditHistory.length > 0 && (
                        <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-700">
                                <h3 className="font-semibold text-white">Audit History</h3>
                            </div>
                            <div className="divide-y divide-slate-700/50">
                                {auditHistory.slice(0, 5).map(audit => (
                                    <div key={audit.id} className="px-6 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {audit.status === 'MATCH' ? (
                                                <CheckCircle size={16} className="text-emerald-400" />
                                            ) : (
                                                <AlertTriangle size={16} className="text-amber-500" />
                                            )}
                                            <div>
                                                <span className="text-sm text-white">{formatDate(audit.audit_date)}</span>
                                                {audit.notes && (
                                                    <p className="text-xs text-gray-500 truncate max-w-[200px]">{audit.notes}</p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-xs font-semibold px-2 py-1 rounded ${audit.status === 'MATCH'
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'bg-amber-500/20 text-amber-400'
                                            }`}>
                                            {audit.status === 'MATCH' ? 'Matched' : `${formatCurrency(audit.difference)}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
