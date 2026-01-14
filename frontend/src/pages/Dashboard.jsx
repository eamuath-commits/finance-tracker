import React, { useEffect, useState } from 'react';
import axios from 'axios';
        <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
        <p className="text-2xl font-bold mt-2 text-white">{value}</p>
{ subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p> }
    </div >
);

const SectionHeader = ({ title, onAdd }) => (
    <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
        {onAdd && (
            <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition shadow-md">
                + Add New
            </button>
        )}
    </div>
);

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            {children}
        </div>
    </div>
);

const EditIcon = ({ onClick }) => (
    <button onClick={onClick} className="text-gray-500 hover:text-blue-400 ml-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    </button>
);

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

// Input styling helper
const inputClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500";
const selectClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white focus:outline-none focus:border-blue-500";

function App() {
    const [accounts, setAccounts] = useState([]);
    const [loans, setLoans] = useState([]);
    const [obligations, setObligations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [showObligationModal, setShowObligationModal] = useState(false);

    // Editing State (If null, we are creating. If set, we are editing)
    const [editingId, setEditingId] = useState(null);

    // Form Data
    const [accountForm, setAccountForm] = useState({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '' });
    const [loanForm, setLoanForm] = useState({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '' });
    const [obligationForm, setObligationForm] = useState({ name: '', amount: '', due_day: '', category: '' });
    const [transactionForm, setTransactionForm] = useState({ category: '' });
    const [showTransactionModal, setShowTransactionModal] = useState(false);

    // Allow overriding API URL via environment variable for remote development
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [accRes, loanRes, oblRes, txRes, analysisRes] = await Promise.all([
                axios.get(`${API_URL}/accounts/`),
                axios.get(`${API_URL}/loans/`),
                axios.get(`${API_URL}/obligations/`),
                axios.get(`${API_URL}/transactions/`),
                axios.get(`${API_URL}/analysis/allocation`)
            ]);
            setAccounts(accRes.data);
            setLoans(loanRes.data);
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

    // --- Handlers ---

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await axios.put(`${API_URL}/accounts/${editingId}`, accountForm);
            } else {
                await axios.post(`${API_URL}/accounts/`, accountForm);
            }
            setShowAccountModal(false);
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '' });
            fetchData();
        } catch (err) { alert('Error saving account'); }
    };

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await axios.put(`${API_URL}/loans/${editingId}`, loanForm);
            } else {
                await axios.post(`${API_URL}/loans/`, loanForm);
            }
            setShowLoanModal(false);
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '' });
            fetchData();
        } catch (err) { alert('Error saving loan'); }
    };

    const handleSaveObligation = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await axios.put(`${API_URL}/obligations/${editingId}`, obligationForm);
            } else {
                await axios.post(`${API_URL}/obligations/`, obligationForm);
            }
            setShowObligationModal(false);
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
            fetchData();
        } catch (err) { alert('Error saving obligation'); }
    };

    const handleSaveTransaction = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/transactions/${editingId}`, transactionForm);
            setShowTransactionModal(false);
            setEditingId(null);
            fetchData();
        } catch (err) { alert('Error updating transaction'); }
    };

    // --- Edit Triggers ---

    const openAccountModal = (acc = null) => {
        if (acc) {
            setEditingId(acc.id);
            setAccountForm({ name: acc.name, account_type: acc.account_type, last_4_digits: acc.last_4_digits, current_balance: acc.current_balance });
        } else {
            setEditingId(null);
            setAccountForm({ name: '', account_type: 'Checking', last_4_digits: '', current_balance: '' });
        }
        setShowAccountModal(true);
    };

    const openLoanModal = (loan = null) => {
        if (loan) {
            setEditingId(loan.id);
            setLoanForm({
                name: loan.name,
                principal_amount: loan.principal_amount,
                interest_rate: loan.interest_rate,
                // Format date to YYYY-MM-DD for input
                start_date: loan.start_date ? new Date(loan.start_date).toISOString().split('T')[0] : '',
                term_months: loan.term_months
            });
        } else {
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '' });
        }
        setShowLoanModal(true);
    };

    const openObligationModal = (obl = null) => {
        if (obl) {
            setEditingId(obl.id);
            setObligationForm({ name: obl.name, amount: obl.amount, due_day: obl.due_day, category: obl.category });
        } else {
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
        }
        setShowObligationModal(true);
    };

    const openTransactionModal = (tx) => {
        setEditingId(tx.id);
        setTransactionForm({ category: tx.category || '' });
        setShowTransactionModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white bg-slate-900 min-h-screen">Loading Dashboard...</div>;

    const totalBalance = accounts.reduce((acc, item) => acc + item.current_balance, 0);
    const totalLoans = loans.reduce((acc, item) => acc + item.remaining_balance, 0);

    return (
        <div className="min-h-screen bg-slate-900 p-6 font-sans text-gray-100">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-white">Finance Overview</h1>
                    <p className="text-gray-400">Welcome back, Muath</p>
                </header>

                <AllocationCard analysis={analysis} />

                <Analytics transactions={transactions} obligations={obligations} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card title="Total Balance" value={formatCurrency(totalBalance)} color="green" />
                    <Card title="Total Loans" value={formatCurrency(totalLoans)} color="red" />
                    <Card title="Monthly Obligations" value={`${obligations.length} Items`} color="indigo" />
                </div>

                {/* --- MODALS --- */}

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
                            <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 font-medium">Save Account</button>
                        </form>
                    </Modal>
                )}

                {showLoanModal && (
                    <Modal title={editingId ? "Edit Loan" : "Add New Loan"} onClose={() => setShowLoanModal(false)}>
                        <form onSubmit={handleSaveLoan} className="space-y-4">
                            <input type="text" placeholder="Loan Name" required className={inputClass} value={loanForm.name} onChange={e => setLoanForm({ ...loanForm, name: e.target.value })} />
                            <input type="number" placeholder="Principal Amount" required className={inputClass} value={loanForm.principal_amount} onChange={e => setLoanForm({ ...loanForm, principal_amount: e.target.value })} />
                            <input type="number" placeholder="Interest Rate %" required step="0.1" className={inputClass} value={loanForm.interest_rate} onChange={e => setLoanForm({ ...loanForm, interest_rate: e.target.value })} />
                            <input type="number" placeholder="Term (Months)" required className={inputClass} value={loanForm.term_months} onChange={e => setLoanForm({ ...loanForm, term_months: e.target.value })} />
                            <p className="text-xs text-gray-400">Start Date:</p>
                            <input type="date" required className={inputClass} value={loanForm.start_date} onChange={e => setLoanForm({ ...loanForm, start_date: e.target.value })} />
                            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium">Save Loan</button>
                        </form>
                    </Modal>
                )}

                {showObligationModal && (
                    <Modal title={editingId ? "Edit Obligation" : "Add Obligation"} onClose={() => setShowObligationModal(false)}>
                        <form onSubmit={handleSaveObligation} className="space-y-4">
                            <input type="text" placeholder="Name (e.g. Rent)" required className={inputClass} value={obligationForm.name} onChange={e => setObligationForm({ ...obligationForm, name: e.target.value })} />
                            <input type="number" placeholder="Amount (SAR)" required className={inputClass} value={obligationForm.amount} onChange={e => setObligationForm({ ...obligationForm, amount: e.target.value })} />
                            <input type="number" placeholder="Due Day (1-31)" required min="1" max="31" className={inputClass} value={obligationForm.due_day} onChange={e => setObligationForm({ ...obligationForm, due_day: e.target.value })} />
                            <input type="text" placeholder="Category (e.g. Housing)" className={inputClass} value={obligationForm.category} onChange={e => setObligationForm({ ...obligationForm, category: e.target.value })} />
                            <button type="submit" className="w-full bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 font-medium">Save Obligation</button>
                        </form>
                    </Modal>
                )}

                {showTransactionModal && (
                    <Modal title="Edit Transaction" onClose={() => setShowTransactionModal(false)}>
                        <form onSubmit={handleSaveTransaction} className="space-y-4">
                            <p className="text-gray-400 text-sm mb-2">Assign a category to this transaction.</p>
                            <input type="text" placeholder="Category (e.g. Food, Transport)" className={inputClass} value={transactionForm.category} onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })} />
                            <div className="flex gap-2 flex-wrap">
                                {['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping'].map(cat => (
                                    <button key={cat} type="button" onClick={() => setTransactionForm({ ...transactionForm, category: cat })} className="bg-slate-700 text-xs px-2 py-1 rounded text-gray-300 hover:bg-slate-600 border border-slate-600">
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium">Save Changes</button>
                        </form>
                    </Modal>
                )}

                {/* --- LISTS --- */}

                <SectionHeader title="Your Accounts" onAdd={() => openAccountModal(null)} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map(acc => (
                        <div key={acc.id} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 group relative">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                <EditIcon onClick={() => openAccountModal(acc)} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-white">{acc.name}</span>
                                <span className="text-xs bg-slate-600 text-gray-200 px-2 py-1 rounded">*{acc.last_4_digits}</span>
                            </div>
                            <p className={`text-xl font-bold mt-2 ${acc.current_balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {formatCurrency(acc.current_balance)}
                            </p>
                            <p className="text-xs text-gray-500 uppercase mt-1">{acc.account_type}</p>
                        </div>
                    ))}
                </div>

                <SectionHeader title="Active Loans" onAdd={() => openLoanModal(null)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loans.map(loan => (
                        <div key={loan.id} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-red-900/30 group relative">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                <EditIcon onClick={() => openLoanModal(loan)} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-white">{loan.name}</span>
                                <span className="text-sm bg-red-900/40 text-red-300 px-2 py-1 rounded">-{loan.interest_rate}%</span>
                            </div>
                            <div className="mt-3 flex justify-between text-sm">
                                <span className="text-gray-400">Principal: {formatCurrency(loan.principal_amount)}</span>
                                <span className="font-bold text-red-400">Remaining: {formatCurrency(loan.remaining_balance)}</span>
                            </div>
                            <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
                                {/* Prevent division by zero if principal is 0 */}
                                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${loan.principal_amount ? (loan.remaining_balance / loan.principal_amount) * 100 : 0}%` }}></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 text-right">{loan.term_months} months term</p>
                        </div>
                    ))}
                    {loans.length === 0 && <p className="text-gray-500 italic">No loans active.</p>}
                </div>

                <SectionHeader title="Monthly Obligations" onAdd={() => openObligationModal(null)} />
                <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-700">
                        <thead className="bg-slate-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Due</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Edit</th>
                            </tr>
                        </thead>
                        <tbody className="bg-slate-800 divide-y divide-slate-700">
                            {obligations.map(obl => (
                                <tr key={obl.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{obl.name} <span className="text-gray-500 font-normal">({obl.category})</span></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{obl.due_day}th</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-white">{formatCurrency(obl.amount)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => openObligationModal(obl)} className="text-indigo-400 hover:text-indigo-300">Edit</button>
                                    </td>
                                </tr>
                            ))}
                            {obligations.length === 0 && (
                                <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No obligations added.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <SectionHeader title="Recent Transactions (SMS Log)" />
                <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                    {/* Transactions are usually immutable from UI, so no Edit button here for now */}
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
                            {transactions.map(tx => (
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
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}

export default App;
