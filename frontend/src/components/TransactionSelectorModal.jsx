import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from './UI';
import { Search, X, Check, Link, Calendar, DollarSign, Filter } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
    filters: defaultFilters = {}
}) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(new Set(currentLinked));
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
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
            fetch(`${API_BASE}/accounts`)
                .then(res => res.json())
                .then(setAccounts)
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

                const res = await fetch(`${API_BASE}/transactions/search?${params}`);
                const data = await res.json();
                setTransactions(data);
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
                <div className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by merchant or notes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <Button
                            variant={showFilters ? "primary" : "secondary"}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter className="w-4 h-4 mr-1" />
                            Filters
                        </Button>
                    </div>

                    {/* Expandable Filters */}
                    {showFilters && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                            <select
                                value={filters.accountId}
                                onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                                <option value="">All Accounts</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>

                            <select
                                value={filters.type}
                                onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                                <option value="">All Types</option>
                                <option value="credit">Credit</option>
                                <option value="debit">Debit</option>
                            </select>

                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    placeholder="Min ر.س"
                                    value={filters.minAmount}
                                    onChange={(e) => setFilters(f => ({ ...f, minAmount: e.target.value }))}
                                    className="w-1/2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                />
                                <input
                                    type="number"
                                    placeholder="Max ر.س"
                                    value={filters.maxAmount}
                                    onChange={(e) => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
                                    className="w-1/2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                />
                            </div>

                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            />

                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
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
                                Clear Filters
                            </Button>
                        </div>
                    )}
                </div>

                {/* Selection Summary */}
                {selected.size > 0 && (
                    <div className="py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg my-2 flex justify-between items-center">
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                            {selected.size} transaction{selected.size > 1 ? 's' : ''} selected
                            {newSelections.length > 0 && ` (${newSelections.length} new)`}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(new Set(currentLinked))}
                        >
                            Reset
                        </Button>
                    </div>
                )}

                {/* Transaction List */}
                <div className="flex-1 overflow-y-auto mt-2 space-y-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
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
                                    onClick={() => toggleSelect(tx.id)}
                                    className={`
                                        p-3 rounded-lg border cursor-pointer transition-all
                                        ${isSelected
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }
                                    `}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Checkbox */}
                                        <div className={`
                                            mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                                            ${isSelected
                                                ? 'bg-blue-500 border-blue-500'
                                                : 'border-gray-300 dark:border-gray-600'
                                            }
                                        `}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>

                                        {/* Transaction Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                        {tx.merchant || 'Unknown'}
                                                    </p>
                                                    <p className="text-sm text-gray-500 truncate">
                                                        {tx.category || 'Uncategorized'}
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-2">
                                                    <p className={`font-semibold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                                        {tx.type === 'credit' ? '+' : '-'}{formatAmount(tx.amount)}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {formatDate(tx.timestamp)}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Link Status Badges */}
                                            <div className="flex gap-2 mt-1">
                                                {isAlreadyLinked && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                        <Link className="w-3 h-3 mr-1" /> Already linked
                                                    </span>
                                                )}
                                                {hasOtherLink && !isAlreadyLinked && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                                        <Link className="w-3 h-3 mr-1" />
                                                        Linked to {tx.linked_to_payment_id ? 'Payment' : 'Distribution'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
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
