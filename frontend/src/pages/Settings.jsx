import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Calendar, Tag, CheckCircle, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const Settings = () => {
    const [periodStartDay, setPeriodStartDay] = useState('1');
    const [periodLabel, setPeriodLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get(`${API_URL}/settings`);
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
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await axios.put(`${API_URL}/settings/period_start_day`, {
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

    // Compute example period for preview
    const startDay = parseInt(periodStartDay) || 1;
    const getExamplePeriod = () => {
        if (startDay === 1) return 'Mar 1 → Mar 31 (standard calendar month)';
        return `Feb ${startDay} → Mar ${startDay - 1}`;
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

            {/* Obligation Period Section */}
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
