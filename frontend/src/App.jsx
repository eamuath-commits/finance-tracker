import React, { useEffect, useState } from 'react';
import axios from 'axios';

// --- UI Components ---

const Card = ({ title, value, subtext, color = "blue" }) => (
    <div className={`bg-white p-6 rounded-xl shadow-sm border-l-4 border-${color}-500`}>
        <h3 className="text-gray-500 text-sm font-medium uppercase">{title}</h3>
        <p className="text-2xl font-bold mt-2 text-gray-800">{value}</p>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
);

const SectionHeader = ({ title, onAdd }) => (
    <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        {onAdd && (
            <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition">
                + Add New
            </button>
        )}
    </div>
);

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">{title}</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            {children}
        </div>
    </div>
);

function App() {
    const [accounts, setAccounts] = useState([]);
    const [loans, setLoans] = useState([]);
    const [obligations, setObligations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [showObligationModal, setShowObligationModal] = useState(false);

    // Form States
    const [newLoan, setNewLoan] = useState({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '' });
    const [newObligation, setNewObligation] = useState({ name: '', amount: '', due_day: '', category: '' });

    const API_URL = "http://" + window.location.hostname + ":8000";

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

    useEffect(() => {
        fetchData();
    }, [API_URL]);

    const handleCreateLoan = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/loans/`, newLoan);
            setShowLoanModal(false);
            setNewLoan({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '' });
            fetchData(); // Refresh list
        } catch (err) {
            alert('Error creating loan');
        }
    };

    const handleCreateObligation = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/obligations/`, newObligation);
            setShowObligationModal(false);
            setNewObligation({ name: '', amount: '', due_day: '', category: '' });
            fetchData(); // Refresh list
        } catch (err) {
            alert('Error creating obligation');
        }
    };

    if (loading) return <div className="p-10 text-center">Loading Dashboard...</div>;

    const totalBalance = accounts.reduce((acc, item) => acc + item.current_balance, 0);
    const totalLoans = loans.reduce((acc, item) => acc + item.remaining_balance, 0);

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Finance Overview</h1>
                    <p className="text-gray-500">Welcome back, Muath</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card title="Total Balance" value={`AED ${totalBalance.toFixed(2)}`} color="green" />
                    <Card title="Total Loans" value={`AED ${totalLoans.toFixed(2)}`} color="red" />
                    <Card title="Monthly Obligations" value={`${obligations.length} Items`} color="indigo" />
                </div>

                {/* --- MANUAL ENTRY MODALS --- */}
                {showLoanModal && (
                    <Modal title="Add New Loan" onClose={() => setShowLoanModal(false)}>
                        <form onSubmit={handleCreateLoan} className="space-y-4">
                            <input type="text" placeholder="Loan Name (e.g. Car Loan)" required className="w-full p-2 border rounded" value={newLoan.name} onChange={e => setNewLoan({ ...newLoan, name: e.target.value })} />
                            <input type="number" placeholder="Principal Amount" required className="w-full p-2 border rounded" value={newLoan.principal_amount} onChange={e => setNewLoan({ ...newLoan, principal_amount: e.target.value })} />
                            <input type="number" placeholder="Interest Rate %" required step="0.1" className="w-full p-2 border rounded" value={newLoan.interest_rate} onChange={e => setNewLoan({ ...newLoan, interest_rate: e.target.value })} />
                            <input type="number" placeholder="Term (Months)" required className="w-full p-2 border rounded" value={newLoan.term_months} onChange={e => setNewLoan({ ...newLoan, term_months: e.target.value })} />
                            <p className="text-xs text-gray-500">Start Date:</p>
                            <input type="date" required className="w-full p-2 border rounded" value={newLoan.start_date} onChange={e => setNewLoan({ ...newLoan, start_date: e.target.value })} />
                            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">Save Loan</button>
                        </form>
                    </Modal>
                )}

                {showObligationModal && (
                    <Modal title="Add Monthly Obligation" onClose={() => setShowObligationModal(false)}>
                        <form onSubmit={handleCreateObligation} className="space-y-4">
                            <input type="text" placeholder="Name (e.g. Rent)" required className="w-full p-2 border rounded" value={newObligation.name} onChange={e => setNewObligation({ ...newObligation, name: e.target.value })} />
                            <input type="number" placeholder="Amount (AED)" required className="w-full p-2 border rounded" value={newObligation.amount} onChange={e => setNewObligation({ ...newObligation, amount: e.target.value })} />
                            <input type="number" placeholder="Due Day (1-31)" required min="1" max="31" className="w-full p-2 border rounded" value={newObligation.due_day} onChange={e => setNewObligation({ ...newObligation, due_day: e.target.value })} />
                            <input type="text" placeholder="Category (e.g. Housing)" className="w-full p-2 border rounded" value={newObligation.category} onChange={e => setNewObligation({ ...newObligation, category: e.target.value })} />
                            <button type="submit" className="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700">Save Obligation</button>
                        </form>
                    </Modal>
                )}

                {/* --- DATA SECTIONS --- */}

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

                {/* LOANS SECTION */}
                <SectionHeader title="Active Loans" onAdd={() => setShowLoanModal(true)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loans.map(loan => (
                        <div key={loan.id} className="bg-white p-4 rounded-lg shadow border border-red-100">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-800">{loan.name}</span>
                                <span className="text-sm bg-red-100 text-red-600 px-2 py-1 rounded">-{loan.interest_rate}%</span>
                            </div>
                            <div className="mt-3 flex justify-between text-sm">
                                <span className="text-gray-500">Principal: {loan.principal_amount}</span>
                                <span className="font-bold text-red-600">Testing Bal: {loan.remaining_balance.toFixed(2)}</span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
                                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${(loan.remaining_balance / loan.principal_amount) * 100}%` }}></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 text-right">{loan.term_months} months term</p>
                        </div>
                    ))}
                    {loans.length === 0 && <p className="text-gray-400 italic">No loans active. Click Add New to start tracking.</p>}
                </div>


                <SectionHeader title="Monthly Obligations" onAdd={() => setShowObligationModal(true)} />
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
                            {obligations.length === 0 && (
                                <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-400">No obligations added.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

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
