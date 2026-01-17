import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass } from '../components/UI';

const Loans = () => {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [showLoanModal, setShowLoanModal] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState(null);

    // Form Data
    const [loanForm, setLoanForm] = useState({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '' });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchLoans = async () => {
        try {
            const res = await axios.get(`${API_URL}/loans/`);
            setLoans(res.data);
        } catch (error) {
            console.error("Error fetching loans", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLoans();
    }, []);

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...loanForm,
                // Ensure Monthly Payment is float or null
                monthly_payment: loanForm.monthly_payment ? parseFloat(loanForm.monthly_payment) : null
            };

            if (editingId) {
                await axios.put(`${API_URL}/loans/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/loans/`, payload);
            }
            setShowLoanModal(false);
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '' });
            fetchLoans();
        } catch (err) { alert('Error saving loan'); }
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
                term_months: loan.term_months,
                monthly_payment: loan.monthly_payment || ''
            });
        } else {
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '' });
        }
        setShowLoanModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white">Loading Loans...</div>;

    const totalLoans = loans.reduce((acc, item) => acc + item.remaining_balance, 0);

    return (
        <div>
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Loans</h1>
                <p className="text-gray-400">Track your debts and repayment progress</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card title="Total Debt" value={formatCurrency(totalLoans)} color="red" />
                <Card title="Active Loans" value={loans.length} color="indigo" />
            </div>

            <SectionHeader title="Active Loans" onAdd={() => openLoanModal(null)} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
                        {/* Utilization Bar */}
                        <div className="w-full bg-slate-700 h-2 rounded-full mt-2">
                            <div className="bg-red-500 h-2 rounded-full" style={{ width: `${loan.principal_amount ? (loan.remaining_balance / loan.principal_amount) * 100 : 0}%` }}></div>
                        </div>
                        <div className="flex justify-between items-end mt-2">
                            <p className="text-xs text-gray-500">{loan.term_months} months term</p>
                            {loan.monthly_payment && (
                                <p className="text-xs text-blue-300 bg-blue-900/20 px-2 py-1 rounded">Pay: {formatCurrency(loan.monthly_payment)}/mo</p>
                            )}
                        </div>
                    </div>
                ))}
                {loans.length === 0 && <p className="text-gray-500 italic">No loans active.</p>}
            </div>

            {/* --- MODAL --- */}
            {showLoanModal && (
                <Modal title={editingId ? "Edit Loan" : "Add New Loan"} onClose={() => setShowLoanModal(false)}>
                    <form onSubmit={handleSaveLoan} className="space-y-4">
                        <input type="text" placeholder="Loan Name" required className={inputClass} value={loanForm.name} onChange={e => setLoanForm({ ...loanForm, name: e.target.value })} />
                        <input type="number" placeholder="Principal Amount" required className={inputClass} value={loanForm.principal_amount} onChange={e => setLoanForm({ ...loanForm, principal_amount: e.target.value })} />
                        <input type="number" placeholder="Interest Rate %" required step="0.1" className={inputClass} value={loanForm.interest_rate} onChange={e => setLoanForm({ ...loanForm, interest_rate: e.target.value })} />
                        <input type="number" placeholder="Term (Months)" required className={inputClass} value={loanForm.term_months} onChange={e => setLoanForm({ ...loanForm, term_months: e.target.value })} />

                        <div className="bg-slate-700/50 p-3 rounded border border-slate-600">
                            <label className="text-xs text-gray-400 uppercase font-semibold">Monthly Payment (Actual)</label>
                            <input
                                type="number"
                                placeholder="Enter exact monthly payment"
                                step="0.01"
                                className={`${inputClass} mt-1`}
                                value={loanForm.monthly_payment}
                                onChange={e => setLoanForm({ ...loanForm, monthly_payment: e.target.value })}
                            />
                            <p className="text-[10px] text-gray-500 mt-1">Leave empty to auto-estimate (2% of balance).</p>
                        </div>

                        <p className="text-xs text-gray-400">Start Date:</p>
                        <input type="date" required className={inputClass} value={loanForm.start_date} onChange={e => setLoanForm({ ...loanForm, start_date: e.target.value })} />
                        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium">Save Loan</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Loans;
