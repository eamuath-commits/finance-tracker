import React, { useState, useEffect } from 'react';
import { Modal, formatCurrency, inputClass, selectClass } from './UI';

const PaymentModal = ({ isOpen, onClose, obligation, initialDate, initialAmount, existingPayment, onSave }) => {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // Generate years (Current - 1 to Current + 1)
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    const [form, setForm] = useState({
        historyId: null,
        amount: '',
        note: '',
        status: 'PAID',
        billing_month: new Date().toISOString().split('T')[0] // Default YYYY-MM-DD
    });

    useEffect(() => {
        if (isOpen && obligation) {
            // Edit mode only when editing a REAL recorded payment (historyId),
            // not merely because an obligation is selected.
            if (existingPayment && existingPayment.historyId) {
                setForm({
                    historyId: existingPayment.historyId,
                    amount: existingPayment.amount,
                    note: existingPayment.note || '',
                    status: existingPayment.status || 'PAID',
                    billing_month: existingPayment.billing_month || initialDate || new Date().toISOString().split('T')[0]
                });
            } else {
                // Create Mode
                setForm({
                    historyId: null,
                    amount: initialAmount !== null ? initialAmount : '',
                    note: '',
                    status: 'PAID',
                    billing_month: initialDate || new Date().toISOString().split('T')[0]
                });
            }
        }
    }, [isOpen, obligation, initialDate, initialAmount, existingPayment]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    if (!isOpen) return null;

    // Helper to split date YYYY-MM-DD
    const getYear = () => form.billing_month.split('-')[0];
    const getMonthIdx = () => parseInt(form.billing_month.split('-')[1]) - 1;

    const handleDateChange = (type, value) => {
        const parts = form.billing_month.split('-');
        let y = parts[0];
        let m = parts[1];
        let d = parts[2] || '01';

        if (type === 'year') y = value;
        if (type === 'month') m = (parseInt(value) + 1).toString().padStart(2, '0');

        setForm({ ...form, billing_month: `${y}-${m}-${d}` });
    };

    return (
        <Modal isOpen={true} title={form.historyId ? `Edit Payment: ${obligation.name}` : `Pay: ${obligation.name}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">

                {/* Summary / Tip */}
                <div className="bg-blue-900/20 p-3 rounded border border-blue-900/50 mb-4">
                    <p className="text-sm text-blue-200">
                        {form.historyId ? "Updating existing payment record." : `Recording payment for ${obligation.name}.`}
                    </p>
                </div>

                {/* Date Selection */}
                <div>
                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Billing Month</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                            className={`${selectClass} text-sm w-full`}
                            value={getMonthIdx()}
                            onChange={(e) => handleDateChange('month', e.target.value)}
                        >
                            {months.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                        </select>
                        <select
                            className={`${selectClass} text-sm w-full`}
                            value={getYear()}
                            onChange={(e) => handleDateChange('year', e.target.value)}
                        >
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>

                {/* Amount */}
                <div>
                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Amount</label>
                    <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        className={inputClass}
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        required
                    />
                </div>

                {/* Note */}
                <div>
                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Note (Optional)</label>
                    <input
                        type="text"
                        placeholder="e.g. Transaction #123"
                        className={inputClass}
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                    />
                </div>

                {/* Status */}
                <div>
                    <label className="text-xs uppercase font-bold text-gray-500 mb-1 block">Status</label>
                    <select
                        className={`${selectClass} w-full`}
                        value={form.status}
                        onChange={e => setForm({ ...form, status: e.target.value })}
                    >
                        <option value="PAID">PAID</option>
                        <option value="BUDGET">BUDGET</option>
                    </select>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    className="w-full p-3 rounded font-bold shadow-lg mt-4 bg-green-600 hover:bg-green-500 text-white transition"
                >
                    {form.historyId ? "Update Payment" : "Confirm Payment"}
                </button>
            </form>
        </Modal>
    );
};

export default PaymentModal;
