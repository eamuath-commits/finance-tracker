import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { CreditCard as CreditCardIcon, Plus, Edit3, Trash2, DollarSign, TrendingUp, Calendar, Percent, ChevronDown, ChevronUp } from "lucide-react";
import { Modal, formatCurrency, formatCurrencyText, inputClass, selectClass } from "../components/UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

// Get bank-specific card background image for credit cards
const getBankCardTheme = (bankName) => {
    if (!bankName) return null;
    const n = bankName.toLowerCase().replace(/\s+/g, '');

    // Alrajhi Bank Credit Card
    if (n.includes('rajhi') || n.includes('alrajhi')) {
        return { backgroundImage: '/banks/alrajhi-credit.png', textColor: 'text-white' };
    }
    // Jazira Bank Credit Card (AJB)
    if (n.includes('jazira') || n.includes('ajb')) {
        return { backgroundImage: '/banks/jazira-credit.png', textColor: 'text-white' };
    }

    return null;
};

const getUtilizationColor = (percent) => {
    if (percent >= 80) return { bar: 'bg-red-400', text: 'text-red-400' };
    if (percent >= 50) return { bar: 'bg-amber-400', text: 'text-amber-400' };
    return { bar: 'bg-emerald-400', text: 'text-emerald-400' };
};

