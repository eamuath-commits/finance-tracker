import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, CreditCard, Receipt, FileBarChart, Settings, TrendingDown, Layers, Tags, ClipboardCheck, Store, FileSearch, LogOut, Users, User, ChevronDown, Key, FileUp } from 'lucide-react';
import { authUtils } from '../utils/api';
import ThemeToggle from './ThemeToggle';

const Sidebar = () => {
    const [profileOpen, setProfileOpen] = useState(false);
    const navigate = useNavigate();
    const user = authUtils.getUser();

    const navItems = [
        { path: '/', label: 'Overview', icon: LayoutDashboard },
        { path: '/accounts', label: 'Accounts', icon: Wallet },
        { path: '/credit-cards', label: 'Credit Cards', icon: CreditCard },
        { path: '/allocation', label: 'Allocation', icon: Layers },
        { path: '/transactions', label: 'Transactions', icon: Receipt },
        { path: '/merchants', label: 'Merchants', icon: Store },
        { path: '/obligations', label: 'Obligations', icon: FileBarChart },
        { path: '/categories', label: 'Categories', icon: Tags },
        { path: '/loans', label: 'Loans', icon: TrendingDown },
        { path: '/reports', label: 'Reports', icon: FileBarChart },
        { path: '/planning', label: 'Planning', icon: TrendingDown },
        { path: '/audit', label: 'Audit', icon: ClipboardCheck },
        { path: '/settlement', label: 'Settlement', icon: FileSearch },
        { path: '/statements', label: 'Statements', icon: FileUp },
    ];

    const handleLogout = () => {
        authUtils.logout();
        navigate('/login');
    };

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-blue-500">Finance</span>Tracker
                </h1>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                                : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
                            }`
                        }
                    >
                        <item.icon size={20} />
                        <span className="font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-2">
                <ThemeToggle />
                {user?.username === 'admin' && (
                    <NavLink
                        to="/users"
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${isActive
                                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                                : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
                            }`
                        }
                    >
                        <Users size={20} />
                        <span className="font-medium">Users</span>
                    </NavLink>
                )}
                <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors ${isActive
                            ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                            : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
                        }`
                    }
                >
                    <Settings size={20} />
                    <span className="font-medium">Settings</span>
                </NavLink>

                {/* Profile Section */}
                <div className="relative">
                    <button
                        onClick={() => setProfileOpen(!profileOpen)}
                        className="w-full mt-2 px-4 py-3 bg-slate-800 rounded-lg flex items-center gap-3 hover:bg-slate-700 transition-colors group"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0">
                            <User size={16} className="text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-medium text-white truncate">{user?.username || 'User'}</p>
                            <p className="text-xs text-gray-500">{user?.username === 'admin' ? 'Administrator' : 'User'}</p>
                        </div>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Profile Dropdown */}
                    {profileOpen && (
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                            <NavLink
                                to="/profile"
                                onClick={() => setProfileOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                                <User size={16} />
                                <span className="text-sm">My Profile</span>
                            </NavLink>
                            <NavLink
                                to="/change-password"
                                onClick={() => setProfileOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                                <Key size={16} />
                                <span className="text-sm">Change Password</span>
                            </NavLink>
                            <div className="border-t border-slate-700" />
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                            >
                                <LogOut size={16} />
                                <span className="text-sm font-medium">Sign Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
