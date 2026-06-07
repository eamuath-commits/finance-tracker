import React, { useState, useEffect } from 'react';
import api, { API_URL } from '../utils/api';
import { Settings as SettingsIcon, Save, Calendar, Tag, CheckCircle, Loader2, Building2, Link2, Unlink, RefreshCw, Shield, Clock, AlertCircle, ExternalLink } from 'lucide-react';


const Settings = () => {
    const [periodStartDay, setPeriodStartDay] = useState('1');
    const [periodLabel, setPeriodLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    // Bank connection state
    const [bankStatus, setBankStatus] = useState(null);
    const [bankLoading, setBankLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [bankError, setBankError] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get(`${API_URL}/settings`);
                const psd = res.data?.period_start_day;
                if (psd) {
                    setPeriodStartDay(psd.value || '1');
                    setPeriodLabel(psd.label || '');
                }
            } catch (e) {
                console.error('Failed to load settings', e);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
        fetchBankStatus();

        // Check URL for bank connection result
        const params = new URLSearchParams(window.location.search);
        if (params.get('bank_connected') === 'true') {
            fetchBankStatus();
            // Clean URL
            window.history.replaceState({}, '', '/settings');
        }
        if (params.get('bank_error')) {
            setBankError(decodeURIComponent(params.get('bank_error')));
            window.history.replaceState({}, '', '/settings');
        }
    }, []);

    const fetchBankStatus = async () => {
        setBankLoading(true);
        try {
            const res = await api.get(`${API_URL}/api/bank/alrajhi/status`);
            setBankStatus(res.data);
        } catch (e) {
            console.error('Failed to fetch bank status', e);
            setBankStatus(null);
        } finally {
            setBankLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await api.put(`${API_URL}/settings/period_start_day`, {
                value: String(Math.min(28, Math.max(1, parseInt(periodStartDay) || 1))),
                label: periodLabel,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async () => {
        setConnecting(true);
        setBankError('');
        try {
            const res = await api.post(`${API_URL}/api/bank/alrajhi/consent`);
            const { authorization_url } = res.data;
            if (authorization_url) {
                window.location.href = authorization_url;
            } else {
                setBankError('Failed to get authorization URL');
            }
        } catch (e) {
            setBankError(e.response?.data?.detail || 'Failed to initiate bank connection');
            setConnecting(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        setBankError('');
        try {
            const res = await api.post(`${API_URL}/api/bank/alrajhi/sync`);
            setSyncResult(res.data);
            await fetchBankStatus(); // Refresh status after sync
        } catch (e) {
            setBankError(e.response?.data?.detail || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Are you sure you want to disconnect your Al Rajhi account? This will revoke access.')) return;
        setDisconnecting(true);
        setBankError('');
        try {
            await api.delete(`${API_URL}/api/bank/alrajhi/connection`);
            setBankStatus(null);
            setSyncResult(null);
            await fetchBankStatus();
        } catch (e) {
            setBankError(e.response?.data?.detail || 'Failed to disconnect');
        } finally {
            setDisconnecting(false);
        }
    };

    // Compute example period for preview
    const startDay = parseInt(periodStartDay) || 1;
    const getExamplePeriod = () => {
        if (startDay === 1) return 'Mar 1 → Mar 31 (standard calendar month)';
        return `Feb ${startDay} → Mar ${startDay - 1}`;
    };

    const isConnected = bankStatus?.connected === true;
    const isTokenValid = bankStatus?.token_valid === true;

    const formatDate = (iso) => {
        if (!iso) return 'Never';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <SettingsIcon size={28} className="text-blue-400" />
                    Settings
                </h1>
                <p className="text-slate-400 mt-1">Configure your finance tracker preferences</p>
            </div>

            {/* ====== BANK CONNECTIONS SECTION ====== */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg mb-6">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-700/40 bg-slate-800/40">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                            <Building2 size={16} className="text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-sm">Bank Connections</h2>
                            <p className="text-slate-500 text-xs">Link your bank accounts via Open Banking</p>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {/* Error Banner */}
                    {bankError && (
                        <div className="mb-4 flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-red-300 text-sm font-medium">Connection Error</p>
                                <p className="text-red-400/80 text-xs mt-0.5">{bankError}</p>
                            </div>
                            <button
                                onClick={() => setBankError('')}
                                className="ml-auto text-red-400 hover:text-red-300 text-xs"
                            >✕</button>
                        </div>
                    )}

                    {bankLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={24} className="animate-spin text-slate-500" />
                        </div>
                    ) : isConnected ? (
                        /* ---- CONNECTED STATE ---- */
                        <div className="space-y-4">
                            {/* Status Card */}
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-emerald-300 text-sm font-semibold">Al Rajhi Bank Connected</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Shield size={12} className={isTokenValid ? 'text-emerald-400' : 'text-amber-400'} />
                                        <span className={`text-xs font-medium ${isTokenValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {isTokenValid ? 'Token Active' : 'Token Expired'}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Linked Since</p>
                                        <p className="text-slate-300 text-xs font-mono mt-0.5">{formatDate(bankStatus.linked_at)}</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Last Synced</p>
                                        <p className="text-slate-300 text-xs font-mono mt-0.5">{formatDate(bankStatus.last_synced)}</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Accounts</p>
                                        <p className="text-slate-300 text-xs font-mono mt-0.5">{bankStatus.accounts_linked || 0} linked</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Token Expires</p>
                                        <p className="text-slate-300 text-xs font-mono mt-0.5">{formatDate(bankStatus.token_expires)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Linked Accounts List */}
                            {bankStatus.accounts && bankStatus.accounts.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
                                        <Link2 size={12} />
                                        Linked Accounts
                                    </p>
                                    <div className="space-y-2">
                                        {bankStatus.accounts.map((acc) => (
                                            <div key={acc.id} className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-white text-sm font-medium">{acc.name || 'Al Rajhi Account'}</p>
                                                    <p className="text-slate-500 text-xs font-mono">
                                                        {acc.iban ? `IBAN: ...${acc.iban.slice(-8)}` : acc.type}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={10} className="text-slate-500" />
                                                    <span className="text-slate-500 text-[10px]">{formatDate(acc.last_synced)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Sync Result */}
                            {syncResult && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                                    <p className="text-blue-300 text-sm font-semibold mb-2">Last Sync Results</p>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <p className="text-lg font-bold text-white">{syncResult.accounts_found}</p>
                                            <p className="text-[10px] text-slate-400">Accounts</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-emerald-400">{syncResult.transactions_created}</p>
                                            <p className="text-[10px] text-slate-400">New Txns</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-slate-400">{syncResult.transactions_skipped}</p>
                                            <p className="text-[10px] text-slate-400">Skipped</p>
                                        </div>
                                    </div>
                                    {syncResult.errors && syncResult.errors.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-blue-500/20">
                                            {syncResult.errors.map((err, i) => (
                                                <p key={i} className="text-amber-400 text-xs">⚠ {err}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition"
                                >
                                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                    {syncing ? 'Syncing...' : 'Sync Now'}
                                </button>
                                <button
                                    onClick={handleDisconnect}
                                    disabled={disconnecting}
                                    className="flex items-center justify-center gap-2 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 font-semibold text-sm px-4 py-2.5 rounded-xl transition"
                                >
                                    {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ---- NOT CONNECTED STATE ---- */
                        <div className="text-center py-4">
                            <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 border border-slate-700/50 rounded-2xl flex items-center justify-center">
                                <Building2 size={28} className="text-slate-500" />
                            </div>
                            <h3 className="text-white text-lg font-semibold mb-1">Connect Al Rajhi Bank</h3>
                            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
                                Link your Al Rajhi bank account to automatically sync transactions, balances, and account details via Open Banking.
                            </p>

                            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mb-6 text-left">
                                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2.5">What you'll get</p>
                                <div className="space-y-2">
                                    {[
                                        'Automatic transaction import',
                                        'Real-time balance updates',
                                        'Account information sync',
                                        'Secure SAMA-regulated connection',
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                                            <span className="text-slate-300 text-sm">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleConnect}
                                disabled={connecting}
                                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-emerald-600/50 disabled:to-emerald-500/50 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                            >
                                {connecting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <ExternalLink size={16} />
                                        Connect Al Rajhi Account
                                    </>
                                )}
                            </button>

                            <p className="text-slate-600 text-[10px] mt-3">
                                You'll be redirected to Al Rajhi Bank to authorize access
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ====== OBLIGATION PERIOD SECTION ====== */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg">
                {/* Section Header */}
                <div className="px-6 py-4 border-b border-slate-700/40 bg-slate-800/40">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                            <Calendar size={16} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-sm">Obligation Period</h2>
                            <p className="text-slate-500 text-xs">Define when your financial month starts</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Period Start Day */}
                    <div>
                        <label className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">
                            <Calendar size={12} />
                            Period Start Day
                        </label>
                        <p className="text-slate-500 text-xs mb-3">
                            The day of the month when your obligation period begins. Most users set this to their salary day.
                        </p>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="1"
                                max="28"
                                value={periodStartDay}
                                onChange={(e) => setPeriodStartDay(e.target.value)}
                                className="w-24 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-center text-lg font-bold font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                            />
                            <span className="text-slate-500 text-sm">of each month</span>
                        </div>

                        {/* Live Preview */}
                        <div className="mt-4 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3">
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Example: "March" obligation period</p>
                            <p className="text-blue-300 text-sm font-mono font-medium">{getExamplePeriod()}</p>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-700/30" />

                    {/* Label */}
                    <div>
                        <label className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">
                            <Tag size={12} />
                            Period Label (Optional)
                        </label>
                        <p className="text-slate-500 text-xs mb-3">
                            A custom name for your period — e.g., "Salary Day", "Pay Day", "Budget Cycle Start"
                        </p>
                        <input
                            type="text"
                            value={periodLabel}
                            onChange={(e) => setPeriodLabel(e.target.value)}
                            placeholder="e.g., Salary Day"
                            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition placeholder-slate-600"
                        />
                    </div>
                </div>

                {/* Save Button */}
                <div className="px-6 py-4 border-t border-slate-700/40 bg-slate-800/30 flex items-center justify-between">
                    <div>
                        {saved && (
                            <div className="flex items-center gap-1.5 text-emerald-400 text-sm animate-fade-in">
                                <CheckCircle size={14} />
                                <span className="font-medium">Settings saved</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Settings;
