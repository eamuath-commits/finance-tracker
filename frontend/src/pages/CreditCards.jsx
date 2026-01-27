import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { CreditCard as CreditCardIcon, Plus, Edit3, Trash2, DollarSign, TrendingUp, Calendar, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { Modal, formatCurrency, formatCurrencyText, inputClass, selectClass } from "../components/UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

function CreditCards() {
    const [creditCards, setCreditCards] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingCard, setEditingCard] = useState(null);
    const [expandedCard, setExpandedCard] = useState(null);
    const [cardTransactions, setCardTransactions] = useState({});

    // Payment Modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentCard, setPaymentCard] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentFromAccount, setPaymentFromAccount] = useState('');

    const [cardForm, setCardForm] = useState({
        name: '',
        bank_name: '',
        last_4_digits: '',
        credit_limit: '',
        statement_day: '',
        due_day: '',
        apr: '',
        notes: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [cardsRes, accRes] = await Promise.all([
                axios.get(`${API_URL}/credit-cards/`),
                axios.get(`${API_URL}/accounts/`)
            ]);
            setCreditCards(cardsRes.data);
            setAccounts(accRes.data);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCardTransactions = async (cardId) => {
        try {
            const res = await axios.get(`${API_URL}/credit-cards/${cardId}/transactions`);
            setCardTransactions(prev => ({ ...prev, [cardId]: res.data }));
        } catch (err) {
            console.error("Error fetching transactions:", err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...cardForm,
                credit_limit: parseFloat(cardForm.credit_limit) || 0,
                statement_day: cardForm.statement_day ? parseInt(cardForm.statement_day) : null,
                due_day: cardForm.due_day ? parseInt(cardForm.due_day) : null,
                apr: cardForm.apr ? parseFloat(cardForm.apr) : null
            };

            if (editingCard) {
                await axios.put(`${API_URL}/credit-cards/${editingCard.id}`, payload);
            } else {
                await axios.post(`${API_URL}/credit-cards/`, payload);
            }
            setShowModal(false);
            resetForm();
            fetchData();
        } catch (err) {
            console.error("Error saving card:", err);
            alert(err.response?.data?.detail || "Error saving credit card");
        }
    };

    const handleDelete = async (cardId) => {
        if (!confirm("Delete this credit card? All associated transactions will be orphaned.")) return;
        try {
            await axios.delete(`${API_URL}/credit-cards/${cardId}`);
            fetchData();
        } catch (err) {
            console.error("Error deleting card:", err);
            alert("Failed to delete credit card");
        }
    };

    const handlePayment = async (e) => {
        e.preventDefault();
        if (!paymentCard || !paymentAmount) return;
        try {
            const url = `${API_URL}/credit-cards/${paymentCard.id}/payment?amount=${paymentAmount}${paymentFromAccount ? `&from_account_id=${paymentFromAccount}` : ''}`;
            await axios.post(url);
            setShowPaymentModal(false);
            setPaymentCard(null);
            setPaymentAmount('');
            setPaymentFromAccount('');
            fetchData();
        } catch (err) {
            console.error("Error recording payment:", err);
            alert(err.response?.data?.detail || "Failed to record payment");
        }
    };

    const openEditModal = (card) => {
        setEditingCard(card);
        setCardForm({
            name: card.name,
            bank_name: card.bank_name || '',
            last_4_digits: card.last_4_digits || '',
            credit_limit: card.credit_limit?.toString() || '',
            statement_day: card.statement_day?.toString() || '',
            due_day: card.due_day?.toString() || '',
            apr: card.apr?.toString() || '',
            notes: card.notes || ''
        });
        setShowModal(true);
    };

    const openPaymentModal = (card) => {
        setPaymentCard(card);
        setPaymentAmount('');
        setPaymentFromAccount('');
        setShowPaymentModal(true);
    };

    const resetForm = () => {
        setEditingCard(null);
        setCardForm({
            name: '', bank_name: '', last_4_digits: '', credit_limit: '',
            statement_day: '', due_day: '', apr: '', notes: ''
        });
    };

    const toggleExpand = async (cardId) => {
        if (expandedCard === cardId) {
            setExpandedCard(null);
        } else {
            setExpandedCard(cardId);
            if (!cardTransactions[cardId]) {
                await fetchCardTransactions(cardId);
            }
        }
    };

    const getUtilizationColor = (percent) => {
        if (percent >= 80) return 'text-red-400';
        if (percent >= 50) return 'text-amber-400';
        return 'text-emerald-400';
    };

    const getUtilizationBarColor = (percent) => {
        if (percent >= 80) return 'bg-red-500';
        if (percent >= 50) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    // Calculate totals
    const totalBalance = creditCards.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    const totalLimit = creditCards.reduce((sum, c) => sum + (c.credit_limit || 0), 0);
    const totalAvailable = creditCards.reduce((sum, c) => sum + (c.available_credit || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white">Credit Cards</h1>
                    <p className="text-gray-400">Manage your credit cards and track balances</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:from-purple-700 hover:to-pink-700 transition shadow-lg"
                >
                    <Plus size={20} /> Add Credit Card
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-red-600/20 to-red-900/20 p-5 rounded-xl border border-red-600/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-red-300 text-sm font-medium">Total Balance</p>
                            <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalBalance)}</p>
                        </div>
                        <div className="p-2 bg-red-600/20 rounded-lg">
                            <TrendingUp className="text-red-400" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 p-5 rounded-xl border border-blue-600/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-blue-300 text-sm font-medium">Total Credit Limit</p>
                            <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalLimit)}</p>
                        </div>
                        <div className="p-2 bg-blue-600/20 rounded-lg">
                            <CreditCardIcon className="text-blue-400" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-900/20 p-5 rounded-xl border border-emerald-600/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-emerald-300 text-sm font-medium">Available Credit</p>
                            <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalAvailable)}</p>
                        </div>
                        <div className="p-2 bg-emerald-600/20 rounded-lg">
                            <DollarSign className="text-emerald-400" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Credit Cards List */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : creditCards.length === 0 ? (
                <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
                    <CreditCardIcon className="mx-auto text-gray-500 mb-4" size={48} />
                    <p className="text-gray-400">No credit cards added yet</p>
                    <button
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="mt-4 text-purple-400 hover:text-purple-300"
                    >
                        Add your first credit card
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {creditCards.map(card => (
                        <div key={card.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                            {/* Card Header */}
                            <div className="p-5">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
                                            <CreditCardIcon className="text-white" size={28} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white">{card.name}</h3>
                                            <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                                                {card.bank_name && <span>{card.bank_name}</span>}
                                                {card.last_4_digits && <span className="font-mono">•••• {card.last_4_digits}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openPaymentModal(card)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
                                        >
                                            <DollarSign size={14} /> Pay
                                        </button>
                                        <button onClick={() => openEditModal(card)} className="text-gray-400 hover:text-white p-1.5 hover:bg-slate-700 rounded">
                                            <Edit3 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(card.id)} className="text-red-400 hover:text-red-300 p-1.5 hover:bg-slate-700 rounded">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Balance & Utilization */}
                                <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wider">Balance</p>
                                        <p className="text-xl font-bold text-red-400">{formatCurrency(card.current_balance)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wider">Credit Limit</p>
                                        <p className="text-xl font-bold text-white">{formatCurrency(card.credit_limit)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wider">Available</p>
                                        <p className="text-xl font-bold text-emerald-400">{formatCurrency(card.available_credit)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wider">Utilization</p>
                                        <p className={`text-xl font-bold ${getUtilizationColor(card.utilization_percent)}`}>
                                            {card.utilization_percent}%
                                        </p>
                                    </div>
                                </div>

                                {/* Utilization Bar */}
                                <div className="mt-4">
                                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${getUtilizationBarColor(card.utilization_percent)} transition-all`}
                                            style={{ width: `${Math.min(card.utilization_percent, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Card Details */}
                                <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-400">
                                    {card.statement_day && (
                                        <div className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            Statement: Day {card.statement_day}
                                        </div>
                                    )}
                                    {card.due_day && (
                                        <div className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            Due: Day {card.due_day}
                                        </div>
                                    )}
                                    {card.apr && (
                                        <div className="flex items-center gap-1">
                                            <Percent size={14} />
                                            APR: {card.apr}%
                                        </div>
                                    )}
                                </div>

                                {/* Expand Button */}
                                <button
                                    onClick={() => toggleExpand(card.id)}
                                    className="mt-4 text-gray-400 hover:text-white text-sm flex items-center gap-1"
                                >
                                    {expandedCard === card.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    {expandedCard === card.id ? 'Hide' : 'Show'} Transactions
                                </button>
                            </div>

                            {/* Transactions Section */}
                            {expandedCard === card.id && (
                                <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                                    {cardTransactions[card.id]?.length > 0 ? (
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                            {cardTransactions[card.id].map(tx => (
                                                <div key={tx.id} className="flex justify-between items-center py-2 px-3 bg-slate-800 rounded-lg">
                                                    <div>
                                                        <p className="text-white text-sm">{tx.merchant}</p>
                                                        <p className="text-gray-500 text-xs">
                                                            {format(new Date(tx.timestamp), "MMM d, yyyy HH:mm")}
                                                        </p>
                                                    </div>
                                                    <span className={`font-mono font-bold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {tx.type === 'credit' ? '-' : '+'}{formatCurrency(tx.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 text-center py-4">No transactions yet</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingCard ? "Edit Credit Card" : "Add Credit Card"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Card Name *</label>
                        <input
                            type="text"
                            value={cardForm.name}
                            onChange={e => setCardForm({ ...cardForm, name: e.target.value })}
                            className={inputClass}
                            placeholder="e.g., Riyad Bank Visa"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Bank Name</label>
                            <input
                                type="text"
                                value={cardForm.bank_name}
                                onChange={e => setCardForm({ ...cardForm, bank_name: e.target.value })}
                                className={inputClass}
                                placeholder="e.g., Riyad Bank"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Last 4 Digits</label>
                            <input
                                type="text"
                                value={cardForm.last_4_digits}
                                onChange={e => setCardForm({ ...cardForm, last_4_digits: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                className={inputClass}
                                placeholder="1234"
                                maxLength={4}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Credit Limit</label>
                        <input
                            type="number"
                            value={cardForm.credit_limit}
                            onChange={e => setCardForm({ ...cardForm, credit_limit: e.target.value })}
                            className={inputClass}
                            placeholder="50000"
                            step="0.01"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Statement Day</label>
                            <input
                                type="number"
                                value={cardForm.statement_day}
                                onChange={e => setCardForm({ ...cardForm, statement_day: e.target.value })}
                                className={inputClass}
                                placeholder="1-28"
                                min="1"
                                max="28"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Due Day</label>
                            <input
                                type="number"
                                value={cardForm.due_day}
                                onChange={e => setCardForm({ ...cardForm, due_day: e.target.value })}
                                className={inputClass}
                                placeholder="1-28"
                                min="1"
                                max="28"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">APR (%)</label>
                        <input
                            type="number"
                            value={cardForm.apr}
                            onChange={e => setCardForm({ ...cardForm, apr: e.target.value })}
                            className={inputClass}
                            placeholder="24.99"
                            step="0.01"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                        <textarea
                            value={cardForm.notes}
                            onChange={e => setCardForm({ ...cardForm, notes: e.target.value })}
                            className={inputClass}
                            rows={2}
                            placeholder="Optional notes..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-gray-400 hover:text-white">
                            Cancel
                        </button>
                        <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg">
                            {editingCard ? "Save Changes" : "Add Card"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Payment Modal */}
            <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title={`Pay ${paymentCard?.name}`}>
                <form onSubmit={handlePayment} className="space-y-4">
                    <div className="bg-slate-700/50 p-4 rounded-lg">
                        <p className="text-gray-400 text-sm">Current Balance</p>
                        <p className="text-2xl font-bold text-red-400">{formatCurrency(paymentCard?.current_balance || 0)}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Payment Amount *</label>
                        <input
                            type="number"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            className={inputClass}
                            placeholder="Enter amount"
                            step="0.01"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Pay From Account (Optional)</label>
                        <select
                            value={paymentFromAccount}
                            onChange={e => setPaymentFromAccount(e.target.value)}
                            className={selectClass}
                        >
                            <option value="">Manual / External Payment</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrencyText(acc.current_balance)})</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">If selected, a debit transaction will be created on the account</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">
                            Cancel
                        </button>
                        <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg">
                            Record Payment
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default CreditCards;
