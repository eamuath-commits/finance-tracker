import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from './UI';
import { Search, X, Check, Link, Calendar, DollarSign, Filter, MessageSquare } from 'lucide-react';
import api from '../utils/api';

/**
 * TransactionSelectorModal - Modal for selecting and linking transactions
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onSelect - Callback with selected transaction IDs
 * @param {array} currentLinked - Already linked transaction IDs
 * @param {string} title - Modal title
 * @param {object} filters - Default filters (accountId, etc)
 */
export default function TransactionSelectorModal({
    isOpen,
    onClose,
    onSelect,
    currentLinked = [],
    title = "Link Transactions",
    filters: defaultFilters = {},
    expectedAmount = null
}) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(new Set(currentLinked));
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [expandedSms, setExpandedSms] = useState(null);
    const [filters, setFilters] = useState({
        accountId: defaultFilters.accountId || '',
        minAmount: '',
        maxAmount: '',
        startDate: '',
        endDate: '',
        type: ''
    });
    const [accounts, setAccounts] = useState([]);

    // Fetch accounts for filter dropdown
    useEffect(() => {
        if (isOpen) {
            api.get('/accounts/')
                .then(res => setAccounts(res.data))
                .catch(console.error);
        }
    }, [isOpen]);

    // Fetch transactions
    useEffect(() => {
        if (!isOpen) return;

        const fetchTransactions = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (searchQuery) params.set('query', searchQuery);
                if (filters.accountId) params.set('account_id', filters.accountId);
                if (filters.minAmount) params.set('min_amount', filters.minAmount);
                if (filters.maxAmount) params.set('max_amount', filters.maxAmount);
                if (filters.startDate) params.set('start_date', filters.startDate);
                if (filters.endDate) params.set('end_date', filters.endDate);
                if (filters.type) params.set('type', filters.type);
                params.set('limit', '50');

                const res = await api.get(`/transactions/search?${params}`);
                setTransactions(res.data);
            } catch (err) {
                console.error('Failed to fetch transactions:', err);
            } finally {
                setLoading(false);
            }
        };

        const debounce = setTimeout(fetchTransactions, 300);
        return () => clearTimeout(debounce);
    }, [isOpen, searchQuery, filters]);

    const toggleSelect = (txId) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(txId)) {
                next.delete(txId);
            } else {
                next.add(txId);
            }
            return next;
        });
    };

    const handleConfirm = () => {
        onSelect(Array.from(selected));
        onClose();
    };

    const formatAmount = (amount) => {
        const absAmount = Math.abs(amount);
        const formatted = new Intl.NumberFormat('en-SA', {
            style: 'currency',
            currency: 'SAR',
            minimumFractionDigits: 2
        }).format(absAmount);
        return amount < 0 ? `-${formatted}` : formatted;
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const newSelections = Array.from(selected).filter(id => !currentLinked.includes(id));

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
            <div className="flex flex-col h-[70vh]">
                {/* Search and Filters Header */}
                <div className="space-y-3 pb-4 border-b border-slate-700">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by merchant or notes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        {/* Amount filters always visible */}
                        <input
                            type="number"
                            placeholder="Min ر.س"
                            value={filters.minAmount}
                            onChange={(e) => setFilters(f => ({ ...f, minAmount: e.target.value }))}
                            className="w-24 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="number"
                            placeholder="Max ر.س"
                            value={filters.maxAmount}
                            onChange={(e) => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
                            className="w-24 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500"
                        />
                        <Button
                            variant={showFilters ? "primary" : "secondary"}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter className="w-4 h-4 mr-1" />
                            More
                        </Button>
                    </div>

                    {/* Expandable Filters */}
                    {showFilters && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                            <select
                                value={filters.accountId}
                                onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white"
                            >
                                <option value="">All Accounts</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>

                            <select
                                value={filters.type}
                                onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white"
                            >
                                <option value="">All Types</option>
                                <option value="credit">Credit (Income)</option>
                                <option value="debit">Debit (Expense)</option>
                            </select>

                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white"
                            />

                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white"
                            />

                            <Button
                                variant="ghost"
                                onClick={() => setFilters({
                                    accountId: '',
                                    minAmount: '',
                                    maxAmount: '',
                                    startDate: '',
                                    endDate: '',
                                    type: ''
                                })}
                            >
                                Clear All Filters
                            </Button>
                        </div>
                    )}
                </div>

                {/* Selection Summary */}
                {selected.size > 0 && (() => {
                    const selectedTotal = transactions
                        .filter(tx => selected.has(tx.id))
                        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
                    const diff = expectedAmount != null ? selectedTotal - expectedAmount : null;
                    return (
                        <div className="py-2 px-3 bg-blue-900/20 rounded-lg my-2 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-blue-300">
                                    {selected.size} transaction{selected.size > 1 ? 's' : ''} selected
                                    {newSelections.length > 0 && ` (${newSelections.length} new)`}
                                </span>
                                <span className="text-sm font-mono font-semibold text-emerald-400">
                                    {formatAmount(selectedTotal)}
                                </span>
                                {expectedAmount != null && (
                                    <span className="text-xs text-slate-400">
                                        / {formatAmount(expectedAmount)}
                                        {diff != null && Math.abs(diff) > 0.01 && (
                                            <span className={`ml-1 font-mono font-semibold ${diff > 0 ? 'text-red-400' : 'text-amber-400'}`}>
                                                ({diff > 0 ? '+' : ''}{formatAmount(diff)})
                                            </span>
                                        )}
                                        {diff != null && Math.abs(diff) <= 0.01 && (
                                            <span className="ml-1 text-emerald-400 font-semibold">✓</span>
                                        )}
                                    </span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelected(new Set(currentLinked))}
                            >
                                Reset
                            </Button>
                        </div>
                    );
                })()}

                {/* Transaction List */}
                <div className="flex-1 overflow-y-auto mt-2 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            No transactions found
                        </div>
                    ) : (
                        transactions.map(tx => {
                            const isSelected = selected.has(tx.id);
                            const isAlreadyLinked = currentLinked.includes(tx.id);
                            const hasOtherLink = tx.linked_to_payment_id || tx.linked_to_distribution_id;

                            return (
                                <div
                                    key={tx.id}
                                    className={`
                                        rounded-lg border transition-all
                                        ${isSelected
                                            ? 'border-blue-500 bg-blue-900/20'
                                            : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'
                                        }
                                    `}
                                >
                                    <div
                                        className="p-3 cursor-pointer"
                                        onClick={() => toggleSelect(tx.id)}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Checkbox */}
                                            <div className={`
                                                mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                                                ${isSelected
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-slate-600'
                                                }
                                            `}>
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </div>

                                            {/* Transaction Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-medium text-white truncate flex items-center gap-1.5">
                                                            {tx.merchant || 'Unknown'}
                                                            {tx.raw_sms_content && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedSms(prev => prev === tx.id ? null : tx.id);
                                                                    }}
                                                                    className="text-slate-500 hover:text-blue-400 transition p-0.5 rounded hover:bg-slate-600/50"
                                                                    title="View SMS"
                                                                >
                                                                    <MessageSquare size={13} />
                                                                </button>
                                                            )}
                                                        </p>
                                                        <p className="text-sm text-slate-500 truncate">
                                                            {tx.category || 'Uncategorized'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 ml-2">
                                                        <p className={`font-semibold font-mono ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {tx.type === 'credit' ? '+' : '-'}{formatAmount(tx.amount)}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {formatDate(tx.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Link Status Badges */}
                                                <div className="flex gap-2 mt-1">
                                                    {isAlreadyLinked && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-900/30 text-emerald-400">
                                                            <Link className="w-3 h-3 mr-1" /> Already linked
                                                        </span>
                                                    )}
                                                    {hasOtherLink && !isAlreadyLinked && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-900/30 text-yellow-400">
                                                            <Link className="w-3 h-3 mr-1" />
                                                            Linked to {tx.linked_to_payment_id ? 'Payment' : 'Distribution'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expandable SMS Content */}
                                    {expandedSms === tx.id && tx.raw_sms_content && (
                                        <div className="px-3 pb-3 border-t border-slate-700/50">
                                            <div className="bg-slate-900/80 rounded-lg p-2.5 mt-2">
                                                <div className="text-[9px] uppercase text-slate-500 font-bold mb-1 flex items-center gap-1">
                                                    <MessageSquare size={9} /> SMS Content
                                                </div>
                                                <p className="text-slate-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
                                                    {tx.raw_sms_content}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-700 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={newSelections.length === 0}
                    >
                        Link {newSelections.length > 0 ? `${newSelections.length} Transaction${newSelections.length > 1 ? 's' : ''}` : 'Transactions'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
