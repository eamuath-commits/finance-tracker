import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, CreditCard, Receipt, FileBarChart, Settings, TrendingDown, Layers, Tags, ClipboardCheck, Store, FileSearch, LogOut } from 'lucide-react';
import { authUtils } from '../utils/api';

const Sidebar = () => {
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
    ];

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-blue-500">Finance</span>Tracker
                </h1>
            </div>

            <nav className="flex-1 p-4 space-y-2">
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

            <div className="p-4 border-t border-slate-800">
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

                <div className="mt-4 px-4 py-2 bg-slate-800 rounded-lg flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Logged in as</p>
                        <p className="text-sm font-medium text-white truncate">
                            {authUtils.getUser()?.username || 'User'}
                        </p>
                    </div>
                    <button
                        onClick={() => authUtils.logout()}
                        className="ml-2 p-1.5 text-gray-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                        title="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
