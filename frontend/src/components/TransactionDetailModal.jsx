import React from 'react';
import { Modal, formatCurrency } from './UI';
import { Calendar, CreditCard, Tag, FileText, ArrowUpRight, ArrowDownLeft, ExternalLink } from 'lucide-react';

/**
 * TransactionDetailModal - A reusable modal to display transaction details
 * Can be used from Distributions, Payments, or any component that needs to show transaction info
 */
const TransactionDetailModal = ({ isOpen, onClose, transaction }) => {
    if (!transaction) return null;

    const isCredit = transaction.type === 'credit';
    const formattedDate = transaction.timestamp
        ? new Date(transaction.timestamp).toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'Unknown';

    return (
        <Modal isOpen={isOpen} title="Transaction Details" onClose={onClose}>
            <div className="space-y-4">
                {/* Amount Header */}
                <div className={`p-4 rounded-xl text-center ${isCredit ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                        {isCredit ? (
                            <ArrowDownLeft className="text-emerald-400" size={20} />
                        ) : (
                            <ArrowUpRight className="text-red-400" size={20} />
                        )}
                        <span className={`text-xs font-bold uppercase tracking-wider ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {transaction.type}
                        </span>
                    </div>
                    <div className={`text-3xl font-mono font-bold ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isCredit ? '+' : '-'}{formatCurrency(transaction.amount)}
                    </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-3">
                    {/* Merchant */}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                        <FileText className="text-slate-400 mt-0.5" size={16} />
                        <div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Merchant</div>
                            <div className="text-white font-medium">{transaction.merchant || 'Unknown'}</div>
                        </div>
                    </div>

                    {/* Account */}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                        <CreditCard className="text-slate-400 mt-0.5" size={16} />
                        <div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Account</div>
                            <div className="text-white font-medium">{transaction.account_name || transaction.account_id || 'Unknown'}</div>
                        </div>
                    </div>

                    {/* Category */}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                        <Tag className="text-slate-400 mt-0.5" size={16} />
                        <div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Category</div>
                            <div className="text-white font-medium">{transaction.category || 'Uncategorized'}</div>
                        </div>
                    </div>

                    {/* Date */}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                        <Calendar className="text-slate-400 mt-0.5" size={16} />
                        <div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Date & Time</div>
                            <div className="text-white font-medium">{formattedDate}</div>
                        </div>
                    </div>

                    {/* Notes */}
                    {transaction.notes && (
                        <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                            <FileText className="text-slate-400 mt-0.5" size={16} />
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-bold">Notes</div>
                                <div className="text-white font-medium">{transaction.notes}</div>
                            </div>
                        </div>
                    )}

                    {/* Transaction ID */}
                    <div className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                        <ExternalLink className="text-slate-400 mt-0.5" size={16} />
                        <div>
                            <div className="text-xs text-slate-500 uppercase font-bold">Transaction ID</div>
                            <div className="text-purple-400 font-mono text-sm">{transaction.id}</div>
                        </div>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg text-sm font-medium transition"
                >
                    Close
                </button>
            </div>
        </Modal>
    );
};

export default TransactionDetailModal;
