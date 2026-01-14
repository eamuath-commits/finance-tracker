import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass, selectClass } from '../components/UI';
import { CheckCircle, XCircle, History, Calendar, Trash2, ArrowRight } from 'lucide-react';

const Obligations = () => {
    const [obligations, setObligations] = useState([]);
    const [history, setHistory] = useState({});
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showObligationModal, setShowObligationModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false); // NEW: Custom Payment Modal

    const [editingId, setEditingId] = useState(null);
    const [selectedHistory, setSelectedHistory] = useState([]);
    const [viewingHistoryId, setViewingHistoryId] = useState(null);

    // Forms
    const [obligationForm, setObligationForm] = useState({ name: '', amount: '', due_date: '', category: '' });
    const [paymentForm, setPaymentForm] = useState({ id: null, amount: '', note: '', billing_month: '' });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchObligations = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            setObligations(res.data);

            const historyData = {};
            await Promise.all(res.data.map(async (obl) => {
                const hRes = await axios.get(`${API_URL}/obligations/${obl.id}/history`);
                historyData[obl.id] = hRes.data;
            }));
            setHistory(historyData);
        } catch (error) {
            console.error("Error fetching obligations", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchObligations();
    }, []);

    // --- Helpers ---
    const getMonthStatus = (oblId, offset) => {
        const today = new Date();
        const targetDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        const payments = history[oblId] || [];
        const payment = payments.find(p => {
            // Check billing_month if available, else fallback to payment_date
            let cycleDate = p.billing_month ? new Date(p.billing_month) : new Date(p.payment_date);
            return cycleDate.getMonth() === targetMonth && cycleDate.getFullYear() === targetYear;
        });

        return {
            label: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            shortLabel: targetDate.toLocaleDateString('en-US', { month: 'short' }),
            monthIndex: targetMonth, // For comparison
            isPaid: !!payment,
            amount: payment ? payment.amount : null,
            date: payment ? payment.payment_date : null,
            paymentId: payment ? payment.id : null // Captured ID for deletion
        };
    };

    const getNextDueDate = (day) => {
        if (!day) return "Not set";
        const now = new Date();
        const date = new Date(now.getFullYear(), now.getMonth(), day);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // --- Handlers ---
    const handleSaveObligation = async (e) => {
        e.preventDefault();

        let due_day_val = 1;
        if (obligationForm.due_date) {
            const parts = obligationForm.due_date.split('-');
            if (parts.length === 3) due_day_val = parseInt(parts[2]);
        }

        const payload = {
            name: obligationForm.name,
            amount: parseFloat(obligationForm.amount || 0), // Allow 0/Empty
            category: obligationForm.category,
            due_day: due_day_val
        };

        try {
            if (editingId) {
                await axios.put(`${API_URL}/obligations/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/obligations/`, payload);
            }
            setShowObligationModal(false);
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_date: '', category: '' });
            fetchObligations();
        } catch (err) { alert('Error saving obligation'); }
    };

    const handleDeleteObligation = async () => {
        if (!editingId) return;
        if (!confirm("Are you sure?")) return;
        try {
            await axios.delete(`${API_URL}/obligations/${editingId}`);
            setShowObligationModal(false);
            setEditingId(null);
            fetchObligations();
        } catch (err) { alert('Error deleting'); }
    };

    // Open Custom Payment Modal
    const openPaymentModal = (obl) => {
        const now = new Date();
        // Default billing month: Current month
        // Or if due_day is < 10, assume user might want previous month?
        // Let's just default to current month YYYY-MM-01

        let initialMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Smart Logic: If Due Day is early (e.g. 4th) and Today is early (e.g. 5th),
        // user MIGHT mean "Last Month's Bill". But safer to let user switch manually.

        const monthStr = `${initialMonth.getFullYear()}-${(initialMonth.getMonth() + 1).toString().padStart(2, '0')}-01`;

        setPaymentForm({
            id: obl.id,
            name: obl.name,
            amount: obl.amount,
            note: "Manual Payment",
            billing_month: monthStr // YYYY-MM-01 format for date input
        });
        setShowPaymentModal(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!paymentForm.id) return;

        try {
            await axios.post(`${API_URL}/obligations/${paymentForm.id}/pay`, {
                payment_date: new Date().toISOString(),
                amount: parseFloat(paymentForm.amount || 0), // Allow empty -> 0
                billing_month: new Date(paymentForm.billing_month).toISOString(), // Send YYYY-MM-01
                note: paymentForm.note
            });
            setShowPaymentModal(false);
            fetchObligations(); // Refreshes everything
        } catch (err) { alert("Error processing payment"); }
    };

    const handleAddPastPayment = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const pDate = new Date(formData.get('date'));

        // Construct Billing Month from Selects
        const bYear = parseInt(formData.get('billing_year'));
        const bMonthIndex = parseInt(formData.get('billing_month_idx'));
        const bMonth = new Date(bYear, bMonthIndex, 1);

        try {
            await axios.post(`${API_URL}/obligations/${viewingHistoryId}/pay`, {
                payment_date: pDate.toISOString(),
                amount: parseFloat(formData.get('amount') || 0),
                billing_month: bMonth.toISOString(),
                note: formData.get('note') || "Manual History Log"
            });
            // Refresh local history view + global
            const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
            setSelectedHistory(hRes.data);
            fetchObligations();
            e.target.reset();
        } catch (err) { alert("Error adding record"); }
    };

    const handleDeleteHistory = async (historyId) => {
        if (!confirm("Are you sure you want to delete this payment record?")) return;
        try {
            await axios.delete(`${API_URL}/obligations/history/${historyId}`);

            // Refresh modal if open
            if (viewingHistoryId) {
                const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
                setSelectedHistory(hRes.data);
            }
            // Refresh global state (Important for dashboard cards)
            fetchObligations();
        } catch (err) { alert("Error deleting history"); }
    };

    const openObligationModal = (obl = null) => {
        if (obl) {
            setEditingId(obl.id);
            const now = new Date();
            const dayStr = obl.due_day.toString().padStart(2, '0');
            const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
            setObligationForm({
                name: obl.name,
                amount: obl.amount,
                due_date: `${now.getFullYear()}-${monthStr}-${dayStr}`,
                category: obl.category
            });
        } else {
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_date: '', category: '' });
        }
        setShowObligationModal(true);
    };

    const openHistory = (oblId) => {
        setViewingHistoryId(oblId);
        setSelectedHistory(history[oblId] || []);
        setShowHistoryModal(true);
    };

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    const currentHistoryObligation = obligations.find(o => o.id === viewingHistoryId) || {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Obligation Manager</h1>
                    <p className="text-gray-400">Track bills via Billing Cycles.</p>
                </div>
                <button
                    onClick={() => openObligationModal(null)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg flex items-center gap-2 transition"
                >
                    <span className="text-xl">+</span> Add New
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {obligations.map(obl => {
                    const prevMonth = getMonthStatus(obl.id, -1);
                    const currMonth = getMonthStatus(obl.id, 0);
                    const nextMonth = getMonthStatus(obl.id, 1);

                    return (
                        <div key={obl.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg group relative">
                            {/* Card Header */}
                            <div className="bg-slate-900/50 p-4 border-b border-slate-700 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold text-white">{obl.name}</h3>
                                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-gray-400">{obl.category}</span>
                                    </div>
                                    <p className="text-sm text-gray-400 mt-1">Due Day: <span className="text-gray-300">{obl.due_day}th</span></p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => openHistory(obl.id)} className="text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1">
                                        <History size={14} /> History
                                    </button>
                                    <EditIcon onClick={() => openObligationModal(obl)} className="text-gray-500 hover:text-white cursor-pointer" size={18} />
                                </div>
                            </div>

                            {/* 3-Month View Grid */}
                            <div className="grid grid-cols-3 divide-x divide-slate-700">
                                {/* Previous Month */}
                                <div className="p-4 flex flex-col items-center text-center opacity-70 hover:opacity-100 transition">
                                    <span className="text-xs uppercase font-bold text-gray-500 mb-2">{prevMonth.shortLabel}</span>
                                    {prevMonth.isPaid ? (
                                        <div className="text-green-400 flex flex-col items-center">
                                            <CheckCircle size={20} className="mb-1" />
                                            <span className="font-bold text-lg">{formatCurrency(prevMonth.amount)}</span>
                                        </div>
                                    ) : (
                                        <div className="text-gray-500 flex flex-col items-center">
                                            <XCircle size={20} className="mb-1" />
                                            <span className="text-sm">Unpaid</span>
                                        </div>
                                    )}
                                </div>

                                {/* Current Month */}
                                <div className="p-4 flex flex-col items-center text-center bg-slate-700/20 relative group/current">
                                    <span className="text-xs uppercase font-bold text-blue-300 mb-2">{currMonth.shortLabel}</span>
                                    {currMonth.isPaid ? (
                                        <div className="text-green-400 flex flex-col items-center animate-in fade-in zoom-in duration-300 relative">
                                            <CheckCircle size={28} className="mb-2" />
                                            <span className="font-bold text-2xl">{formatCurrency(currMonth.amount)}</span>
                                            <span className="text-xs bg-green-900/30 px-2 py-0.5 rounded text-green-300 mt-1">Paid</span>

                                            {/* Unpay / Delete Button - Shows on Hover */}
                                            <button
                                                onClick={() => handleDeleteHistory(currMonth.paymentId)}
                                                className="absolute -top-1 -right-8 opacity-0 group-hover/current:opacity-100 transition text-red-400 bg-slate-900/80 p-1.5 rounded-full hover:bg-slate-900 border border-slate-700 shadow-xl"
                                                title="Delete this payment"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center w-full">
                                            <span className="text-2xl font-bold text-white mb-1">{formatCurrency(obl.amount)}</span>
                                            <p className="text-xs text-red-300 mb-3 font-medium">Due: {getNextDueDate(obl.due_day)}</p>
                                            <button onClick={() => openPaymentModal(obl)} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2 px-4 rounded shadow-lg flex justify-center items-center gap-2 transition transform hover:scale-105">
                                                <CheckCircle size={16} /> Pay Now
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Next Month */}
                                <div className="p-4 flex flex-col items-center text-center opacity-70 hover:opacity-100 transition">
                                    <span className="text-xs uppercase font-bold text-gray-500 mb-2">{nextMonth.shortLabel}</span>
                                    <div className="flex flex-col items-center text-gray-400">
                                        <ArrowRight size={20} className="mb-1 text-slate-600" />
                                        <span className="font-bold text-lg text-gray-300">{formatCurrency(obl.amount)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- PAYMENT MODAL --- */}
            {showPaymentModal && (
                <Modal title={`Pay Bill: ${paymentForm.name}`} onClose={() => setShowPaymentModal(false)}>
                    <form onSubmit={submitPayment} className="space-y-4">
                        <div className="bg-blue-900/20 p-3 rounded border border-blue-900/50 mb-4">
                            <p className="text-sm text-blue-200">Select which <strong>Month</strong> you are paying for.</p>
                        </div>

                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">For Month</label>
                            <div className="flex gap-1">
                                <select
                                    className={`${selectClass} text-sm flex-1`}
                                    value={new Date(paymentForm.billing_month).getMonth()}
                                    onChange={e => {
                                        const d = new Date(paymentForm.billing_month);
                                        d.setMonth(parseInt(e.target.value));
                                        // Keep day as 1 just to be safe
                                        d.setDate(1);
                                        setPaymentForm({ ...paymentForm, billing_month: d.toISOString().split('T')[0] });
                                    }}
                                >
                                    {months.map((m, idx) => (
                                        <option key={idx} value={idx}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    className={`${selectClass} text-sm w-24`}
                                    value={new Date(paymentForm.billing_month).getFullYear()}
                                    onChange={e => {
                                        const d = new Date(paymentForm.billing_month);
                                        d.setFullYear(parseInt(e.target.value));
                                        setPaymentForm({ ...paymentForm, billing_month: d.toISOString().split('T')[0] });
                                    }}
                                >
                                    {years.map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Amount</label>
                            <input type="number" step="0.01" className={inputClass} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                            <p className="text-xs text-gray-500 mt-1">Optional. Leave empty for 0.</p>
                        </div>

                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Note</label>
                            <input type="text" className={inputClass} value={paymentForm.note} onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
                        </div>

                        <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded font-bold shadow-lg mt-4">
                            Confirm Payment
                        </button>
                    </form>
                </Modal>
            )}

            {/* Obligation Modal (Edit/Add) */}
            {showObligationModal && (
                <Modal title={editingId ? "Edit Obligation" : "Add Obligation"} onClose={() => setShowObligationModal(false)}>
                    <form onSubmit={handleSaveObligation} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Name</label>
                            <input type="text" placeholder="e.g. Rent" required className={inputClass} value={obligationForm.name} onChange={e => setObligationForm({ ...obligationForm, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Amount</label>
                            <input type="number" placeholder="SAR" step="0.01" className={inputClass} value={obligationForm.amount} onChange={e => setObligationForm({ ...obligationForm, amount: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Due Date</label>
                            <input type="date" required className={inputClass} value={obligationForm.due_date} onChange={e => setObligationForm({ ...obligationForm, due_date: e.target.value })} />
                            <p className="text-xs text-gray-500 mt-1">We repeat this obligation monthly on this <strong>Day</strong>.</p>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Category</label>
                            <select className={selectClass} value={obligationForm.category} onChange={e => setObligationForm({ ...obligationForm, category: e.target.value })}>
                                <option value="">Select Category...</option>
                                <option value="Housing">Housing</option>
                                <option value="Utilities">Utilities</option>
                                <option value="Food">Food & Groceries</option>
                                <option value="Transport">Transport</option>
                                <option value="Insurance">Insurance</option>
                                <option value="Tech">Tech & Subscriptions</option>
                                <option value="Loan">Loan Repayment</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button type="submit" className="flex-1 bg-blue-600 text-white p-3 rounded hover:bg-blue-500 font-bold shadow-lg">{editingId ? "Save Changes" : "Create"}</button>
                            {editingId && <button type="button" onClick={handleDeleteObligation} className="bg-red-900/80 text-red-200 p-3 rounded hover:bg-red-800 font-bold"><Trash2 size={20} /></button>}
                        </div>
                    </form>
                </Modal>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <Modal title={`History: ${currentHistoryObligation.name}`} onClose={() => setShowHistoryModal(false)}>
                    <div className="bg-slate-700/50 p-4 rounded-lg mb-6 border border-slate-600">
                        <div className="flex items-center gap-2 mb-3 text-blue-300">
                            <Calendar size={16} />
                            <h4 className="text-sm font-bold uppercase tracking-wide">Log Payment Record</h4>
                        </div>
                        <form onSubmit={handleAddPastPayment} className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] uppercase text-gray-400 block mb-1">Payment Date</label>
                                <input type="date" name="date" required className={`${inputClass} text-sm`} />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-gray-400 block mb-1">For Month</label>
                                <div className="flex gap-1">
                                    <select name="billing_month_idx" className={`${selectClass} text-sm flex-1`} defaultValue={today.getMonth()}>
                                        {months.map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                        ))}
                                    </select>
                                    <select name="billing_year" className={`${selectClass} text-sm w-20`} defaultValue={currentYear}>
                                        {years.map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="col-span-2 grid grid-cols-2 gap-3">
                                <div><input type="number" name="amount" defaultValue={currentHistoryObligation.amount} placeholder="Amount" step="0.01" className={`${inputClass} text-sm`} /></div>
                                <div><input type="text" name="note" placeholder="Note (Optional)" className={`${inputClass} text-sm`} /></div>
                            </div>

                            <button type="submit" className="col-span-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold py-2 rounded uppercase tracking-wider transition">+ Add Record</button>
                        </form>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {selectedHistory.map(h => (
                            <div key={h.id} className="bg-slate-800 p-3 rounded flex justify-between items-center border border-slate-700">
                                <div>
                                    <p className="text-white font-medium text-sm">{new Date(h.payment_date).toLocaleDateString()}</p>
                                    <p className="text-[10px] text-gray-400">Month: {h.billing_month ? new Date(h.billing_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Auto'}</p>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <div className="flex items-center gap-3">
                                        <p className="text-green-400 font-bold text-sm">{formatCurrency(h.amount)}</p>
                                        <button onClick={() => handleDeleteHistory(h.id)} className="text-slate-500 hover:text-red-400 transition" title="Delete Record">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {h.note && <p className="text-xs text-gray-500">{h.note}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Obligations;
