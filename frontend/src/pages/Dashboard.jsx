import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Analytics from '../Analytics';
import { Card, SectionHeader, Modal, formatCurrency, inputClass } from '../components/UI';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

const AllocationCard = ({ analysis }) => {
    if (!analysis) return null;

    const isDanger = analysis.freedom_cash < 0;
    const colorClass = isDanger ? "bg-red-900/20 border-red-800" : "bg-green-900/20 border-green-800";
    const textClass = isDanger ? "text-red-400" : "text-green-400";

    return (
        <div className={`p-6 rounded-xl border ${colorClass} backdrop-blur-sm h-full`}>
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

const RecentTransactionsWidget = ({ transactions, openTransactionModal }) => (
    <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden h-full">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-white">Recent Transactions</h3>
            {transactions.length > 5 && (
                <button onClick={() => window.location.href = '/transactions'} className="text-xs text-blue-400 hover:text-blue-300">View All</button>
            )}
        </div>
        <table className="min-w-full divide-y divide-slate-700">
            <tbody className="divide-y divide-slate-700">
                {transactions.slice(0, 5).map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                            <div className="flex flex-col">
                                <span className="font-medium">{tx.merchant}</span>
                                {tx.category && <span className="text-xs text-gray-500">{tx.category}</span>}
                            </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-red-400">
                            {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                            <button onClick={() => openTransactionModal(tx)} className="text-gray-500 hover:text-white">✏️</button>
                        </td>
                    </tr>
                ))}
                {transactions.length === 0 && (
                    <tr><td colSpan="3" className="px-6 py-8 text-center text-gray-500 italic">No transactions yet.</td></tr>
                )}
            </tbody>
        </table>
    </div>
);

const SortableWidget = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group mb-8">
            {/* Drag Handle - Visible on Hover/Touch */}
            <div {...attributes} {...listeners} className="absolute top-2 right-2 z-20 p-1.5 cursor-grab bg-slate-900/80 rounded-md text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white touch-none">
                <GripVertical size={16} />
            </div>
            {children}
        </div>
    );
};

const Dashboard = () => {
    const [obligations, setObligations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [transactionForm, setTransactionForm] = useState({ category: '' });

    // Dashboard State
    const [widgetOrder, setWidgetOrder] = useState(() => {
        const saved = localStorage.getItem('dashboard_layout');
        return saved ? JSON.parse(saved) : ['allocation', 'analytics', 'transactions'];
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setWidgetOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('dashboard_layout', JSON.stringify(newOrder));
                return newOrder;
            });
        }
    };

    // Allow overriding API URL via environment variable for remote development
    const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

    const fetchData = async () => {
        try {
            const [oblRes, txRes, analysisRes] = await Promise.all([
                axios.get(`${API_URL}/obligations/`),
                axios.get(`${API_URL}/transactions/`),
                axios.get(`${API_URL}/analysis/allocation`)
            ]);
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

    const handleSaveTransaction = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/transactions/${editingId}`, transactionForm);
            setShowTransactionModal(false);
            setEditingId(null);
            fetchData();
        } catch (err) { alert('Error updating transaction'); }
    };

    const openTransactionModal = (tx) => {
        setEditingId(tx.id);
        setTransactionForm({ category: tx.category || '' });
        setShowTransactionModal(true);
    };

    if (loading) return <div className="p-10 text-center text-white">Loading Dashboard...</div>;

    return (
        <div>
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Overview</h1>
                <p className="text-gray-400">Welcome back, Muath</p>
            </header>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
                    {widgetOrder.map(id => {
                        if (id === 'allocation') {
                            return (
                                <SortableWidget key={id} id={id}>
                                    <AllocationCard analysis={analysis} />
                                </SortableWidget>
                            );
                        }
                        if (id === 'analytics') {
                            return (
                                <SortableWidget key={id} id={id}>
                                    <Analytics transactions={transactions} obligations={obligations} />
                                </SortableWidget>
                            );
                        }
                        if (id === 'transactions') {
                            return (
                                <SortableWidget key={id} id={id}>
                                    <RecentTransactionsWidget transactions={transactions} openTransactionModal={openTransactionModal} />
                                </SortableWidget>
                            );
                        }
                        return null;
                    })}
                </SortableContext>
            </DndContext>

            {showTransactionModal && (
                <Modal title="Edit Transaction" onClose={() => setShowTransactionModal(false)}>
                    <form onSubmit={handleSaveTransaction} className="space-y-4">
                        <p className="text-gray-400 text-sm mb-2">Assign a category to this transaction.</p>
                        <input type="text" placeholder="Category (e.g. Food, Transport)" className={inputClass} value={transactionForm.category} onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })} />
                        <div className="flex gap-2 flex-wrap">
                            {['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Credit Card Payment', 'Obligation'].map(cat => (
                                <button key={cat} type="button" onClick={() => setTransactionForm({ ...transactionForm, category: cat })} className="bg-slate-700 text-xs px-2 py-1 rounded text-gray-300 hover:bg-slate-600 border border-slate-600">
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium">Save Changes</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
