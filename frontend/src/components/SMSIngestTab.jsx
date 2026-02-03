import React, { useState, useRef, useCallback } from "react";
import axios from "axios";
import { Send, CheckCircle, AlertTriangle, XCircle, Loader2, RefreshCw, Upload, Clock, Ban } from "lucide-react";
import { formatCurrency } from "./UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const SMSIngestTab = ({ accounts = [], creditCards = [], onTransactionCreated }) => {
    const [smsInput, setSmsInput] = useState("");
    const [processingQueue, setProcessingQueue] = useState([]); // Array of {sms, status, result}
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [agentStatus, setAgentStatus] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState([]); // Completed results

    // Split SMS by separator lines (---- or blank lines for single messages)
    const parseSMSMessages = (text) => {
        if (text.includes('----')) {
            return text.split(/\n-{4,}\n/).map(s => s.trim()).filter(s => s.length > 0);
        }
        return text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    };

    const processSMS = async () => {
        const messages = parseSMSMessages(smsInput);
        if (messages.length === 0) return;

        // Initialize queue with all messages as "waiting"
        const initialQueue = messages.map((sms, idx) => ({
            id: Date.now() + idx,
            sms,
            status: "waiting",
            result: null
        }));

        setProcessingQueue(initialQueue);
        setIsProcessing(true);
        setCurrentIndex(0);
        setSmsInput("");

        // Process each message one by one with live updates
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // Update status to "parsing"
            setCurrentIndex(i);
            setAgentStatus(`Gemini: Parsing SMS ${i + 1} of ${messages.length}...`);
            setProcessingQueue(prev => prev.map((item, idx) =>
                idx === i ? { ...item, status: "parsing" } : item
            ));

            try {
                // Small delay to show UI update
                await new Promise(r => setTimeout(r, 100));

                setAgentStatus(`Gemini: Extracting transaction details...`);

                const res = await axios.post(`${API_URL}/api/sms/ingest`, {
                    sender: "WebUI",
                    body: msg
                });

                // Update queue with result
                const result = {
                    id: Date.now() + Math.random(),
                    sms: msg,
                    ...res.data
                };

                // Handle different statuses
                let finalStatus = res.data.status;
                if (finalStatus === "pending_action") {
                    result.accounts = res.data.accounts;
                    result.credit_cards = res.data.credit_cards;
                    result.transaction_id = res.data.transaction_id;
                }

                setProcessingQueue(prev => prev.map((item, idx) =>
                    idx === i ? { ...item, status: finalStatus, result } : item
                ));

                // If blocked, stop processing
                if (finalStatus === "blocked") {
                    setAgentStatus(`⚠️ Queue blocked: ${res.data.blocked_count} pending transaction(s) need resolution`);
                    // Mark remaining as blocked
                    setProcessingQueue(prev => prev.map((item, idx) =>
                        idx > i ? { ...item, status: "blocked", result: { reason: "Blocked by pending transactions" } } : item
                    ));
                    break;
                }

            } catch (err) {
                console.error("[SMSIngest] Error:", err);
                setProcessingQueue(prev => prev.map((item, idx) =>
                    idx === i ? {
                        ...item,
                        status: "failed",
                        result: {
                            status: "failed",
                            reason: err.response?.data?.detail || err.message
                        }
                    } : item
                ));
            }
        }

        setIsProcessing(false);
        setAgentStatus("");
        setCurrentIndex(-1);

        // Move completed queue to results
        setProcessingQueue(prev => {
            setResults(old => [...prev.filter(p => p.result), ...old]);
            return [];
        });

        if (onTransactionCreated) {
            setTimeout(() => onTransactionCreated(), 200);
        }
    };

    const handleAccountSelect = async (resultId, accountId, isCreditCard = false) => {
        const result = results.find(r => r.result?.transaction_id === resultId);
        if (!result) return;

        try {
            const params = new URLSearchParams();
            params.append("transaction_id", resultId);
            if (isCreditCard) {
                params.append("credit_card_id", accountId);
            } else {
                params.append("account_id", accountId);
            }

            const res = await axios.post(`${API_URL}/api/sms/assign-account?${params.toString()}`);

            setResults(prev => prev.map(r => {
                if (r.result?.transaction_id === resultId) {
                    return {
                        ...r,
                        status: "success",
                        result: { ...r.result, status: "success", transaction: res.data.transaction }
                    };
                }
                return r;
            }));

            if (onTransactionCreated) onTransactionCreated();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to assign account");
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case "success": return <CheckCircle className="text-emerald-400" size={18} />;
            case "pending_action": return <AlertTriangle className="text-amber-400" size={18} />;
            case "declined": return <XCircle className="text-orange-400" size={18} />;
            case "ignored": return <XCircle className="text-gray-400" size={18} />;
            case "failed": return <XCircle className="text-red-400" size={18} />;
            case "blocked": return <Ban className="text-orange-400" size={18} />;
            case "parsing": return <Loader2 className="text-blue-400 animate-spin" size={18} />;
            case "waiting": return <Clock className="text-gray-500" size={18} />;
            default: return <Clock className="text-gray-500" size={18} />;
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            pending_action: "bg-amber-500/20 text-amber-400 border-amber-500/30",
            declined: "bg-orange-500/20 text-orange-400 border-orange-500/30",
            ignored: "bg-gray-500/20 text-gray-400 border-gray-500/30",
            failed: "bg-red-500/20 text-red-400 border-red-500/30",
            blocked: "bg-orange-500/20 text-orange-400 border-orange-500/30",
            parsing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
            waiting: "bg-slate-500/20 text-slate-400 border-slate-500/30"
        };
        return `px-2 py-0.5 rounded text-xs font-medium border ${styles[status] || styles.waiting}`;
    };

    const clearResults = () => {
        setResults([]);
        setProcessingQueue([]);
    };

    const totalMessages = parseSMSMessages(smsInput).length;
    const allItems = [...processingQueue, ...results];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Input Section */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-lg">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Send size={20} className="text-blue-400" />
                    Direct SMS Ingest
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                    Paste SMS messages below. Separate multiple messages with ---- or blank lines.
                </p>

                <textarea
                    className="w-full h-48 bg-slate-900/50 border border-slate-600 rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition resize-none"
                    placeholder="AlRajhiBank —— PoS | By:9365;mada-Apple Pay | Amount:SAR 96.00
