import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, SectionHeader, Modal, EditIcon, formatCurrency, inputClass } from '../components/UI';
import { CheckCircle, XCircle, History } from 'lucide-react';

const Obligations = () => {
    const [obligations, setObligations] = useState([]);
    const [history, setHistory] = useState({}); // Map of obligation_id -> list of payments
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedHistory, setSelectedHistory] = useState([]);

    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchObligations = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            setObligations(res.data);

            // Fetch history for each obligation to determine current status
            // Note: This is N+1, ideally we'd have an endpoint returning status, but for now this works.
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

    const handleMarkPaid = async (obl) => {
        if (!confirm(`Mark ${obl.name} as paid for this month?`)) return;

        try {
            await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                payment_date: new Date().toISOString(),
                amount: obl.amount,
                note: "Manual entry"
            });
            fetchObligations(); // Refresh to update status
        } catch (err) {
            alert("Error marking as paid");
        }
    };

    const openHistory = (oblId) => {
        setSelectedHistory(history[oblId] || []);
        setShowHistoryModal(true);
    };

    if (loading) return <div className="p-10 text-white">Loading...</div>;

    return (
        <div>
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Obligation Manager</h1>
                <p className="text-gray-400">Track your recurring bills and payments.</p>
            </header>

            <div className="grid grid-cols-1 gap-6">
                {obligations.map(obl => {
                    const paid = isPaidThisMonth(obl.id);
                    return (
                        <div key={obl.id} className={`p-6 rounded-xl border ${paid ? 'bg-green-900/10 border-green-800' : 'bg-slate-800 border-slate-700'} shadow-lg flex justify-between items-center`}>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold text-white">{obl.name}</h3>
                                    <span className="text-xs px-2 py-1 rounded bg-slate-700 text-gray-300">{obl.category || 'Uncategorized'}</span>
                                </div>
                                <p className="text-gray-400 mt-1">Due day: <span className="text-white font-medium">{obl.due_day}th</span></p>
                                <p className="text-2xl font-bold text-white mt-2">{formatCurrency(obl.amount)}</p>
                            </div>

                            <div className="flex flex-col items-end gap-3">
                                {paid ? (
                                    <div className="flex items-center gap-2 text-green-400 bg-green-900/30 px-4 py-2 rounded-lg">
                                        <CheckCircle size={20} />
                                        <span className="font-bold">Paid This Month</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleMarkPaid(obl)}
                                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                                    >
                                        <CheckCircle size={18} />
                                        Mark as Paid
                                    </button>
                                )}

                                <button onClick={() => openHistory(obl.id)} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
                                    <History size={16} /> View History
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showHistoryModal && (
                <Modal title="Payment History" onClose={() => setShowHistoryModal(false)}>
                    <div className="max-h-96 overflow-y-auto space-y-3">
                        {selectedHistory.map(h => (
                            <div key={h.id} className="bg-slate-700 p-3 rounded flex justify-between items-center">
                                <div>
                                    <p className="text-white font-medium">{new Date(h.payment_date).toLocaleDateString()}</p>
                                    {h.note && <p className="text-xs text-gray-400">{h.note}</p>}
                                </div>
                                <p className="text-green-400 font-bold">{formatCurrency(h.amount)}</p>
                            </div>
                        ))}
                        {selectedHistory.length === 0 && <p className="text-gray-500 text-center">No history recorded.</p>}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Obligations;
