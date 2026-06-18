import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Calendar, Save } from 'lucide-react';
import api, { API_URL } from '../utils/api';
import { authUtils } from '../utils/api';

const Profile = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`${API_URL}/auth/me`)
            .then(res => {
                setUser(res.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-6">My Profile</h1>

            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                {/* Avatar Header */}
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-8 flex items-center gap-6 border-b border-slate-700">
                    <div className="w-20 h-20 rounded-full bg-blue-600/30 border-2 border-blue-500/50 flex items-center justify-center">
                        <User size={36} className="text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">{user?.username || 'User'}</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            {user?.username === 'admin' ? 'Administrator' : 'Standard User'}
                        </p>
                    </div>
                </div>

                {/* Profile Details */}
                <div className="p-6 space-y-5">
                    <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg">
                        <User size={18} className="text-gray-400 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Username</p>
                            <p className="text-white font-medium">{user?.username}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg">
                        <Shield size={18} className="text-gray-400 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Role</p>
                            <p className="text-white font-medium">
                                {user?.username === 'admin' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        Administrator
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                        User
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${user?.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                            <p className={`font-medium ${user?.is_active ? 'text-green-400' : 'text-red-400'}`}>
                                {user?.is_active ? 'Active' : 'Inactive'}
                            </p>
                        </div>
                    </div>

                    {user?.created_at && (
                        <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg">
                            <Calendar size={18} className="text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Member Since</p>
                                <p className="text-white font-medium">
                                    {new Date(user.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