----
AlRajhiBank —— Credit Transfer Internal | Amount:SAR 5000 | To:7772"
                    value={smsInput}
                    onChange={(e) => setSmsInput(e.target.value)}
                    disabled={isProcessing}
                />

                <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-gray-500">
                        {totalMessages} message{totalMessages !== 1 ? 's' : ''} detected
                    </span>
                    <button
                        type="button"
                        onClick={processSMS}
                        disabled={isProcessing || smsInput.trim().length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition shadow border border-emerald-500 disabled:border-slate-500"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {isProcessing ? "Processing..." : "Process SMS"}
                    </button>
                </div>
            </div>

            {/* Live Processing Panel */}
            {isProcessing && processingQueue.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-4 shadow-lg animate-pulse-slow">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Loader2 size={18} className="text-blue-400 animate-spin" />
                            Processing ({currentIndex + 1} of {processingQueue.length})
                        </h3>
                        {/* Progress bar */}
                        <div className="flex gap-1">
                            {processingQueue.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`w-4 h-2 rounded ${item.status === 'success' ? 'bg-emerald-500' :
                                            item.status === 'failed' ? 'bg-red-500' :
                                                item.status === 'pending_action' ? 'bg-amber-500' :
                                                    item.status === 'parsing' ? 'bg-blue-500 animate-pulse' :
                                                        item.status === 'blocked' ? 'bg-orange-500' :
                                                            'bg-slate-600'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                    {/* Agent Status */}
                    {agentStatus && (
                        <div className="text-sm text-blue-300 bg-blue-900/30 rounded-lg px-3 py-2 font-mono">
                            🤖 {agentStatus}
                        </div>
                    )}
                </div>
            )}

            {/* Results Table */}
            {allItems.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Upload size={20} className="text-emerald-400" />
                            Processing Results
                        </h3>
                        <button
                            type="button"
                            onClick={clearResults}
                            className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
                        >
                            <RefreshCw size={14} /> Clear
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-700/50 text-left text-xs text-gray-400 uppercase tracking-wider">
                                    <th className="px-4 py-3 w-8">#</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Account</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {processingQueue.map((item, idx) => (
                                    <tr key={`q-${idx}`} className={`transition ${item.status === 'parsing' ? 'bg-blue-900/20' : 'hover:bg-slate-700/30'}`}>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(item.status)}
                                                <span className={getStatusBadge(item.status)}>
                                                    {item.status?.toUpperCase().replace("_", " ")}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-gray-400 font-mono truncate block max-w-xs">
                                                {item.sms.length > 60 ? item.sms.substring(0, 60) + "..." : item.sms}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">-</td>
                                        <td className="px-4 py-3 text-right text-gray-500">-</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {item.result?.reason || "-"}
                                        </td>
                                    </tr>
                                ))}
                                {results.map((item, idx) => {
                                    const r = item.result || {};
                                    const tx = r.transaction;
                                    return (
                                        <tr key={`r-${item.id}`} className="hover:bg-slate-700/30 transition">
                                            <td className="px-4 py-3 text-gray-500 text-sm">{processingQueue.length + idx + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {getStatusIcon(r.status || item.status)}
                                                    <span className={getStatusBadge(r.status || item.status)}>
                                                        {(r.status || item.status)?.toUpperCase().replace("_", " ")}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="text-white font-medium">
                                                        {tx?.merchant || r.parsed?.description || "-"}
                                                    </span>
                                                    <span className="text-xs text-gray-500 font-mono truncate max-w-xs">
                                                        {item.sms.length > 50 ? item.sms.substring(0, 50) + "..." : item.sms}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-400">
                                                {tx?.account_name || "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {tx ? (
                                                    <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {formatCurrency(tx.amount)}
                                                    </span>
                                                ) : "-"}
                                            </td>
                                            <td className="px-4 py-3">
                                                {r.status === "pending_action" && r.accounts ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {r.accounts.slice(0, 3).map(acc => (
                                                            <button
                                                                type="button"
                                                                key={acc.id}
                                                                onClick={() => handleAccountSelect(r.transaction_id, acc.id, false)}
                                                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded border border-slate-600 transition"
                                                            >
                                                                {acc.name.length > 8 ? acc.name.substring(0, 8) + "..." : acc.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : r.reason ? (
                                                    <span className="text-xs text-gray-400">{r.reason}</span>
                                                ) : "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SMSIngestTab;
