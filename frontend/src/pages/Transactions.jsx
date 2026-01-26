import React, { useState, useEffect } from "react";
import UI from "../components/UI";
import { format } from "date-fns";

function Transactions() {
    const [activeTab, setActiveTab] = useState("all");
    const [transactions, setTransactions] = useState([]);
    const [inboxMessages, setInboxMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTransaction, setEditingTransaction] = useState(null);

    // Selection State
    const [selectedTxIds, setSelectedTxIds] = useState(new Set());
    const [selectedMsgIds, setSelectedMsgIds] = useState(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = () => {
        setLoading(true);
        if (activeTab === "inbox") {
            fetch("http://localhost:8000/messages/")
                .then((res) => res.json())
                .then((data) => {
                    setInboxMessages(data);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error("Error fetching messages:", err);
                    setLoading(false);
                });
        } else {
            fetch("http://localhost:8000/transactions/")
                .then((res) => res.json())
                .then((data) => {
                    setTransactions(data);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error("Error fetching transactions:", err);
                    setLoading(false);
                });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure?")) return;

        try {
            if (activeTab === "inbox") {
                await fetch('http://localhost:8000/messages/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: [id] })
                });
                setInboxMessages(inboxMessages.filter(m => m.id !== id));
            } else {
                await fetch(`http://localhost:8000/transactions/${id}`, { method: "DELETE" });
                setTransactions(transactions.filter((t) => t.id !== id));
            }
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

    const handleEdit = (tx) => {
        setEditingTransaction({ ...tx });
    };

    const handleSaveEdit = async () => {
        if (!editingTransaction) return;
        try {
            const payload = {
                merchant: editingTransaction.merchant,
                amount: parseFloat(editingTransaction.amount),
                category: editingTransaction.category,
                notes: editingTransaction.notes,
                timestamp: editingTransaction.timestamp
            };

            const res = await fetch(`http://localhost:8000/transactions/${editingTransaction.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setEditingTransaction(null);
                fetchData();
            } else {
                alert("Failed to update transaction");
            }
        } catch (e) {
            console.error(e);
            alert("Error updating transaction");
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${isSelectionMode ? (activeTab === 'inbox' ? selectedMsgIds.size : selectedTxIds.size) : 0} items?`)) return;

        try {
            if (activeTab === 'inbox') {
                await fetch('http://localhost:8000/messages/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: Array.from(selectedMsgIds) })
                });
                setSelectedMsgIds(new Set());
            } else {
                await fetch('http://localhost:8000/transactions/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: Array.from(selectedTxIds) })
                });
                setSelectedTxIds(new Set());
            }
            setIsSelectionMode(false);
            fetchData();
        } catch (e) {
            console.error("Bulk delete failed", e);
        }
    };

    const toggleSelection = (id) => {
        if (activeTab === 'inbox') {
            const next = new Set(selectedMsgIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelectedMsgIds(next);
        } else {
            const next = new Set(selectedTxIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelectedTxIds(next);
        }
    };

    const handleRetry = async (msgId) => {
        try {
            const res = await fetch(`http://localhost:8000/messages/${msgId}/retry`, {
                method: "POST"
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || "Success");
                fetchData();
            } else {
                alert("Retry Failed: " + (data.reason || "Unknown Error"));
            }
        } catch (e) {
            alert("Error: " + e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Transactions</h1>
                    <p className="text-gray-400">View and manage your financial history</p>
                </div>
                <div className="flex gap-2">
                    {isSelectionMode && (
                        <UI.Button variant="danger" onClick={handleBulkDelete}>
                            Delete Selected ({activeTab === 'inbox' ? selectedMsgIds.size : selectedTxIds.size})
                        </UI.Button>
                    )}
                    <UI.Button variant="secondary" onClick={() => setIsSelectionMode(!isSelectionMode)}>
                        {isSelectionMode ? 'Cancel Selection' : 'Select Items'}
                    </UI.Button>
                </div>
            </div>

            <div className="flex gap-4 border-b border-white/10">
                <button
                    className={`pb-2 px-1 ${activeTab === "all"
                            ? "text-brand-primary border-b-2 border-brand-primary"
                            : "text-gray-400 hover:text-white"
                        }`}
                    onClick={() => setActiveTab("all")}
                >
                    All Transactions
                </button>
                <button
                    className={`pb-2 px-1 ${activeTab === "inbox"
                            ? "text-brand-primary border-b-2 border-brand-primary"
                            : "text-gray-400 hover:text-white"
                        }`}
                    onClick={() => setActiveTab("inbox")}
                >
                    SMS Inbox
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : activeTab === "all" ? (
                <div className="bg-surface rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-black/20 text-gray-400 text-sm">
                            <tr>
                                {isSelectionMode && <th className="p-4 w-10"></th>}
                                <th className="p-4 font-medium">Date</th>
                                <th className="p-4 font-medium">Merchant</th>
                                <th className="p-4 font-medium">Category</th>
                                <th className="p-4 font-medium">Amount</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {transactions.map((tx) => (
                                <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                                    {isSelectionMode && (
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedTxIds.has(tx.id)}
                                                onChange={() => toggleSelection(tx.id)}
                                                className="rounded border-gray-600 bg-black/40 text-brand-primary focus:ring-brand-primary/50"
                                            />
                                        </td>
                                    )}
                                    <td className="p-4 text-gray-300">
                                        {format(new Date(tx.timestamp), "MMM d, yyyy HH:mm")}
                                    </td>
                                    <td className="p-4 text-white font-medium">{tx.merchant || "Unknown"}</td>
                                    <td className="p-4 text-gray-400">
                                        <UI.Badge variant="neutral">{tx.category || "Uncategorized"}</UI.Badge>
                                    </td>
                                    <td className={`p-4 font-medium ${tx.type === 'credit' ? 'text-green-400' : 'text-white'}`}>
                                        {tx.type === 'debit' ? '-' : '+'}
                                        {tx.amount.toFixed(2)} SAR
                                        {tx.original_amount && (
                                            <span className="text-xs text-gray-500 ml-2">
                                                ({tx.original_amount} {tx.original_currency})
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleEdit(tx)}
                                            className="text-gray-400 hover:text-white mr-3"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(tx.id)}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="space-y-4">
                    {inboxMessages.map((msg) => (
                        <div key={msg.id} className="bg-surface p-4 rounded-xl border border-white/10 flex justify-between items-start group">
                            <div className="flex gap-3">
                                {isSelectionMode && (
                                    <input
                                        type="checkbox"
                                        checked={selectedMsgIds.has(msg.id)}
                                        onChange={() => toggleSelection(msg.id)}
                                        className="mt-1 rounded border-gray-600 bg-black/40 text-brand-primary focus:ring-brand-primary/50"
                                    />
                                )}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-bold text-white">{msg.sender || "Unknown Sender"}</span>
                                        <span className="text-xs text-gray-500">{format(new Date(msg.timestamp), "MMM d, HH:mm")}</span>
                                        <UI.Badge variant={
                                            msg.status === 'PARSED' ? 'success' :
                                                msg.status === 'FAILED' ? 'danger' : 'warning'
                                        }>
                                            {msg.status}
                                        </UI.Badge>
                                    </div>
                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{msg.body}</p>
                                    {msg.error_log && (
                                        <p className="text-red-400 text-xs mt-2 font-mono bg-red-400/10 p-2 rounded">
                                            Error: {msg.error_log}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                {msg.status === 'FAILED' && (
                                    <UI.Button variant="secondary" size="sm" onClick={() => handleRetry(msg.id)}>
                                        Reparse
                                    </UI.Button>
                                )}
                                <button
                                    onClick={() => handleDelete(msg.id)}
                                    className="text-gray-500 hover:text-red-400 p-2"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editingTransaction && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-4">Edit Transaction</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Merchant</label>
                                <UI.Input
                                    value={editingTransaction.merchant}
                                    onChange={(e) => setEditingTransaction({ ...editingTransaction, merchant: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Amount</label>
                                <UI.Input
                                    type="number"
                                    value={editingTransaction.amount}
                                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Category</label>
                                <UI.Input
                                    value={editingTransaction.category}
                                    onChange={(e) => setEditingTransaction({ ...editingTransaction, category: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Notes</label>
                                <textarea
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-colors"
                                    rows={3}
                                    value={editingTransaction.notes || ""}
                                    onChange={(e) => setEditingTransaction({ ...editingTransaction, notes: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <UI.Button variant="ghost" onClick={() => setEditingTransaction(null)}>Cancel</UI.Button>
                                <UI.Button variant="primary" onClick={handleSaveEdit}>Save Changes</UI.Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Transactions;
