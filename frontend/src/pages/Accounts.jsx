import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Wallet, PiggyBank, CreditCard, LayoutGrid, List, Receipt } from 'lucide-react';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass, selectClass } from '../components/UI';

const getAccountIcon = (type) => {
    switch (type) {
        case 'Savings': return <PiggyBank className="w-6 h-6 text-green-400" />;
        case 'Credit Card': return <CreditCard className="w-6 h-6 text-blue-400" />;
        default: return <Wallet className="w-6 h-6 text-indigo-400" />;
    }
};

const Accounts = () => {
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'manager', 'transactions'
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [showAccountModal, setShowAccountModal] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState(null);

    // Form Data
    const [accountForm, setAccountForm] = useState({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [] });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [accRes, txRes] = await Promise.all([
                axios.get(`${API_URL}/accounts/`),
                axios.get(`${API_URL}/transactions/`)
            ]);
            setAccounts(accRes.data);
            setTransactions(txRes.data);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        try {
            // Sanitize payload: valid float or null
            const payload = {
                ...accountForm,
                credit_limit: accountForm.credit_limit ? parseFloat(accountForm.credit_limit) : null
            };
            // Remove aliases from payload if sending to main account endpoint
            delete payload.aliases;

            if (editingId) {
                await axios.put(`${API_URL}/accounts/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/accounts/`, payload);
            }
            setShowAccountModal(false);
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [] });
            fetchData();
        } catch (err) { alert('Error saving account'); }
    };

    const openAccountModal = (acc = null) => {
        if (acc) {
            setEditingId(acc.id);
            setAccountForm({
                name: acc.name,
                account_type: acc.account_type,
                last_4_digits: acc.last_4_digits,
                current_balance: acc.current_balance,
                credit_limit: acc.credit_limit || '',
                aliases: acc.aliases || []
            });
        } else {
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '', credit_limit: '', aliases: [] });
        }
        setShowAccountModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white">Loading Accounts...</div>;

    const totalBalance = accounts.reduce((acc, item) => acc + item.current_balance, 0);

    return (
        <div>
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white">Accounts</h1>
                    <p className="text-gray-400">Manage your bank accounts and credit cards</p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg mb-8 w-fit border border-slate-700">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <LayoutGrid size={16} /> Overview
                </button>
                <button
                    onClick={() => setActiveTab('manager')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'manager' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <List size={16} /> Manager
                </button>
                <button
                    onClick={() => setActiveTab('transactions')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <Receipt size={16} /> Transactions
                </button>
            </div>

            {/* --- OVERVIEW TAB --- */}
            {activeTab === 'overview' && (
                <div className="animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card title="Total Net Worth" value={formatCurrency(totalBalance)} color="green" />
                        <Card title="Active Accounts" value={accounts.length} color="indigo" />
                        <Card title="Recent Transactions" value={transactions.length} color="blue" />
                    </div>

                    <SectionHeader title="Account Summary" />

                    {/* Read-Only Grid (No Edit Buttons) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        {accounts.map(acc => {
                            const isCreditCard = acc.account_type === 'Credit Card';
                            const hasLimit = isCreditCard && acc.credit_limit > 0;
                            const utilPercent = hasLimit ? Math.min(100, (Math.abs(acc.current_balance) / acc.credit_limit) * 100) : 0;

                            return (
                                <div key={acc.id} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 relative">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-slate-700/50 rounded-lg">
                                            {getAccountIcon(acc.account_type)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white">{acc.name}</span>
                                                <span className="text-xs bg-slate-600 text-gray-200 px-1.5 py-0.5 rounded">*{acc.last_4_digits}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 uppercase">{acc.account_type}</p>
                                        </div>
                                    </div>
                                    <p className={`text-xl font-bold mt-2 ${acc.current_balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {formatCurrency(acc.current_balance)}
                                    </p>
                                    {hasLimit && (
                                        <div className="mt-2 text-xs text-slate-400">
                                            <div className="flex justify-between mb-1">
                                                <span>Utilization</span>
                                                <span>{utilPercent.toFixed(0)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${utilPercent > 90 ? 'bg-red-500' : utilPercent > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                                    style={{ width: `${utilPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- MANAGER TAB --- */}
            {activeTab === 'manager' && (
                <div className="animate-fade-in">
                    <SectionHeader title="Manage Accounts" onAdd={() => openAccountModal(null)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        {accounts.map(acc => {
                            const isCreditCard = acc.account_type === 'Credit Card';
                            const hasLimit = isCreditCard && acc.credit_limit > 0;
                            const utilPercent = hasLimit ? Math.min(100, (Math.abs(acc.current_balance) / acc.credit_limit) * 100) : 0;

                            return (
                                <div key={acc.id} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 group relative">
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                        <EditIcon onClick={() => openAccountModal(acc)} />
                                    </div>

                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-slate-700/50 rounded-lg">
                                            {getAccountIcon(acc.account_type)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white">{acc.name}</span>
                                                <span className="text-xs bg-slate-600 text-gray-200 px-1.5 py-0.5 rounded">*{acc.last_4_digits}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 uppercase">{acc.account_type}</p>
                                        </div>
                                    </div>

                                    <p className={`text-xl font-bold mt-2 ${acc.current_balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {formatCurrency(acc.current_balance)}
                                    </p>

                                    {/* Show Linked Aliases Count if any */}
                                    {acc.aliases && acc.aliases.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {acc.aliases.map(a => (
                                                <span key={a.id} className="text-[10px] bg-slate-700 text-gray-400 px-1.5 py-0.5 rounded border border-slate-600">
                                                    x{a.last_4_digits}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- TRANSACTIONS TAB --- */}
            {activeTab === 'transactions' && (
                <div className="animate-fade-in">
                    <SectionHeader title="Transactions Log" />
                    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-700">
                            <thead className="bg-slate-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Merchant</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider pl-8">Category</th>
                                </tr>
                            </thead>
                            <tbody className="bg-slate-800 divide-y divide-slate-700">
                                {transactions.map(tx => (
                                    <tr key={tx.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                            {tx.merchant}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(tx.timestamp).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-400">- {formatCurrency(tx.amount)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm pl-8">
                                            {tx.category ? (
                                                <span className="px-2 py-1 rounded text-xs bg-slate-700 text-blue-300 border border-slate-600">{tx.category}</span>
                                            ) : <span className="text-gray-600 italic text-xs">Uncategorized</span>}
                                        </td>
                                    </tr>
                                ))}
                                {transactions.length === 0 && (
                                    <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">No transactions recorded yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- ACCOUNT MODAL (Shared) --- */}
            {showAccountModal && (
                <Modal title={editingId ? "Edit Account" : "Add New Account"} onClose={() => setShowAccountModal(false)}>
                    <form onSubmit={handleSaveAccount} className="space-y-4">
                        <input type="text" placeholder="Account Name (e.g. Chase)" required className={inputClass} value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                        <select className={selectClass} value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}>
                            <option value="Checking">Checking</option>
                            <option value="Savings">Savings</option>
                            <option value="Credit Card">Credit Card</option>
                        </select>
                        <input type="text" placeholder="Last 4 Digits" required className={inputClass} value={accountForm.last_4_digits} onChange={e => setAccountForm({ ...accountForm, last_4_digits: e.target.value })} />
                        <input type="number" step="0.01" placeholder="Current Balance" required className={inputClass} value={accountForm.current_balance} onChange={e => setAccountForm({ ...accountForm, current_balance: e.target.value })} />

                        {/* Credit Limit Input (Only for Credit Cards) */}
                        {accountForm.account_type === 'Credit Card' && (
                            <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                                <label className="text-xs text-gray-400 uppercase font-semibold">Credit Limit</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Enter Credit Limit"
                                    className={`${inputClass} mt-1`}
                                    value={accountForm.credit_limit || ''}
                                    onChange={e => setAccountForm({ ...accountForm, credit_limit: e.target.value })}
                                />
                            </div>
                        )}

                        <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 font-medium">Save Account</button>
                    </form>

                    {/* Linked Aliases Section (Only when editing) */}
                    {editingId && (
                        <div className="mt-6 pt-4 border-t border-slate-700">
                            <h3 className="text-sm font-bold text-gray-300 mb-2">Linked Cards / Identifiers</h3>
                            <div className="space-y-2 mb-3">
                                {accountForm.aliases && accountForm.aliases.map(alias => (
                                    <div key={alias.id} className="flex justify-between items-center bg-slate-700/50 p-2 rounded text-sm">
                                        <span>{alias.alias_name} (x{alias.last_4_digits})</span>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Delete this alias?')) return;
                                                try {
                                                    await axios.delete(`${API_URL}/aliases/${alias.id}`);
                                                    // Refresh list locally
                                                    setAccountForm(prev => ({
                                                        ...prev,
                                                        aliases: prev.aliases.filter(a => a.id !== alias.id)
                                                    }));
                                                    fetchData(); // Sync global state
                                                } catch (err) { alert('Failed to delete alias'); }
                                            }}
                                            className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                {(!accountForm.aliases || accountForm.aliases.length === 0) && (
                                    <p className="text-xs text-gray-500 italic">No linked cards yet.</p>
                                )}
                            </div>

                            {/* Add Alias Mini-Form */}
                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const aliasName = e.target.aliasName.value;
                                    const aliasLast4 = e.target.aliasLast4.value;
                                    if (!aliasName || !aliasLast4) return;

                                    try {
                                        const res = await axios.post(`${API_URL}/accounts/${editingId}/aliases`, {
                                            alias_name: aliasName,
                                            last_4_digits: aliasLast4
                                        });
                                        // Update UI
                                        setAccountForm(prev => ({
                                            ...prev,
                                            aliases: [...(prev.aliases || []), res.data]
                                        }));
                                        e.target.reset();
                                        fetchData();
                                    } catch (err) { alert('Failed to add alias'); }
                                }}
                                className="flex gap-2"
                            >
                                <input name="aliasName" type="text" placeholder="Name (e.g. Virtual Card)" className={inputClass + " text-xs"} required />
                                <input name="aliasLast4" type="text" placeholder="Last 4" className={inputClass + " w-20 text-xs"} required maxLength={4} />
                                <button type="submit" className="bg-slate-700 text-blue-300 text-xs px-3 rounded hover:bg-slate-600">Add</button>
                            </form>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default Accounts;
