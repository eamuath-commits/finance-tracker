import React, { useState } from 'react';
import { Key, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import api, { API_URL } from '../utils/api';

const ChangePassword = () => {
    const [form, setForm] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);

        if (form.new_password !== form.confirm_password) {
            setStatus({ type: 'error', message: 'New passwords do not match' });
            return;
        }
        if (form.new_password.length < 6) {
            setStatus({ type: 'error', message: 'Password must be at least 6 characters' });
            return;
        }

        setLoading(true);
        try {
            await api.put(`${API_URL}/auth/me/password`, {
                current_password: form.current_password,
                new_password: form.new_password
            });
            setStatus({ type: 'success', message: 'Password changed successfully' });
            setForm({ current_password: '', new_password: '', confirm_password: '' });
        } catch (err) {
            const msg = err.response?.data?.detail || 'Failed to change password';
            setStatus({ type: 'error', message: msg });
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all";

    return (
        <div className="max-w-lg mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">Change Password</h1>

            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Current Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Current Password</label>
                        <div className="relative">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                value={form.current_password}
                                onChange={(e) => setForm({...form, current_password: e.target.value})}
                                className={inputClass}
                                placeholder="Enter current password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent(!showCurrent)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                            >
                                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* New Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                value={form.new_password}
                                onChange={(e) => setForm({...form, new_password: e.target.value})}
                                className={inputClass}
                                placeholder="Enter new password"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                            >
                                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                        <input
                            type="password"
                            value={form.confirm_password}
                            onChange={(e) => setForm({...form, confirm_password: e.target.value})}
                            className={inputClass}
                            placeholder="Re-enter new password"
                            required
                        />
                    </div>

                    {/* Status Message */}
                    {status && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                            status.type === 'success' 
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                            {status.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                            {status.message}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Key size={18} />
                        {loading ? 'Changing...' : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePassword;
