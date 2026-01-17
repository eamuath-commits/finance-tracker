import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass } from '../components/UI';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';

const SortableLoanItem = ({ loan, openLoanModal, deleteLoan }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: loan.id });

    // Default transition is usually fine, but specifying transform is crucial
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // --- PROGRESS LOGIC ---
    const start = new Date(loan.start_date);
    const now = new Date();

    let monthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    // If we have a custom due day (e.g. 27), check if we passed it this month
    const dueDay = loan.due_day || 27; // Default to 27th if not set
    if (now.getDate() < dueDay) {
        monthsPassed--;
    }

    const currentPayment = Math.min(Math.max(1, monthsPassed + 1), loan.term_months);
    // Calculate percentage based on TIME (Payments Made vs Total Payments)
    const progressPercent = Math.min(100, Math.max(0, (monthsPassed / loan.term_months) * 100));

    // --- SOLVER FOR EFFECTIVE RATE ---
    const solveEffectiveMonthlyRate = (P, N, PMT) => {
        let r = 0.004; // Initial guess (approx 4.8% APR)
        for (let i = 0; i < 20; i++) {
            const numerator = (PMT / r) * (1 - Math.pow(1 + r, -N)) - P;
            const derivative = (PMT / r) * (N * Math.pow(1 + r, -N - 1)) - (PMT / (r * r)) * (1 - Math.pow(1 + r, -N));
            const nextR = r - (numerator / derivative);
            if (Math.abs(nextR - r) < 0.0000001) return nextR;
            r = nextR;
        }
        return r;
    };

    let effectiveMonthlyRate = 0;
    if (loan.monthly_payment && loan.term_months && loan.principal_amount) {
        effectiveMonthlyRate = solveEffectiveMonthlyRate(loan.principal_amount, loan.term_months, loan.monthly_payment);
    } else {
        effectiveMonthlyRate = (parseFloat(loan.interest_rate || 0) / 100) / 12;
    }

    // DYNAMIC BALANCE CALCULATION (Using Effective Rate)
    let remainingPrincipal = loan.principal_amount;

    if (loan.term_months > 0) {
        // LOGIC: Calculate 'Potential' payments based on calendar months
        const yearDiff = now.getFullYear() - start.getFullYear();
        const monthDiff = now.getMonth() - start.getMonth();
        let totalMonthsPassed = (yearDiff * 12) + monthDiff;

        const dueDay = loan.due_day || 27;

        // Adjustment 1
        if (start.getDate() > dueDay) {
            totalMonthsPassed--;
        }

        // Adjustment 2
        if (now.getDate() < dueDay) {
            totalMonthsPassed--;
        }

        // Final Payments Made Logic
        let pMade = totalMonthsPassed;
        if (start.getDate() > dueDay) pMade -= 1;
        if (now.getDate() >= dueDay) pMade += 1;

        // Wait, I am re-implementing the logic from Step 5583, but checking if I got it right.
        // Step 5583 code:
        // let pMade = totalMonthsPassed;
        // if (start.getDate() > dueDay) pMade -= 1;
        // if (now.getDate() >= dueDay) pMade += 1;
        //
        // Wait, totalMonthsPassed ALREADY applied Adj 1 and Adj 2 inside the if blocks in previous Step 5583??
        // Let's check Step 5583 again.
        // It had: 
        // if (start > due) totalMonthsPassed--
        // if (now < due) totalMonthsPassed--
        // AND THEN:
        // let pMade = totalMonthsPassed;
        // if (start > due) pMade -= 1;   <-- Double subtraction?
        // if (now >= due) pMade += 1;
        //
        // NO. I see what happened.
        // My previous Replace in 5583 had comments explaining logic, but the actual code block I *intended* to replace might have been mixed.
        // Let's look at the result in 5620 (Line 90-137).
        // It does:
        // 92: if (start > due) totalMonthsPassed--;
        // 97: if (now < due) totalMonthsPassed--;
        // 150: let pMade = totalMonthsPassed;
        // 151: if (start > due) pMade -= 1;  <-- This IS duplicate subtraction.
        // 152: if (now >= due) pMade +=1;

        // This means my "Fix" in 5583 might have over-corrected or been buggy.
        // If start > due, we subtracted twice.
        // Let's fix this NOW while restoring.

        // CORRECT LOGIC:
        // 1. Calculate raw calendar diff.
        // 2. Adjust for start/current relative to due day.

        // Let's stick to the SIMPLE logic that worked:
        // Payments = (Diff years * 12 + Diff months).
        // If Start > Due: -1 (First month skipped).
        // If Now < Due: -1 (Current month not paid).
        // That's it.

        // So:
        const rawDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        let pm = rawDiff;
        if (start.getDate() > dueDay) pm -= 1;
        if (now.getDate() < dueDay) pm -= 1;

        const paymentsMade = Math.max(0, pm);

        // Okay, I will use this cleaner logic.

        if (paymentsMade >= loan.term_months) {
            remainingPrincipal = 0;
        } else if (effectiveMonthlyRate > 0) {
            const N = loan.term_months;
            const k = paymentsMade;
            const r = effectiveMonthlyRate;

            const numerator = Math.pow(1 + r, N) - Math.pow(1 + r, k);
            const denominator = Math.pow(1 + r, N) - 1;
            remainingPrincipal = loan.principal_amount * (numerator / denominator);
        } else {
            const principalPaid = (loan.principal_amount / loan.term_months) * paymentsMade;
            remainingPrincipal = Math.max(0, loan.principal_amount - principalPaid);
        }
    }

    const remainingMonths = Math.max(0, loan.term_months - currentPayment);
    const totalOutstanding = loan.monthly_payment ? (loan.monthly_payment * remainingMonths) : remainingPrincipal;
    const threeMonthsProfit = remainingPrincipal * effectiveMonthlyRate * 3;
    const settlementEstimate = remainingPrincipal + threeMonthsProfit;

    return (
        <div ref={setNodeRef} style={style} className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 group relative hover:border-blue-500/50 transition-colors">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="absolute top-3 left-3 cursor-grab opacity-30 hover:opacity-100 z-10 p-1 bg-slate-900/50 rounded touch-none">
                <GripVertical size={16} className="text-gray-400" />
            </div>

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition z-10 flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); deleteLoan(loan.id); }} className="text-red-400 hover:text-red-300 transition" title="Delete Loan">
                    <Trash2 size={16} />
                </button>
                <EditIcon onClick={() => openLoanModal(loan)} />
            </div>

            <div className="flex justify-between items-center pl-8">
                <span className="font-bold text-white">{loan.name}</span>
                <span className="text-sm bg-slate-900 text-blue-300 px-2 py-1 rounded">-{Number(loan.interest_rate).toFixed(2)}%</span>
            </div>
            <div className="mt-3 flex justify-between items-start text-sm">
                <div>
                    <span className="text-gray-400">Principal: {formatCurrency(loan.principal_amount)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-bold text-slate-200">Remaining: {formatCurrency(totalOutstanding)}</span>
                    <span className="text-[10px] text-slate-400 font-medium mt-0.5">Principal: {formatCurrency(remainingPrincipal)}</span>
                    <span className="text-[10px] text-slate-500 font-medium">Profit: {formatCurrency(Math.max(0, totalOutstanding - remainingPrincipal))}</span>
                </div>
            </div>

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
                        <p className="text-xs text-orange-300 bg-orange-900/20 px-2 py-1 rounded" title="Estimated at 2% of balance">Est: {formatCurrency(remainingPrincipal * 0.02)}</p>
                    )}
                </div>
            </div>

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
    const [loanForm, setLoanForm] = useState({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '', due_day: '' });

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
                monthly_payment: loanForm.monthly_payment ? parseFloat(loanForm.monthly_payment) : null,
                due_day: loanForm.due_day ? parseInt(loanForm.due_day) : null
            };

            if (editingId) {
                await axios.put(`${API_URL}/loans/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/loans/`, payload);
            }
            setShowLoanModal(false);
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '', due_day: '' });
            fetchLoans();
        } catch (err) { alert('Error saving loan'); }
    };

    const handleDeleteLoan = async (idOrEvent) => {
        let targetId = editingId;
        if (typeof idOrEvent === 'string') {
            targetId = idOrEvent;
        }

        if (!targetId) return;
        if (!confirm("Are you sure you want to delete this loan?")) return;
        try {
            await axios.delete(`${API_URL}/loans/${targetId}`);
            setShowLoanModal(false);
            setEditingId(null);
            fetchLoans();
        } catch (err) { alert('Error deleting loan'); }
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
                monthly_payment: loan.monthly_payment || '',
                due_day: loan.due_day || ''
            });
        } else {
            setEditingId(null);
            setLoanForm({ name: '', principal_amount: '', interest_rate: '', start_date: '', term_months: '', monthly_payment: '', due_day: '' });
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
                            <SortableLoanItem key={loan.id} loan={loan} openLoanModal={openLoanModal} deleteLoan={handleDeleteLoan} />
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

                        <div className="flex gap-4 items-center">
                            <div className="flex-1">
                                <label className="text-xs text-gray-400">Due Day (1-31)</label>
                                <input type="number" placeholder="27" min="1" max="31" className={inputClass} value={loanForm.due_day} onChange={e => setLoanForm({ ...loanForm, due_day: e.target.value })} />
                            </div>
                        </div>

                        <div className="flex gap-4 mt-6">
                            {editingId && (
                                <button type="button" onClick={() => handleDeleteLoan()} className="bg-red-900/50 text-red-400 p-2 rounded hover:bg-red-900 border border-red-800 flex-1">
                                    Delete
                                </button>
                            )}
                            <button type="submit" className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium flex-1">
                                Save Loan
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Loans;
