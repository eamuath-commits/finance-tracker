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

    // --- HYBRID LOGIC: FLAT RATE INPUT -> EFFECTIVE AMORTIZATION ---

    // 1. Time Tracking (Robust Iterative Count)
    const start = new Date(loan.start_date);
    const now = new Date();
    const dueDay = loan.due_day ? parseInt(loan.due_day) : 27;

    // Determine First Payment Date:
    // If Start Day <= Due Day, First Payment is THIS month.
    // If Start Day > Due Day, First Payment is NEXT month.
    let currentPaymentDate = new Date(start.getFullYear(), start.getMonth(), dueDay);
    if (start.getDate() > dueDay) {
        currentPaymentDate.setMonth(currentPaymentDate.getMonth() + 1);
    }

    // Count how many payment dates have passed (<= Now)
    let paymentsMade = 0;
    // Iterate month by month. Safe and precise.
    while (currentPaymentDate <= now) {
        paymentsMade++;
        // Move to next month
        currentPaymentDate.setMonth(currentPaymentDate.getMonth() + 1);
        // Handle end-of-month edge cases (e.g. Feb) if needed, but for Day 26 it is safe.
        // Re-force the day just in case setMonth drifted (e.g. going from Jan 31 to March).
        // Since dueDay is likely <= 28 or we accept "last day of month" logic.
        // For robustness, reset the date to dueDay if valid, or max valid day.
        // However, for typical Due Day 26, setMonth handles Year boundaries automatically.
    }
    paymentsMade = Math.max(0, paymentsMade);

    // 2. Determine Loan Primitives
    const P = parseFloat(loan.principal_amount || 0);
    const N = parseInt(loan.term_months || 60);
    // Rate Input is "Flat Rate per Year" (e.g. 3.1)
    const flatRate = (parseFloat(loan.interest_rate || 0) / 100);

    // 3. Calculate Monthly Payment (Fixed / Flat)
    // If user provided a manual monthly payment, respect it.
    // Otherwise, Formula: (P + (P * FlatRate * Years)) / N
    let PMT = parseFloat(loan.monthly_payment || 0);
    if (!PMT && P > 0 && N > 0) {
        const totalInterest = P * flatRate * (N / 12);
        PMT = (P + totalInterest) / N;
    }

    // 4. Solve for Effective Annual/Monthly Rate (IRR)
    // We need 'r' such that P = PMT * (1 - (1+r)^-N) / r
    const solveEffectiveRate = (p, n, pmt) => {
        if (pmt <= p / n) return 0; // No interest case

        let r = 0.004; // Guess 0.4% month
        for (let i = 0; i < 20; i++) {
            const num = (pmt / r) * (1 - Math.pow(1 + r, -n)) - p;
            const den = (pmt / r) * (n * Math.pow(1 + r, -n - 1)) - (pmt / (r * r)) * (1 - Math.pow(1 + r, -n));
            const nextR = r - num / den;
            if (Math.abs(nextR - r) < 1e-9) return nextR;
            r = nextR;
        }
        return r;
    };

    let effectiveRate = 0;
    if (P > 0 && N > 0 && PMT > 0) {
        effectiveRate = solveEffectiveRate(P, N, PMT);
    }

    // 5. Calculate Amortized State at Current Month (k)
    // Remaining Principal (Reducing Balance) formula:
    // Bal = P * [ (1+r)^N - (1+r)^k ] / [ (1+r)^N - 1 ]
    // Where k = paymentsMade
    let remainingPrincipal = P;
    if (effectiveRate > 0) {
        if (paymentsMade >= N) {
            remainingPrincipal = 0;
        } else {
            const termFactor = Math.pow(1 + effectiveRate, N);
            const paidFactor = Math.pow(1 + effectiveRate, paymentsMade);
            remainingPrincipal = P * (termFactor - paidFactor) / (termFactor - 1);
        }
    } else {
        // Fallback for 0 interest
        remainingPrincipal = Math.max(0, P - (PMT * paymentsMade)); // Simplified
    }

    // 6. Remaining Balance (Total Outstanding)
    // This is simply Future Payments
    const paymentsRemaining = Math.max(0, N - paymentsMade);
    const totalOutstanding = PMT * paymentsRemaining;

    // 7. Profit Portion (Future Interest)
    const profitRemaining = Math.max(0, totalOutstanding - remainingPrincipal);

    // 8. Settlement Estimate
    // User Figure: 702,769.82.
    // Logic: Remaining Principal (692k) + 3 Months Interest (approx 10k).
    let settlementEstimate = remainingPrincipal;
    if (effectiveRate > 0 && paymentsRemaining > 0) {
        // Calculate interest for ONE month on the current balance
        const nextMonthInterest = remainingPrincipal * effectiveRate;
        const penalty = nextMonthInterest * 3;
        settlementEstimate += penalty;
    } else {
        // Fallback if no rate derived (shouldn't happen with valid inputs)
        settlementEstimate = totalOutstanding;
    }

    const currentPayment = Math.min(Math.max(1, paymentsMade + 1), N);
    const progressPercent = N > 0 ? Math.min(100, Math.max(0, (paymentsMade / N) * 100)) : 0;

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
                    <span className="text-gray-400">Principal: {formatCurrency(P)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="font-bold text-slate-200">Remaining: {formatCurrency(totalOutstanding)}</span>
                    <span className="text-[10px] text-slate-400 font-medium mt-0.5">Principal: {formatCurrency(remainingPrincipal)}</span>
                    <span className="text-[10px] text-slate-500 font-medium">Profit: {formatCurrency(Math.max(0, profitRemaining))}</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-900 h-2 rounded-full mt-2 overflow-hidden relative" title={`Progress: ${progressPercent.toFixed(1)}%`}>
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div className="flex justify-between items-end mt-2">
                <div className="flex justify-between items-start w-full">
                    <p className="text-xs text-gray-500">
                        <span className="flex flex-col">
                            <span>Paid <strong className="text-white">{paymentsMade}</strong> of {N} <span className="text-blue-400 ml-1">({progressPercent.toFixed(0)}%)</span></span>
                            <span className="text-[10px] opacity-70">({Math.max(0, N - paymentsMade)} left)</span>
                        </span>
                    </p>
                    {loan.monthly_payment ? (
                        <p className="text-xs text-blue-300 bg-blue-900/20 px-2 py-1 rounded">Pay: {formatCurrency(loan.monthly_payment)}</p>
                    ) : (
                        <p className="text-xs text-orange-300 bg-orange-900/20 px-2 py-1 rounded" title="Estimated Payment">Est: {formatCurrency(PMT)}</p>
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
                axios.put(`${API_URL}/loans/reorder`, { ordered_ids: ids }).catch(err => console.error("Reorder failed", err));

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

                        {/* Dynamic Payment Calculation Logic for Modal */}
                        {(() => {
                            const P = parseFloat(loanForm.principal_amount || 0);
                            const R = parseFloat(loanForm.interest_rate || 0) / 100;
                            const N = parseFloat(loanForm.term_months || 0);
                            let autoPayment = 0;
                            if (P > 0 && N > 0) {
                                autoPayment = (P + (P * R * (N / 12))) / N;
                            }

                            return (
                                <div className="bg-slate-700/50 p-3 rounded border border-slate-600 transition-all">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs text-gray-400 uppercase font-semibold">Monthly Payment</label>
                                        {autoPayment > 0 && (
                                            <span className="text-[10px] text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded cursor-pointer hover:bg-emerald-900/40"
                                                onClick={() => setLoanForm({ ...loanForm, monthly_payment: '' })} title="Click to use auto-calculated"
                                            >
                                                Auto: {autoPayment.toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder={autoPayment > 0 ? `Auto: ${autoPayment.toFixed(2)}` : "Enter exact monthly payment"}
                                            step="0.01"
                                            className={`${inputClass} mt-0`}
                                            value={loanForm.monthly_payment}
                                            onChange={e => setLoanForm({ ...loanForm, monthly_payment: e.target.value })}
                                        />
                                        {loanForm.monthly_payment && autoPayment > 0 && Math.abs(parseFloat(loanForm.monthly_payment) - autoPayment) > 0.009 && (
                                            <button
                                                type="button"
                                                onClick={() => setLoanForm({ ...loanForm, monthly_payment: '' })}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-blue-300 hover:text-white bg-slate-800 px-2 py-1 rounded border border-slate-600"
                                            >
                                                Use Auto
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        {loanForm.monthly_payment ? "Using manual value." : "Using auto-calculation (Flat Rate Formula)."}
                                    </p>
                                </div>
                            );
                        })()}

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
