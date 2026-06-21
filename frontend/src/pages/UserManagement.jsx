import React, { useState, useEffect, useCallback } from 'react';
import api, { authUtils } from '../utils/api';
import { Users, Shield, ShieldOff, KeyRound, Trash2, UserPlus, X, Eye, EyeOff } from 'lucide-react';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Reset password modal
    const [resetModal, setResetModal] = useState(null); // user object or null
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Add user modal
    const [showAddUser, setShowAddUser] = useState(false);
    const [addForm, setAddForm] = useState({ username: '', email: '', password: '' });
    const [addLoading, setAddLoading] = useState(false);

    const currentUser = authUtils.getUser();
    const isAdmin = currentUser?.username === 'admin';

    const fetchUsers = useCallback(async () => {
        try {
            const res = await api.get('/auth/users');
            setUsers(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const clearMessages = () => { setError(''); setSuccess(''); };

    const handleToggleActive = async (user) => {
        clearMessages();
        try {
            await api.put(`/auth/users/${user.id}`, { is_active: !user.is_active });
            setSuccess(`User '${user.username}' ${user.is_active ? 'deactivated' : 'activated'}`);
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update user');
        }
    };

    const handleResetPassword = async () => {
        clearMessages();
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        try {
            await api.post(`/auth/users/${resetModal.id}/reset-password`, { new_password: newPassword });
            setSuccess(`Password reset for '${resetModal.username}'`);
            setResetModal(null);
            setNewPassword('');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to reset password');
        }
    };

    const handleDeleteUser = async (user) => {
        clearMessages();
        if (!window.confirm(`Are you sure you want to delete '${user.username}'? This action cannot be undone.`)) return;
        try {
            await api.delete(`/auth/users/${user.id}`);
            setSuccess(`User '${user.username}' deleted`);
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete user');
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        clearMessages();
        setAddLoading(true);
        try {
            await api.post('/auth/register', {
                username: addForm.username,
                email: addForm.email || null,
                password: addForm.password,
            });
            setSuccess(`User '${addForm.username}' created`);
            setShowAddUser(false);
            setAddForm({ username: '', email: '', password: '' });
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create user');
        } finally {
            setAddLoading(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="p-6">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                    <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <h2 className="text-xl font-semibold text-red-400">Access Denied</h2>
                    <p className="text-slate-400 mt-2">Only admin users can access user management.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Users className="w-7 h-7 text-indigo-400" />
                        User Management
                    </h1>
                    <p className="text-slate-400 mt-1">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => { clearMessages(); setShowAddUser(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors font-medium"
                >
                    <UserPlus size={18} />
                    Add User
                </button>
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                    {success}
                </div>
            )}

            {/* Users Table */}
            {loading ? (
                <div className="text-center py-12 text-slate-400">Loading users...</div>
            ) : (
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-x-auto mobile-scroll">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-800/50">
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id} className="border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                                                user.username === 'admin'
                                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                                                    : 'bg-slate-700 text-slate-300'
                                            }`}>
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <span className="text-white font-medium">{user.username}</span>
                                                {user.username === 'admin' && (
                                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold uppercase">Admin</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">{user.email || '—'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                            user.is_active
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-red-500/10 text-red-400'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400 text-sm">
                                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => { clearMessages(); setResetModal(user); setNewPassword(''); }}
                                                className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                title="Reset password"
                                            >
                                                <KeyRound size={16} />
                                            </button>
                                            {user.username !== 'admin' && (
                                                <>
                                                    <button
                                                        onClick={() => handleToggleActive(user)}
                                                        className={`p-2 rounded-lg transition-colors ${
                                                            user.is_active
                                                                ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-700'
                                                                : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-700'
                                                        }`}
                                                        title={user.is_active ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {user.is_active ? <ShieldOff size={16} /> : <Shield size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                        title="Delete user"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setResetModal(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-semibold text-white">Reset Password</h3>
                            <button onClick={() => setResetModal(null)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-slate-400 text-sm mb-4">
                            Set a new password for <span className="text-white font-medium">{resetModal.username}</span>
                        </p>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="New password (min 6 characters)"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <div className="flex gap-3 mt-5">
                            <button onClick={() => setResetModal(null)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleResetPassword}
                                disabled={newPassword.length < 6}
                                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddUser(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-semibold text-white">Add User</h3>
                            <button onClick={() => setShowAddUser(false)} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <input
                                type="text"
                                required
                                value={addForm.username}
                                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                                placeholder="Username"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                            <input
                                type="email"
                                value={addForm.email}
                                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                                placeholder="Email (optional)"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                            <input
                                type="password"
                                required
                                value={addForm.password}
                                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                                placeholder="Password (min 6 characters)"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowAddUser(false)} className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addLoading || addForm.password.length < 6}
                                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {addLoading ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