// Credit Card Visual Component with custom bank themes
const CreditCardVisual = ({ card, onEdit, onPayment }) => {
    const utilPercent = card.credit_limit > 0
        ? Math.min(100, (Math.abs(card.current_balance) / card.credit_limit) * 100)
        : 0;
    const colors = getUtilizationColor(utilPercent);
    const bankTheme = getBankCardTheme(card.bank_name);
    const hasCustomBackground = !!bankTheme;

    return (
        <div
            className={`relative w-full aspect-[1.586/1] rounded-xl p-5 shadow-lg text-white overflow-hidden group hover:scale-[1.02] transition-all duration-300 border border-white/10 ${!hasCustomBackground ? 'bg-gradient-to-br from-violet-600 to-purple-900' : ''}`}
            style={hasCustomBackground ? {
                backgroundImage: `url(${bankTheme.backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            } : {}}
        >

            {/* Background Decor - only show for non-custom backgrounds */}
            {!hasCustomBackground && (
                <>
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/5 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-black/20 blur-3xl"></div>
                </>
            )}

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full justify-between">

                {/* Header - Card name only (no bank logo) */}
                <div className="flex justify-between items-start">
                    {hasCustomBackground ? (
                        // Custom background - just show card name
                        <div className="flex flex-col">
                            <span className="font-bold tracking-wide text-lg drop-shadow-md">{card.name}</span>
                        </div>
                    ) : (
                        // Fallback - show icon and names (no bank logo)
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md shadow-inner border border-white/5">
                                <CreditCardIcon className="w-5 h-5 text-violet-200" />
                            </div>
                            <div className="flex flex-col">
                                {card.bank_name && <span className="text-[10px] uppercase tracking-wider opacity-75 leading-tight">{card.bank_name}</span>}
                                <span className="font-bold tracking-wide text-base">{card.name}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons (hover) */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition z-20">
                    <button
                        onClick={(e) => { e.stopPropagation(); onPayment(card); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1.5 bg-emerald-500/80 hover:bg-emerald-500 rounded-full backdrop-blur-md transition"
                    >
                        <DollarSign size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1.5 bg-black/30 hover:bg-black/50 rounded-full backdrop-blur-md transition"
                    >
                        <Edit3 size={14} />
                    </button>
                </div>

                {/* Footer (Balance & Utilization with Visa Logo) */}
                <div>
                    <div className="flex justify-between items-end mb-1">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5 drop-shadow-sm">Balance Owed</p>
                            <p className="text-2xl font-bold tracking-tight text-white drop-shadow-md">{formatCurrency(card.current_balance)}</p>
                        </div>

                        {/* Right side: Visa Logo + Card Digits */}
                        <div className="text-right flex flex-col items-end gap-1">
                            <img src="/visa-logo.png" alt="Visa" className="h-6 w-auto object-contain drop-shadow-md" />
                            {card.last_4_digits && (
                                <span className="text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-sm">
                                    •••• {card.last_4_digits}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Utilization Bar */}
                    {card.credit_limit > 0 && (
                        <div className="mt-2">
                            <div className="flex justify-between text-[10px] opacity-70 mb-0.5 drop-shadow-sm">
                                <span>Credit Limit: {formatCurrency(card.credit_limit)}</span>
                                <span className={colors.text}>{utilPercent.toFixed(0)}% Used</span>
                            </div>
                            <div className="w-full bg-black/30 h-1.5 rounded-full overflow-hidden backdrop-blur-sm">
                                <div
                                    className={`h-full rounded-full shadow-sm transition-all duration-1000 ${colors.bar}`}
                                    style={{ width: `${utilPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Card Details Row */}
                    <div className="mt-3 flex gap-4 text-[10px] opacity-70 drop-shadow-sm">
                        {card.statement_day && (
                            <span className="flex items-center gap-1">
                                <Calendar size={10} /> Statement: Day {card.statement_day}
                            </span>
                        )}
                        {card.due_day && (
                            <span className="flex items-center gap-1">
                                <Calendar size={10} /> Due: Day {card.due_day}
                            </span>
                        )}
                        {card.apr && (
                            <span className="flex items-center gap-1">
                                <Percent size={10} /> {card.apr}% APR
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

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

    // Calculate totals
    const totalBalance = creditCards.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    const totalLimit = creditCards.reduce((sum, c) => sum + (c.credit_limit || 0), 0);
    const totalAvailable = creditCards.reduce((sum, c) => sum + (c.available_credit || 0), 0);
    const avgUtilization = totalLimit > 0 ? ((totalBalance / totalLimit) * 100).toFixed(0) : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <CreditCardIcon className="text-white" size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white">Credit Cards</h1>
                        <p className="text-gray-400">Manage your credit cards and track balances</p>
                    </div>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:from-purple-700 hover:to-pink-700 transition shadow-lg"
                >
                    <Plus size={20} /> Add Card
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                            <p className="text-blue-300 text-sm font-medium">Credit Limit</p>
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
                            <p className="text-emerald-300 text-sm font-medium">Available</p>
                            <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totalAvailable)}</p>
                        </div>
                        <div className="p-2 bg-emerald-600/20 rounded-lg">
                            <DollarSign className="text-emerald-400" size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-amber-600/20 to-amber-900/20 p-5 rounded-xl border border-amber-600/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-amber-300 text-sm font-medium">Utilization</p>
                            <p className="text-2xl font-bold text-white mt-1">{avgUtilization}%</p>
                        </div>
                        <div className="p-2 bg-amber-600/20 rounded-lg">
                            <Percent className="text-amber-400" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Credit Cards Grid */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {creditCards.map(card => (
                        <div key={card.id} className="space-y-2">
                            <CreditCardVisual
                                card={card}
                                onEdit={openEditModal}
                                onPayment={openPaymentModal}
                            />

                            {/* Transactions Toggle */}
                            <button
                                onClick={() => toggleExpand(card.id)}
                                className="w-full text-gray-400 hover:text-white text-sm flex items-center justify-center gap-1 py-2 hover:bg-slate-800/50 rounded-lg transition"
                            >
                                {expandedCard === card.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                {expandedCard === card.id ? 'Hide' : 'Show'} Transactions
                            </button>

                            {/* Transactions List */}
                            {expandedCard === card.id && (
                                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                                    {cardTransactions[card.id]?.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {cardTransactions[card.id].map(tx => (
                                                <div key={tx.id} className="flex justify-between items-center py-2 px-3 bg-slate-900/50 rounded-lg">
                                                    <div>
                                                        <p className="text-white text-sm">{tx.merchant}</p>
                                                        <p className="text-gray-500 text-xs">
                                                            {format(new Date(tx.timestamp), "MMM d, yyyy")}
                                                        </p>
                                                    </div>
                                                    <span className={`font-mono font-bold text-sm ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {tx.type === 'credit' ? '-' : '+'}{formatCurrency(tx.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 text-center py-4 text-sm">No transactions yet</p>
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
