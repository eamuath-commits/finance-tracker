import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link2, Unlink, Trash2, ChevronDown, ChevronRight, Check, ExternalLink } from 'lucide-react';
import { formatCurrency } from './UI';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const PayrollTransfers = ({ accounts, currentMonth }) => {
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [matches, setMatches] = useState({});
    const [loadingMatches, setLoadingMatches] = useState({});

    useEffect(() => {
        fetchTransfers();
    }, [currentMonth]);

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const params = currentMonth ? { billing_month: currentMonth } : {};
            const res = await axios.get(`${API_URL}/payroll-transfers`, { params });
            setTransfers(res.data);
        } catch (error) {
            console.error("Failed to fetch payroll transfers:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMatches = async (transferId) => {
        setLoadingMatches(prev => ({ ...prev, [transferId]: true }));
        try {
            const res = await axios.get(`${API_URL}/payroll-transfers/${transferId}/matches`);
            setMatches(prev => ({ ...prev, [transferId]: res.data }));
        } catch (error) {
            console.error("Failed to fetch matches:", error);
        } finally {
            setLoadingMatches(prev => ({ ...prev, [transferId]: false }));
        }
    };

    const handleExpand = (transferId) => {
        if (expandedId === transferId) {
            setExpandedId(null);
        } else {
            setExpandedId(transferId);
            if (!matches[transferId]) {
                fetchMatches(transferId);
            }
        }
    };

    const handleLink = async (transferId, transactionId) => {
        try {
            await axios.post(`${API_URL}/payroll-transfers/${transferId}/link?transaction_id=${transactionId}`);
            // Refresh transfers
            fetchTransfers();
            setExpandedId(null);
        } catch (error) {
            console.error("Failed to link transfer:", error);
            alert("Failed to link transfer");
        }
    };

    const handleUnlink = async (transferId) => {
        try {
            await axios.put(`${API_URL}/payroll-transfers/${transferId}`, { transaction_id: null });
            fetchTransfers();
        } catch (error) {
            console.error("Failed to unlink transfer:", error);
        }
    };

    const handleDelete = async (transferId) => {
        if (!confirm("Delete this payroll transfer record?")) return;
        try {
            await axios.delete(`${API_URL}/payroll-transfers/${transferId}`);
            fetchTransfers();
        } catch (error) {
            console.error("Failed to delete transfer:", error);
        }
    };

    // Group transfers by target account
    const groupedTransfers = transfers.reduce((acc, t) => {
        const key = t.target_account_name || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
                <div className="animate-pulse text-gray-400">Loading payroll transfers...</div>
            </div>
        );
    }

    if (transfers.length === 0) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
                <p className="text-gray-400">No payroll transfers found for this period.</p>
                <p className="text-gray-500 text-sm mt-2">
                    Use the Payday Distributor to execute transfers and they will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    <p className="text-gray-400 text-sm">Total Transfers</p>
                    <p className="text-2xl font-bold text-white">{transfers.length}</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    <p className="text-gray-400 text-sm">Linked</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        {transfers.filter(t => t.transaction_id).length}
                    </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    <p className="text-gray-400 text-sm">Total Amount</p>
                    <p className="text-2xl font-bold text-blue-400">
                        {formatCurrency(transfers.reduce((sum, t) => sum + t.amount, 0))}
                    </p>
                </div>
            </div>

            {/* Grouped Transfers */}
            {Object.entries(groupedTransfers).map(([targetName, groupTransfers]) => (
                <div key={targetName} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                    <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700">
                        <h3 className="font-semibold text-white">{targetName}</h3>
                        <p className="text-sm text-gray-400">
                            {groupTransfers.length} transfer{groupTransfers.length !== 1 ? 's' : ''} •
                            Total: {formatCurrency(groupTransfers.reduce((sum, t) => sum + t.amount, 0))}
                        </p>
                    </div>

                    <div className="divide-y divide-slate-700">
                        {groupTransfers.map(transfer => (
                            <div key={transfer.id} className="p-4">
                                {/* Transfer Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleExpand(transfer.id)}
                                            className="p-1 hover:bg-slate-700 rounded transition-colors"
                                        >
                                            {expandedId === transfer.id ? (
                                                <ChevronDown size={16} className="text-gray-400" />
                                            ) : (
                                                <ChevronRight size={16} className="text-gray-400" />
                                            )}
                                        </button>
                                        <div>
                                            <p className="font-medium text-white">
                                                {formatCurrency(transfer.amount)}
                                            </p>
                                            <p className="text-xs text-gray-500">{transfer.note}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Status Badge */}
                                        {transfer.transaction_id ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                                                <Check size={12} />
                                                Linked
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                                                <Unlink size={12} />
                                                Pending
                                            </span>
                                        )}

                                        {/* Actions */}
                                        {transfer.transaction_id && (
                                            <button
                                                onClick={() => handleUnlink(transfer.id)}
                                                className="p-1.5 hover:bg-slate-700 rounded text-gray-400 hover:text-amber-400 transition-colors"
                                                title="Unlink transaction"
                                            >
                                                <Unlink size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(transfer.id)}
                                            className="p-1.5 hover:bg-slate-700 rounded text-gray-400 hover:text-red-400 transition-colors"
                                            title="Delete transfer"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded: Linked Transaction or Matches */}
                                {expandedId === transfer.id && (
                                    <div className="mt-4 ml-8 space-y-3">
                                        {transfer.linked_transaction ? (
                                            <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-3">
                                                <p className="text-xs text-emerald-400 uppercase font-medium mb-2">Linked Transaction</p>
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-white font-medium">
                                                            {formatCurrency(transfer.linked_transaction.amount)}
                                                        </p>
                                                        <p className="text-sm text-gray-400">
                                                            {transfer.linked_transaction.merchant || 'Transfer'}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(transfer.linked_transaction.timestamp).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <ExternalLink size={16} className="text-emerald-400" />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="text-xs text-gray-400 uppercase font-medium">
                                                    Suggested Matches
                                                </p>
                                                {loadingMatches[transfer.id] ? (
                                                    <div className="text-gray-500 text-sm">Finding matches...</div>
                                                ) : matches[transfer.id]?.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {matches[transfer.id].map(tx => (
                                                            <div
                                                                key={tx.id}
                                                                className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3 hover:bg-slate-700 transition-colors"
                                                            >
                                                                <div>
                                                                    <p className="text-white font-medium">
                                                                        {formatCurrency(tx.amount)}
                                                                    </p>
                                                                    <p className="text-sm text-gray-400">
                                                                        {tx.merchant || 'Transfer'}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500">
                                                                        {new Date(tx.timestamp).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleLink(transfer.id, tx.id)}
                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg flex items-center gap-1 transition-colors"
                                                                >
                                                                    <Link2 size={14} />
                                                                    Link
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-500 text-sm bg-slate-700/30 rounded-lg p-3">
                                                        No matching transactions found. The transfer was likely already linked automatically.
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PayrollTransfers;
