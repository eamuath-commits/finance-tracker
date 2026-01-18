import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, LayoutList, Calendar, Loader } from 'lucide-react';
import ObligationsTable from '../components/ObligationsTable';
import PaymentModal from '../components/PaymentModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ObligationsNew = () => {
    const [obligations, setObligations] = useState([]);
    const [payments, setPayments] = useState({});
    const [loading, setLoading] = useState(true);
    const [monthOffset, setMonthOffset] = useState(() => {
        const saved = localStorage.getItem('obligationsMonthOffset');
        return saved ? parseInt(saved, 10) : 0;
    });

    // ... (Reuse Payment Logic from Obligations.jsx?)
    //Ideally we should extract the data fetching hook to avoid duplication,
    // but for now I will duplicate the minimal fetch logic to keep it isolated.

    const fetchObligations = async () => {
        try {
            const res = await axios.get(`${API_URL}/obligations/`);
            const fetchedObligations = res.data;

            // Fetch payments for ALL obligations
            const paymentsMap = {};
            await Promise.all(fetchedObligations.map(async (obl) => {
                const histRes = await axios.get(`${API_URL}/obligations/${obl.id}/history`);
                paymentsMap[obl.id] = histRes.data;
            }));

            // Sort by category then name
            const sorted = fetchedObligations.sort((a, b) => a.category.localeCompare(b.category));

            setObligations(sorted);
            setPayments(paymentsMap);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchObligations();
    }, []);

    useEffect(() => {
        localStorage.setItem('obligationsMonthOffset', monthOffset);
    }, [monthOffset]);


    // --- Helper Logic (Duplicated from Obligations.jsx) ---
    const getMonthStatus = (obl, offset = 0) => {
        const date = new Date();
        date.setMonth(date.getMonth() + offset);
        const monthStr = date.toISOString().slice(0, 7); // YYYY-MM
        const billingDateStr = `${monthStr}-${String(obl.due_day).padStart(2, '0')}`;
        const shortLabel = date.toLocaleString('default', { month: 'short' });

        const history = payments[obl.id] || [];
        // Match logic: Same YYYY-MM
        const match = history.find(h => {
            const hMonth = h.billing_month || h.payment_date.slice(0, 7);
            return hMonth === monthStr;
        });

        if (match) {
            return {
                status: match.status || 'PAID', // Default to PAID if missing
                isPaid: (match.status || 'PAID') === 'PAID',
                amount: match.amount,
                paymentId: match.id,
                date: match.payment_date,
                shortLabel,
                billingDateStr
            };
        }

        return {
            status: 'UNPAID',
            isPaid: false,
            amount: null,
            paymentId: null,
            shortLabel,
            billingDateStr
        };
    };

    // --- Actions ---
    const [selectedObligation, setSelectedObligation] = useState(null);
    const [modalData, setModalData] = useState(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const openPaymentModal = (obl, billingDate, amount, existingPayment = null) => {
        setSelectedObligation(obl);
        setModalData({
            billingDate,
            amount: amount || obl.amount,
            existingPayment // Pass if editing
        });
        setIsPaymentModalOpen(true);
    };

    const handleSavePayment = async (paymentData) => {
        try {
            await axios.post(`${API_URL}/obligations/${selectedObligation.id}/pay`, paymentData);
            await fetchObligations(); // Refresh
            setIsPaymentModalOpen(false);
        } catch (error) {
            console.error("Payment failed", error);
            alert("Failed to save payment");
        }
    };

    const handleQuickPay = async (oblId, amount, billingDate, status = "PAID") => {
        try {
            await axios.post(`${API_URL}/obligations/${oblId}/pay`, {
                amount: parseFloat(amount),
                payment_date: new Date().toISOString(),
                billing_month: billingDate.slice(0, 7), // YYYY-MM
                status: status
            });
            await fetchObligations();
        } catch (error) {
            console.error("Quick pay failed", error);
        }
    };

    // --- Date Navigation ---
    const currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() + monthOffset);
    const currentMonthLabel = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    if (loading) return <div className="flex h-screen items-center justify-center text-slate-500"><Loader className="animate-spin" /></div>;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto pb-24">

            {/* Header & Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <LayoutList className="text-blue-400" />
                        Obligations Manager <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">New View</span>
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Manage monthly bills in a compact list.</p>
                </div>

                <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button onClick={() => setMonthOffset(m => m - 1)} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-4 py-1 text-center min-w-[140px]">
                        <span className="text-sm font-bold text-white block">{currentMonthLabel}</span>
                    </div>
                    <button onClick={() => setMonthOffset(m => m + 1)} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Main Table Content */}
            <ObligationsTable
                obligations={obligations}
                getMonthStatus={getMonthStatus}
                monthOffset={monthOffset}
                openPaymentModal={openPaymentModal}
                handleQuickPay={handleQuickPay}
            />

            {/* Payment Modal (Reused) */}
            {isPaymentModalOpen && selectedObligation && (
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    obligation={selectedObligation}
                    initialDate={modalData.billingDate}
                    initialAmount={modalData.amount}
                    existingPayment={modalData.existingPayment} // Pass existing payment data
                    onSave={handleSavePayment}
                />
            )}
        </div>
    );
};

export default ObligationsNew;
