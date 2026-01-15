import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal, formatCurrency, inputClass, selectClass } from '../components/UI';
import { Calendar, Trash2 } from 'lucide-react';
import ObligationsOverview from '../components/ObligationsOverview';
import ObligationsList from '../components/ObligationsList';
import ObligationsHistory from '../components/ObligationsHistory';

const Obligations = () => {
    const [obligations, setObligations] = useState([]);
    const [payments, setPayments] = useState({}); // Renamed from history
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewModeState] = useState(localStorage.getItem('obligationsViewMode') || 'overview');

    const setViewMode = (mode) => {
        setViewModeState(mode);
        localStorage.setItem('obligationsViewMode', mode);
    };

    // Month Navigation State
    const [monthOffset, setMonthOffset] = useState(0);

    // Calculate current view Date Label
    const currentDateView = (() => {
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        return target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    })();

    // Modal State
    const [showObligationModal, setShowObligationModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [selectedHistory, setSelectedHistory] = useState([]);
    const [viewingHistoryId, setViewingHistoryId] = useState(null);

    const [obligationForm, setObligationForm] = useState({ name: '', amount: '', due_day: '', category: '' });
    const [paymentForm, setPaymentForm] = useState({ id: null, amount: '', note: '', billing_month: new Date().toISOString().split('T')[0] });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchObligations = async () => {
        console.log("🚀 Starting fetchObligations...");
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            console.log(`✅ Fetched ${res.data.length} obligations.`);
            setObligations(res.data);

            const paymentsData = {};
            console.log("⏳ Fetching payments for each obligation...");

            await Promise.all(res.data.map(async (obl) => {
                try {
                    // Use new /payments endpoint
                    const hRes = await axios.get(`${API_URL}/obligations/${obl.id}/payments`);
                    paymentsData[obl.id] = hRes.data;
                } catch (hErr) {
                    console.error(`❌ Failed to fetch payments for ${obl.name} (${obl.id}):`, hErr);
                    paymentsData[obl.id] = [];
                }
            }));

            console.log("✅ Payments fetch complete:", paymentsData);
            setPayments(paymentsData);
        } catch (error) {
            console.error("❌ CRITICAL ERROR fetching obligations:", error);
        } finally {
            console.log("🏁 Loading finished.");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchObligations();
    }, []);

    const getMonthStatus = (obl, offset) => {
        const now = new Date();
        const cutoffDate = 23;

        let baseYear = now.getFullYear();
        let baseMonth = now.getMonth();

        // If today is before the 23rd, our "current" cycle is technically last month's cycle
        if (now.getDate() < cutoffDate) {
            baseMonth -= 1;
        }

        const targetDate = new Date(baseYear, baseMonth + offset, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();
        const billingDateStr = `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}-01`;

        const oblPayments = payments[obl.id] || [];
        const isMatch = (p, m, y) => {
            if (p.billing_month) {
                const [py, pm] = p.billing_month.split('-').map(Number);
                return (pm - 1) === m && py === y;
            }
            let d = new Date(p.payment_date);
            return d.getMonth() === m && d.getFullYear() === y;
        };

        const payment = oblPayments.find(p => isMatch(p, targetMonth, targetYear));
        let displayAmount = null;

        if (payment) {
            displayAmount = payment.amount;
        }

        // DEBUG LOGGING
        if (offset === 0 && obl.name === 'test') { // Targeted logging
            console.log(`🔍 Status for ${obl.name} (${billingDateStr}):`, {
                paymentFound: !!payment,
                paymentId: payment ? payment.id : 'null',
                status: payment ? payment.status : 'NO_RECORD'
            });
        }

        // Strict "Delete means Gone" logic:
        // If there is NO payment record, we return NO status (not Paid, not Unpaid).
        // It's just... empty/available.
        // Unless we want to show "Unpaid" ONLY if it's strictly due?
        // User said: "delete the history without making the history come back".
        // So: No Payment = No Status.

        return {
            label: targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            shortLabel: targetDate.toLocaleDateString('en-US', { month: 'short' }),
            billingDateStr,
            isPaid: payment && payment.status === 'PAID',
            amount: displayAmount, // Can be null
            paymentId: payment ? payment.id : null,
            status: payment ? payment.status : null // null status = "Nothing logged"
        };
    };

    const handleSaveObligation = async (e) => {
        e.preventDefault();
        const payload = {
            name: obligationForm.name,
            amount: obligationForm.amount ? parseFloat(obligationForm.amount) : null, // Send null if empty
            category: obligationForm.category,
            due_day: parseInt(obligationForm.due_day || 1)
        };

        try {
            if (editingId) {
                await axios.put(`${API_URL}/obligations/${editingId}`, payload);
            } else {
                await axios.post(`${API_URL}/obligations/`, payload);
            }
            setShowObligationModal(false);
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
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

    const openPaymentModal = (obl, targetMonthStr = null, defaultAmount = null, historyEntry = null) => {
        const now = new Date();
        const defaultMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;

        if (historyEntry) {
            setPaymentForm({
                id: obl.id,
                historyId: historyEntry.id,
                name: obl.name,
                amount: historyEntry.amount,
                note: historyEntry.note || "",
                billing_month: historyEntry.billing_month || targetMonthStr,
                status: historyEntry.status || "PAID"
            });
        } else if (obl) {
            setPaymentForm({
                id: obl.id,
                historyId: null,
                name: obl.name,
                amount: defaultAmount !== null ? defaultAmount : (obl.amount || ''), // Use empty string if no amount
                note: "Manual Payment",
                billing_month: targetMonthStr || defaultMonthStr,
                status: "PAID"
            });
        } else {
            // Completely New Payment (No Obligation Selected Yet)
            setPaymentForm({
                id: null,
                historyId: null,
                name: '',
                amount: '',
                note: "Manual Payment",
                billing_month: targetMonthStr || defaultMonthStr,
                status: "PAID"
            });
        }
        setShowPaymentModal(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!paymentForm.id) return;
        try {
            const payload = {
                payment_date: new Date().toISOString(),
                amount: parseFloat(paymentForm.amount || 0),
                billing_month: paymentForm.billing_month,
                note: paymentForm.note,
                status: paymentForm.status
            };

            if (paymentForm.historyId) {
                // Using legacy endpoint to route correctly in backend (or update logic to use /payments)
                // Backend still has the PUT /history route hooked up to update_payment
                await axios.put(`${API_URL}/obligations/history/${paymentForm.historyId}`, payload);
            } else {
                await axios.post(`${API_URL}/obligations/${paymentForm.id}/pay`, payload);
            }
            setShowPaymentModal(false);
            if (viewingHistoryId) {
                const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/payments`);
                setSelectedHistory(hRes.data);
            }
            fetchObligations();
        } catch (err) { alert("Error processing payment"); }
    };

    const handleAddPastPayment = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const bYear = formData.get('billing_year');
        const bMonthIndex = parseInt(formData.get('billing_month_idx')) + 1;
        const bMonthStr = `${bYear}-${bMonthIndex.toString().padStart(2, '0')}-01`;

        try {
            await axios.post(`${API_URL}/obligations/${viewingHistoryId}/pay`, {
                payment_date: new Date().toISOString(),
                amount: parseFloat(formData.get('amount') || 0),
                billing_month: bMonthStr,
                note: formData.get('note') || "Manual Payment Log"
            });
            const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/payments`);
            setSelectedHistory(hRes.data);
            fetchObligations();
            e.target.reset();
        } catch (err) { alert("Error adding record"); }
    };

    const handleDeleteHistory = async (historyId) => {
        console.log("🗑️ Request check to delete history ID:", historyId);

        // Check for "virtual" ID just in case
        if (historyId && typeof historyId === 'string' && historyId.startsWith('virtual-')) {
            console.warn("⚠️ Attempted to delete a VIRTUAL ID (Refusing):", historyId);
            alert("Cannot delete a non-existent (virtual) record. Please refresh functionality.");
            return;
        }

        // No more "Virtual" items. Since we only show real payments, we only delete real IDs.
        if (!confirm(`Delete payment record ID: ${historyId}?`)) return;
        try {
            console.log(`🚀 Sending DELETE request for ID: ${historyId}`);
            // Using legacy endpoint
            await axios.delete(`${API_URL}/obligations/history/${historyId}`);
            console.log("✅ Delete success.");
            if (viewingHistoryId) {
                const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/payments`);
                setSelectedHistory(hRes.data);
            }
            fetchObligations();
        } catch (err) {
            console.error("❌ Error deleting payment:", err);
            alert("Error deleting payment (Check console)");
        }
    };

    const openObligationModal = (obl = null) => {
        if (obl) {
            setEditingId(obl.id);
            setObligationForm({
                name: obl.name,
                amount: obl.amount || '', // Handle null amount
                due_day: obl.due_day,
                category: obl.category
            });
        } else {
            setEditingId(null);
            setObligationForm({ name: '', amount: '', due_day: '', category: '' });
        }
        setShowObligationModal(true);
    };

    const openHistory = (oblId) => {
        setViewingHistoryId(oblId);
        setSelectedHistory(payments[oblId] || []);
        setShowHistoryModal(true);
    };

    const currentHistoryObligation = obligations.find(o => o.id === viewingHistoryId) || {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    return (
        <div>
            {/* Header / Nav */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Obligations</h1>
                    <p className="text-gray-400 text-sm">Track monthly payments</p>
                </div>
                <div className="flex bg-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('overview')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'overview' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setViewMode('manager')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'manager' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Manager
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'history' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        Payments
                    </button>
                </div>

                {/* Month Navigation Controls */}
                {viewMode !== 'history' && (
                    <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg ml-4">
                        <button
                            onClick={() => setMonthOffset(prev => prev - 1)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <span className="text-xs font-mono font-bold text-white min-w-[100px] text-center">{currentDateView}</span>
                        <button
                            onClick={() => setMonthOffset(prev => prev + 1)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </button>
                        <button
                            onClick={() => setMonthOffset(0)}
                            className="bg-blue-900/40 text-blue-400 text-[10px] font-bold px-2 py-1 rounded hover:bg-blue-900/60 uppercase tracking-wider ml-1"
                            title="Reset to Current Month"
                        >
                            Today
                        </button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            {viewMode === 'overview' && (
                <ObligationsOverview
                    obligations={obligations}
                    getMonthStatus={getMonthStatus}
                    monthOffset={monthOffset}
                />
            )}

            {viewMode === 'manager' && (
                <div>
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => openObligationModal(null)}
                            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded shadow flex items-center gap-2 text-sm"
                        >
                            + Add New Obligation
                        </button>
                    </div>
                    <ObligationsList
                        obligations={obligations}
                        getMonthStatus={getMonthStatus}
                        openObligationModal={openObligationModal}
                        openPaymentModal={openPaymentModal}
                        openHistory={openHistory}
                        handleDeleteHistory={handleDeleteHistory}
                        monthOffset={monthOffset}
                    />
                </div>
            )}

            {viewMode === 'history' && (
                <ObligationsHistory
                    obligations={obligations}
                    history={payments} // Passing payments as history prop
                    onEdit={(item) => {
                        if (item) {
                            // Edit existing payment
                            const obl = obligations.find(o => o.id === item.obligation_id);
                            if (obl) openPaymentModal(obl, null, null, item);
                        } else {
                            // Add New Payment (Global)
                            openPaymentModal(null);
                        }
                    }}
                    onDelete={(item) => handleDeleteHistory(item.id)}
                />
            )}

            {/* --- MODALS --- */}

            {/* Payment Modal */}
            {showPaymentModal && (
                <Modal title={paymentForm.id ? `Pay: ${paymentForm.name}` : "Log New Payment"} onClose={() => setShowPaymentModal(false)}>
                    <form onSubmit={submitPayment} className="space-y-4">

                        {/* If ID is missing, show Dropdown to select Obligation */}
                        {!paymentForm.id ? (
                            <div className="bg-slate-700/50 p-3 rounded mb-4 border border-slate-600">
                                <label className="text-white text-xs uppercase font-bold mb-1 block">Select Obligation</label>
                                <select
                                    className={selectClass}
                                    onChange={(e) => {
                                        const selectedObl = obligations.find(o => o.id === e.target.value);
                                        if (selectedObl) {
                                            setPaymentForm(prev => ({
                                                ...prev,
                                                id: selectedObl.id,
                                                name: selectedObl.name,
                                                amount: selectedObl.amount || ''
                                            }));
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>-- Choose Obligation --</option>
                                    {obligations.sort((a, b) => a.name.localeCompare(b.name)).map(obl => (
                                        <option key={obl.id} value={obl.id}>{obl.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            // Helper text or mini-summary could go here
                            null
                        )}

                        <div className="bg-blue-900/20 p-3 rounded border border-blue-900/50 mb-4">
                            <p className="text-sm text-blue-200">Select Month</p>
                        </div>
                        <div>
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    className={`${selectClass} text-sm w-full`}
                                    value={parseInt(paymentForm.billing_month.split('-')[1]) - 1}
                                    onChange={e => {
                                        const parts = paymentForm.billing_month.split('-');
                                        const newMonth = (parseInt(e.target.value) + 1).toString().padStart(2, '0');
                                        setPaymentForm({ ...paymentForm, billing_month: `${parts[0]}-${newMonth}-01` });
                                    }}
                                >
                                    {months.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                                </select>
                                <select
                                    className={`${selectClass} text-sm w-full`}
                                    value={parseInt(paymentForm.billing_month.split('-')[0])}
                                    onChange={e => {
                                        const parts = paymentForm.billing_month.split('-');
                                        setPaymentForm({ ...paymentForm, billing_month: `${e.target.value}-${parts[1]}-01` });
                                    }}
                                >
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <input type="number" step="0.01" placeholder="Amount" className={inputClass} value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                            {/* If amount is empty, maybe show a hint if obligation has a default? */}
                        </div>
                        <div>
                            <input type="text" placeholder="Note" className={inputClass} value={paymentForm.note} onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
                            <div className="mt-2">
                                <label className="text-white text-xs uppercase font-bold mb-1 block">Status</label>
                                <select
                                    className={`${selectClass} w-full`}
                                    value={paymentForm.status}
                                    onChange={e => setPaymentForm({ ...paymentForm, status: e.target.value })}
                                >
                                    <option value="PAID">PAID</option>
                                    <option value="PENDING">UNPAID</option>
                                </select>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={!paymentForm.id}
                            className={`w-full p-3 rounded font-bold shadow-lg mt-4 ${!paymentForm.id ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                        >
                            Confirm
                        </button>
                    </form>
                </Modal>
            )}

            {/* Obligation Edit/Add Modal */}
            {showObligationModal && (
                <Modal title={editingId ? "Edit Obligation" : "Add Obligation"} onClose={() => setShowObligationModal(false)}>
                    <form onSubmit={handleSaveObligation} className="space-y-4">
                        <input type="text" placeholder="Name" required className={inputClass} value={obligationForm.name} onChange={e => setObligationForm({ ...obligationForm, name: e.target.value })} />
                        <input type="number" placeholder="Default Amount (Optional)" step="0.01" className={inputClass} value={obligationForm.amount} onChange={e => setObligationForm({ ...obligationForm, amount: e.target.value })} />
                        <input type="number" placeholder="Due Day (1-31)" min="1" max="31" required className={inputClass} value={obligationForm.due_day} onChange={e => setObligationForm({ ...obligationForm, due_day: e.target.value })} />
                        <select className={selectClass} value={obligationForm.category} onChange={e => setObligationForm({ ...obligationForm, category: e.target.value })}>
                            <option value="">Select Category...</option>
                            <option value="Salary">Salary</option>
                            <option value="House">House</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Food">Food & Groceries</option>
                            <option value="Transport">Transport</option>
                            <option value="Insurance">Insurance</option>
                            <option value="Subscription">Subscription</option>
                            <option value="Tech">Tech & Subscriptions</option>
                            <option value="Loan">Loan</option>
                            <option value="Auto Loan">Auto Loan</option>
                            <option value="Credit Card">Credit Card</option>
                            <option value="Pay Later">Pay Later</option>
                            <option value="Other">Other</option>
                        </select>
                        <div className="flex gap-2 mt-6">
                            <button type="submit" className="flex-1 bg-blue-600 text-white p-3 rounded font-bold shadow-lg">{editingId ? "Save" : "Create"}</button>
                            {editingId && <button type="button" onClick={handleDeleteObligation} className="bg-red-900/80 text-red-200 p-3 rounded font-bold"><Trash2 size={20} /></button>}
                        </div>
                    </form>
                </Modal>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <Modal title={`Payment History: ${currentHistoryObligation.name}`} onClose={() => setShowHistoryModal(false)}>
                    <div className="bg-slate-700/50 p-4 rounded-lg mb-6 border border-slate-600">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-blue-300 mb-2">Log Payment</h4>
                        <form onSubmit={handleAddPastPayment} className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 grid grid-cols-2 gap-2">
                                <select name="billing_month_idx" className={`${selectClass} text-sm w-full`} defaultValue={today.getMonth()}>
                                    {months.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                                </select>
                                <select name="billing_year" className={`${selectClass} text-sm w-full`} defaultValue={currentYear}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <input type="number" name="amount" defaultValue={currentHistoryObligation.amount || ''} placeholder="Amount" step="0.01" className={`${inputClass} text-sm`} />
                            <input type="text" name="note" placeholder="Note" className={`${inputClass} text-sm`} />
                            <button type="submit" className="col-span-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold py-2 rounded uppercase transition">+ Add Record</button>
                        </form>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {selectedHistory.map(h => (
                            <div key={h.id} className="bg-slate-800 p-3 rounded flex justify-between items-center border border-slate-700">
                                <div>
                                    <p className="text-white font-medium text-sm">
                                        {h.billing_month ? (() => {
                                            const [y, m] = h.billing_month.split('-').map(Number);
                                            return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                        })() : 'Auto Log'}
                                    </p>
                                    <p className={`text-xs font-bold ${h.status === 'PAID' ? 'text-green-400' : 'text-red-400'}`}>{h.status}</p>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <div className="flex items-center gap-3">
                                        <p className="text-green-400 font-bold text-sm">{formatCurrency(h.amount)}</p>
                                        <button onClick={() => handleDeleteHistory(h.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
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
