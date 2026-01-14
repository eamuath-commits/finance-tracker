import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass, selectClass } from '../components/UI';
import { CheckCircle, XCircle, History, Calendar } from 'lucide-react';

const Obligations = () => {
    const [obligations, setObligations] = useState([]);
    const [history, setHistory] = useState({});
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showObligationModal, setShowObligationModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [selectedHistory, setSelectedHistory] = useState([]);
    const [viewingHistoryId, setViewingHistoryId] = useState(null); // Track which obligation's history we are viewing

    // Forms
    const [obligationForm, setObligationForm] = useState({ name: '', amount: '', due_day: '', category: '' });

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchObligations = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            setObligations(res.data);

            // Check history
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
    const isPaidThisMonth = (oblId) => {
        const payments = history[oblId] || [];
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        return payments.some(p => {
            const d = new Date(p.payment_date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
    };

    const getNextDueDate = (day) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const date = new Date(currentYear, currentMonth, day);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    };

    // --- Handlers ---
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
            fetchObligations();
        } catch (err) { alert('Error saving obligation'); }
    };

    const handleMarkPaid = async (obl) => {
        if (!confirm(`Mark ${obl.name} as paid for this month?`)) return;
        try {
            await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                payment_date: new Date().toISOString(),
                amount: obl.amount,
                note: "Manual entry - Paid Button"
            });
            fetchObligations();
        } catch (err) { alert("Error marking as paid"); }
    };

    const handleAddPastPayment = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            await axios.post(`${API_URL}/obligations/${viewingHistoryId}/pay`, {
                payment_date: new Date(formData.get('date')).toISOString(),
                amount: parseFloat(formData.get('amount')),
                note: formData.get('note') || "Manual Manual History Log"
            });

            // Refresh history view
            const hRes = await axios.get(`${API_URL}/obligations/${viewingHistoryId}/history`);
            setSelectedHistory(hRes.data);

            // Update main state
            setHistory(prev => ({ ...prev, [viewingHistoryId]: hRes.data }));

            // Reset form
            e.target.reset();
        } catch (err) {
            alert("Error adding historical record");
        }
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

    const openHistory = (oblId) => {
        setViewingHistoryId(oblId);
        setSelectedHistory(history[oblId] || []);
        setShowHistoryModal(true);
    };

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    const currentHistoryObligation = obligations.find(o => o.id === viewingHistoryId) || {};

    return (
        <div>
            {/* Header + Add Button */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Obligation Manager</h1>
                    <p className="text-gray-400">Track your recurring bills and payments.</p>
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
                    const paid = isPaidThisMonth(obl.id);
                    return (
                        <div key={obl.id} className={`relative group p-6 rounded-xl border ${paid ? 'bg-green-900/10 border-green-800' : 'bg-slate-800 border-slate-700'} shadow-lg flex justify-between items-center`}>

                            {/* Edit Icon */}
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition cursor-pointer bg-slate-900/50 p-1 rounded">
                                <EditIcon onClick={() => openObligationModal(obl)} />
                            </div>

                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold text-white">{obl.name}</h3>
                                    <span className="text-xs px-2 py-1 rounded bg-slate-700 text-gray-300">{obl.category || 'Uncategorized'}</span>
                                </div>
                                <p className="text-gray-400 mt-1">Due: <span className="text-white font-medium">{getNextDueDate(obl.due_day)}</span></p>
                                <p className="text-2xl font-bold text-white mt-2">{formatCurrency(obl.amount)}</p>
                            </div>

                            <div className="flex flex-col items-end gap-3 mt-4 mr-8">
                                {paid ? (
                                    <div className="flex items-center gap-2 text-green-400 bg-green-900/30 px-4 py-2 rounded-lg border border-green-900/50">
                                        <CheckCircle size={20} />
                                        <span className="font-bold">Paid</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleMarkPaid(obl)}
                                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition shadow"
                                    >
                                        <CheckCircle size={18} />
                                        Mark as Paid
                                    </button>
                                )}

                                <button onClick={() => openHistory(obl.id)} className="text-gray-400 hover:text-white text-sm flex items-center gap-1 group-hover:text-blue-300 transition">
                                    <History size={16} /> View History
                                </button>
                            </div>
                        </div>
                    );
                })}

                {obligations.length === 0 && (
                    <div className="text-center p-12 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                        <p className="text-gray-400 mb-4">You haven't added any obligations yet.</p>
                        <button onClick={() => openObligationModal(null)} className="text-blue-400 hover:text-blue-300 underline">Add your first bill</button>
                    </div>
                )}
            </div>

            {/* --- ADD/EDIT MODAL --- */}
            {showObligationModal && (
                <Modal title={editingId ? "Edit Obligation" : "Add Obligation"} onClose={() => setShowObligationModal(false)}>
                    <form onSubmit={handleSaveObligation} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Name</label>
                            <input type="text" placeholder="e.g. Rent, Netflix" required className={inputClass} value={obligationForm.name} onChange={e => setObligationForm({ ...obligationForm, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Amount</label>
                            <input type="number" placeholder="SAR" required step="0.01" className={inputClass} value={obligationForm.amount} onChange={e => setObligationForm({ ...obligationForm, amount: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs uppercase mb-1 block">Due Day of Month</label>
                            <input type="number" placeholder="Day (1-31)" required min="1" max="31" className={inputClass} value={obligationForm.due_day} onChange={e => setObligationForm({ ...obligationForm, due_day: e.target.value })} />
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
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-500 font-bold mt-4 shadow-lg">
                            {editingId ? "Save Changes" : "Create Obligation"}
                        </button>
                    </form>
                </Modal>
            )}

            {/* --- HISTORY MODAL --- */}
            {showHistoryModal && (
                <Modal title={`History: ${currentHistoryObligation.name}`} onClose={() => setShowHistoryModal(false)}>

                    {/* Add Past Record Form */}
                    <div className="bg-slate-700/50 p-4 rounded-lg mb-6 border border-slate-600">
                        <div className="flex items-center gap-2 mb-3 text-blue-300">
                            <Calendar size={16} />
                            <h4 className="text-sm font-bold uppercase tracking-wide">Log Past Payment</h4>
                        </div>
                        <form onSubmit={handleAddPastPayment} className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <input type="date" name="date" required className={`${inputClass} text-sm`} />
                            </div>
                            <div>
                                <input type="number" name="amount" defaultValue={currentHistoryObligation.amount} placeholder="Amount" step="0.01" required className={`${inputClass} text-sm`} />
                            </div>
                            <div>
                                <input type="text" name="note" placeholder="Note (Optional)" className={`${inputClass} text-sm`} />
                            </div>
                            <button type="submit" className="col-span-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold py-2 rounded uppercase tracking-wider transition">
                                + Add Record
                            </button>
                        </form>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        <h4 className="text-gray-400 text-xs uppercase font-bold mb-2 sticky top-0 bg-slate-800 py-1">Recorded Payments</h4>
                        {selectedHistory.map(h => (
                            <div key={h.id} className="bg-slate-800 p-3 rounded flex justify-between items-center border border-slate-700 hover:border-slate-500 transition">
                                <div>
                                    <p className="text-white font-medium text-sm">{new Date(h.payment_date).toLocaleDateString()}</p>
                                    <p className="text-xs text-gray-500">{h.note || 'No note'}</p>
                                </div>
                                <p className="text-green-400 font-bold text-sm">{formatCurrency(h.amount)}</p>
                            </div>
                        ))}
                        {selectedHistory.length === 0 && <p className="text-gray-500 text-center py-4 text-sm italic">No history recorded yet.</p>}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Obligations;
