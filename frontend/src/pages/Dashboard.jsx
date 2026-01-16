import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Analytics from '../Analytics';
import { Card, SectionHeader, Modal, formatCurrency, inputClass } from '../components/UI';

const AllocationCard = ({ analysis }) => {
    if (!analysis) return null;

    const isDanger = analysis.freedom_cash < 0;
    const colorClass = isDanger ? "bg-red-900/20 border-red-800" : "bg-green-900/20 border-green-800";
    const textClass = isDanger ? "text-red-400" : "text-green-400";

    return (
        <div className={`p-6 rounded-xl border ${colorClass} mb-8 backdrop-blur-sm`}>
            <h2 className={`text-xl font-bold ${textClass} mb-2`}>Smart Analysis</h2>
            <p className="text-gray-300 font-medium text-lg">{analysis.message}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-slate-800 p-3 rounded shadow-sm border border-slate-700">
                    <p className="text-xs text-gray-400 uppercase">Liquid Cash</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(analysis.liquid_cash)}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded shadow-sm border border-slate-700">
                    <p className="text-xs text-gray-400 uppercase">Upcoming Bills</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(analysis.unpaid_obligations_this_month)}</p>
                </div>
                <div className="bg-slate-800 p-3 rounded shadow-sm border border-slate-700">
                    <p className="text-xs text-gray-400 uppercase">Safe to Spend</p>
                    <p className={`text-lg font-bold ${analysis.freedom_cash < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {formatCurrency(analysis.freedom_cash)}
                    </p>
                </div>
            </div>

            <div className="mt-4 space-y-2">
                {analysis.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start">
                        <span className="mr-2 text-lg">
                            {rec.type === 'bill' ? '🧾' : rec.type === 'save' ? '💰' : '⚠️'}
                        </span>
                        <p className="text-sm text-gray-300">{rec.text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Dashboard = () => {
    const [obligations, setObligations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [transactionForm, setTransactionForm] = useState({ category: '' });

    // Allow overriding API URL via environment variable for remote development
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [oblRes, txRes, analysisRes] = await Promise.all([
                axios.get(`${API_URL}/obligations/`),
                axios.get(`${API_URL}/transactions/`),
                axios.get(`${API_URL}/analysis/allocation`)
            ]);
            setObligations(oblRes.data);
            setTransactions(txRes.data);
            setAnalysis(analysisRes.data);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveTransaction = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/transactions/${editingId}`, transactionForm);
            setShowTransactionModal(false);
            setEditingId(null);
            fetchData();
        } catch (err) { alert('Error updating transaction'); }
    };

    const openTransactionModal = (tx) => {
        setEditingId(tx.id);
        setTransactionForm({ category: tx.category || '' });
        setShowTransactionModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white">Loading Dashboard...</div>;

    return (
        <div>
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Overview</h1>
                <p className="text-gray-400">Welcome back, Muath</p>
            </header>

            <AllocationCard analysis={analysis} />

            <Analytics transactions={transactions} obligations={obligations} />

            <SectionHeader title="Recent Transactions" />
            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden mb-8">
                <table className="min-w-full divide-y divide-slate-700">
                    <thead className="bg-slate-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Merchant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Edit</th>
                        </tr>
                    </thead>
                    <tbody className="bg-slate-800 divide-y divide-slate-700">
                        {transactions.slice(0, 5).map(tx => (
                            <tr key={tx.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                    {tx.merchant}
                                    {tx.category && <span className="ml-2 px-2 py-0.5 rounded text-xs bg-slate-700 text-blue-300 border border-slate-600">{tx.category}</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(tx.timestamp).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-400">- {formatCurrency(tx.amount)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => openTransactionModal(tx)} className="text-blue-400 hover:text-blue-300">Edit</button>
                                </td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No transactions recorded yet.</td></tr>
                        )}
                        {transactions.length > 5 && (
                            <tr><td colSpan="4" className="px-6 py-2 text-center text-xs text-gray-500 hover:text-white cursor-pointer" onClick={() => window.location.href = '/transactions'}>View All Transactions</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showTransactionModal && (
                <Modal title="Edit Transaction" onClose={() => setShowTransactionModal(false)}>
                    <form onSubmit={handleSaveTransaction} className="space-y-4">
                        <p className="text-gray-400 text-sm mb-2">Assign a category to this transaction.</p>
                        <input type="text" placeholder="Category (e.g. Food, Transport)" className={inputClass} value={transactionForm.category} onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })} />
                        <div className="flex gap-2 flex-wrap">
                            {['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Credit Card Payment', 'Obligation'].map(cat => (
                                <button key={cat} type="button" onClick={() => setTransactionForm({ ...transactionForm, category: cat })} className="bg-slate-700 text-xs px-2 py-1 rounded text-gray-300 hover:bg-slate-600 border border-slate-600">
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium">Save Changes</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
