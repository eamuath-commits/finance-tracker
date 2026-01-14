import React, { useEffect, useState } from 'react';
import axios from 'axios';

// --- Components ---

const Card = ({ title, value, subtext, color = "blue" }) => (
    <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 border-${color}-500`}>
        <h3 className="text-gray-500 text-sm font-medium uppercase">{title}</h3>
        <p className="text-2xl font-bold mt-2 text-gray-800">{value}</p>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
);

const SectionHeader = ({ title }) => (
    <h2 className="text-xl font-semibold text-gray-800 mt-8 mb-4">{title}</h2>
);

function App() {
    const [accounts, setAccounts] = useState([]);
    const [loans, setLoans] = useState([]);
    const [obligations, setObligations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Set this to your Backend URL. 
    // For browser inside VM, relative path "/" might not work if ports differ.
    // We'll use localhost:8000 for now, assuming port forwarding or same network.
    // Ideally this should be configurable.
    const API_URL = "http://" + window.location.hostname + ":8000";

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [accRes, loanRes, oblRes, txRes] = await Promise.all([
                    axios.get(`${API_URL}/accounts/`),
                    axios.get(`${API_URL}/loans/`),
                    axios.get(`${API_URL}/obligations/`),
                    axios.get(`${API_URL}/transactions/`)
                ]);
                setAccounts(accRes.data);
                setLoans(loanRes.data);
                setObligations(oblRes.data);
                setTransactions(txRes.data);
            } catch (error) {
                console.error("Error fetching data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [API_URL]);

    if (loading) return <div className="p-10 text-center">Loading Dashboard...</div>;

    // Calculations
    const totalBalance = accounts.reduce((acc, item) => acc + item.current_balance, 0);
    const totalLoans = loans.reduce((acc, item) => acc + item.remaining_balance, 0);

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Finance Overview</h1>
                    <p className="text-gray-500">Welcome back, Muath</p>
                </header>

                {/* Top Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card title="Total Balance" value={`AED ${totalBalance.toFixed(2)}`} color="green" />
                    <Card title="Total Loans" value={`AED ${totalLoans.toFixed(2)}`} color="red" />
                    <Card title="Monthly Obligations" value={`${obligations.length} Items`} color="indigo" />
                </div>

                {/* Accounts Grid */}
                <SectionHeader title="Your Accounts" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map(acc => (
                        <div key={acc.id} className="bg-white p-4 rounded-lg shadow border border-gray-100">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">{acc.name}</span>
                                <span className="text-xs bg-gray-200 px-2 py-1 rounded">*{acc.last_4_digits}</span>
                            </div>
                            <p className={`text-xl font-bold mt-2 ${acc.current_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                AED {acc.current_balance.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-400 uppercase mt-1">{acc.account_type}</p>
                        </div>
                    ))}
                </div>

                {/* Obligations / Budget */}
                <SectionHeader title="Monthly Obligations" />
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Day</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {obligations.map(obl => (
                                <tr key={obl.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{obl.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{obl.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{obl.due_day}th</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold">AED {obl.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Recent Transactions */}
                <SectionHeader title="Recent Transactions (SMS Log)" />
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merchant</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {transactions.map(tx => (
                                <tr key={tx.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.merchant}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(tx.timestamp).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">- AED {tx.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr><td colSpan="3" className="px-6 py-4 text-center text-gray-400">No transactions recorded yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}

export default App;
