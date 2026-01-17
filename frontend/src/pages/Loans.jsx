import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass } from '../components/UI';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const SortableLoanItem = ({ loan, openLoanModal }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: loan.id });

    // Default transition is usually fine, but specifying transform is crucial
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // --- PROGRESS LOGIC ---
    // Calculate how many months have passed since Start Date
    const start = new Date(loan.start_date);
    const now = new Date();

    let monthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) {
        monthsPassed--;
    }

    const currentPayment = Math.min(Math.max(1, monthsPassed + 1), loan.term_months);
    // Calculate percentage based on TIME (Payments Made vs Total Payments)
    const progressPercent = Math.min(100, Math.max(0, (currentPayment / loan.term_months) * 100));

    // DYNAMIC BALANCE CALCULATION (Amortization)
    // We assume straight-line principal reduction for display purposes
    const principalPaid = (loan.principal_amount / loan.term_months) * currentPayment;
    const calculatedRemaining = Math.max(0, loan.principal_amount - principalPaid);

    // SAMA Rule: Settlement = Remaining Principal + 3 Months of Future Profit
    // We assume the entered Interest Rate is the Annual Reducing Balance Rate. 
    // If user entered Flat Rate, this might be slightly off, but it's an estimate.
    const threeMonthsProfit = calculatedRemaining * (loan.interest_rate / 100 / 12) * 3;
    const settlementEstimate = calculatedRemaining + threeMonthsProfit;

    return (
        <div ref={setNodeRef} style={style} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 group relative hover:border-blue-500/50 transition-colors">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="absolute top-3 left-3 cursor-grab opacity-30 hover:opacity-100 z-10 p-1 bg-slate-900/50 rounded touch-none">
                <GripVertical size={16} className="text-gray-400" />
            </div>

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition z-10">
                <EditIcon onClick={() => openLoanModal(loan)} />
            </div>
            {/* Added padding-left to avoid overlap with handle */}
            <div className="flex justify-between items-center pl-8">
                <span className="font-bold text-white">{loan.name}</span>
                <span className="text-sm bg-slate-900 text-blue-300 px-2 py-1 rounded">-{Number(loan.interest_rate).toFixed(2)}%</span>
            </div>
            <div className="mt-3 flex justify-between text-sm">
                <span className="text-gray-400">Principal: {formatCurrency(loan.principal_amount)}</span>
                <span className="font-bold text-slate-200">Remaining: {formatCurrency(calculatedRemaining)}</span>
            </div>

            {/* Progress Bar (Blue - Based on Payments Made) */}
            <div className="w-full bg-slate-900 h-2 rounded-full mt-2 overflow-hidden relative" title={`Progress: ${progressPercent.toFixed(1)}%`}>
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div className="flex justify-between items-end mt-2">
                <div className="flex justify-between items-start w-full">
                    <p className="text-xs text-gray-500">
                        <span className="flex flex-col">
                            <span>Payment <strong className="text-white">{currentPayment}</strong> of {loan.term_months} <span className="text-blue-400 ml-1">({progressPercent.toFixed(0)}%)</span></span>
                            <span className="text-[10px] opacity-70">({Math.max(0, loan.term_months - currentPayment)} left)</span>
                        </span>
                    </p>
                    {loan.monthly_payment ? (
                        <p className="text-xs text-blue-300 bg-blue-900/20 px-2 py-1 rounded">Pay: {formatCurrency(loan.monthly_payment)}</p>
                    ) : (
                        <p className="text-xs text-orange-300 bg-orange-900/20 px-2 py-1 rounded" title="Estimated at 2% of balance">Est: {formatCurrency(calculatedRemaining * 0.02)}</p>
                    )}
                </div>
            </div>

            {/* Early Settlement Estimate (Based on SAMA Rule: 3 Months Future Profit) */}
            <div className="mt-2 text-center">
                <p className="text-[10px] text-gray-500 bg-slate-900/30 py-1 rounded">
                    Payoff Estimate: <strong className="text-emerald-400">{formatCurrency(settlementEstimate)}</strong>
                </p>
            </div>
        </div>
    );
};

const Loans = () => {
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
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

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setLoans((items) => {
                const oldIndex = items.findIndex(item => item.id === active.id);
                const newIndex = items.findIndex(item => item.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                // Save Order
                const ids = newOrder.map(l => l.id);
                axios.put(`${API_URL}/loans/reorder`, ids).catch(err => console.error("Reorder failed", err));

                return newOrder;
            });
        }
    };

    const handleSaveLoan = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...loanForm,
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

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={loans.map(l => l.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {loans.map(loan => (
                            <SortableLoanItem key={loan.id} loan={loan} openLoanModal={openLoanModal} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
            {loans.length === 0 && <p className="text-gray-500 italic">No loans active.</p>}

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
