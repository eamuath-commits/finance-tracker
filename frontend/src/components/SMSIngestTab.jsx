import React, { useState, useRef, useCallback } from "react";
import axios from "axios";
import { Send, CheckCircle, AlertTriangle, XCircle, Loader2, RefreshCw, Upload } from "lucide-react";
import { formatCurrency } from "./UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const SMSIngestTab = ({ accounts = [], creditCards = [], onTransactionCreated }) => {
    const [smsInput, setSmsInput] = useState("");
    const [results, setResults] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [pendingResult, setPendingResult] = useState(null);
    const [forceUpdate, setForceUpdate] = useState(0); // Force re-render trigger

    // Split SMS by blank lines
    const parseSMSMessages = (text) => {
        return text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    };

    const processSMS = async () => {
        const messages = parseSMSMessages(smsInput);
        if (messages.length === 0) return;

        setIsProcessing(true);
        const newResults = [];

        for (const msg of messages) {
            try {
                const res = await axios.post(`${API_URL}/api/sms/ingest`, {
                    sender: "WebUI",
                    body: msg
                });

                const result = {
                    id: Date.now() + Math.random(),
                    sms: msg,
                    ...res.data
                };

                newResults.push(result);

                // If pending_action, store for account selection
                if (res.data.status === "pending_action") {
                    result.accounts = res.data.accounts;
                    result.credit_cards = res.data.credit_cards;
                    result.transaction_id = res.data.transaction_id;
                }
            } catch (err) {
                console.error("[SMSIngest] Error:", err);
                newResults.push({
                    id: Date.now() + Math.random(),
                    sms: msg,
                    status: "failed",
                    reason: err.response?.data?.detail || err.message
                });
            }
        }

        // Important: Set state in correct order
        // 1. First, set the results (BEFORE any other state changes)
        const updatedResults = [...newResults, ...results];
        setResults(updatedResults);

        // Force a re-render
        setForceUpdate(prev => prev + 1);

        // 2. Then update processing state
        setIsProcessing(false);

        // 3. Clear input
        setSmsInput("");

        // 4. Notify parent AFTER state has settled (use setTimeout to ensure React has committed the update)
        if (onTransactionCreated) {
            setTimeout(() => {
                onTransactionCreated();
            }, 200);
        }
    };

    const handleAccountSelect = async (resultId, accountId, isCreditCard = false) => {
        const result = results.find(r => r.id === resultId);
        if (!result || !result.transaction_id) return;

        try {
            const params = new URLSearchParams();
            params.append("transaction_id", result.transaction_id);
            if (isCreditCard) {
                params.append("credit_card_id", accountId);
            } else {
                params.append("account_id", accountId);
            }

            const res = await axios.post(`${API_URL}/api/sms/assign-account?${params.toString()}`);

            // Update result in list
            setResults(prev => prev.map(r => {
                if (r.id === resultId) {
                    return {
                        ...r,
                        status: "success",
                        transaction: res.data.transaction,
                        accounts: null,
                        credit_cards: null
                    };
                }
                return r;
            }));

            if (onTransactionCreated) {
                onTransactionCreated();
            }
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
            default: return <Loader2 className="text-blue-400 animate-spin" size={18} />;
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            pending_action: "bg-amber-500/20 text-amber-400 border-amber-500/30",
            declined: "bg-orange-500/20 text-orange-400 border-orange-500/30",
            ignored: "bg-gray-500/20 text-gray-400 border-gray-500/30",
            failed: "bg-red-500/20 text-red-400 border-red-500/30"
        };
        return `px-2 py-0.5 rounded text-xs font-medium border ${styles[status] || styles.failed}`;
    };

    const clearResults = () => {
        setResults([]);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Input Section */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-lg">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Send size={20} className="text-blue-400" />
                    Direct SMS Ingest
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                    Paste SMS messages below. Separate multiple messages with a blank line.
                </p>

                <textarea
                    className="w-full h-48 bg-slate-900/50 border border-slate-600 rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition resize-none"
                    placeholder="AlRajhiBank —— PoS | By:9365;mada-Apple Pay | Amount:SAR 96.00 | Balance:SAR 12,345.67

AlRajhiBank —— Credit Transfer Internal | Amount:SAR 5000 | To:7772 | From:Executive Craft | From:3053 | 26/1/29 17:38"
                    value={smsInput}
                    onChange={(e) => setSmsInput(e.target.value)}
                    disabled={isProcessing}
                />

                <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-gray-500">
                        {parseSMSMessages(smsInput).length} message{parseSMSMessages(smsInput).length !== 1 ? 's' : ''} detected
                    </span>
                    <button
                        onClick={processSMS}
                        disabled={isProcessing || smsInput.trim().length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition shadow border border-emerald-500 disabled:border-slate-500"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {isProcessing ? "Processing..." : "Process SMS"}
                    </button>
                </div>
            </div>
            {/* Results Section - Table Format */}
            {results.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Upload size={20} className="text-emerald-400" />
                            Processing Results
                        </h3>
                        <button
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
                                    <th className="px-4 py-3 w-10">Source</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Account</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {results.map((result) => (
                                    <tr key={result.id} className="hover:bg-slate-700/30 transition">
                                        {/* Source Icon - Upload for Web Ingest */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30" title="Web Ingest">
                                                <Upload size={14} className="text-emerald-400" />
                                            </div>
                                        </td>

                                        {/* Status Badge */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(result.status)}
                                                <span className={getStatusBadge(result.status)}>
                                                    {result.status?.toUpperCase().replace("_", " ")}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Description/Merchant */}
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-white font-medium">
                                                    {result.transaction?.merchant || result.parsed?.description || "Processing..."}
                                                </span>
                                                <span className="text-xs text-gray-500 font-mono truncate max-w-xs" title={result.sms}>
                                                    {result.sms.length > 50 ? result.sms.substring(0, 50) + "..." : result.sms}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Account */}
                                        <td className="px-4 py-3 text-gray-400">
                                            {result.transaction?.account_name || "-"}
                                        </td>

                                        {/* Amount */}
                                        <td className="px-4 py-3 text-right">
                                            {result.transaction ? (
                                                <span className={`font-bold ${result.transaction.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {result.transaction.type === 'credit' ? '+' : '-'}
                                                    {formatCurrency(result.transaction.amount)}
                                                </span>
                                            ) : (
                                                <span className="text-gray-500">-</span>
                                            )}
                                        </td>

                                        {/* Actions / Account Selection */}
                                        <td className="px-4 py-3">
                                            {result.status === "pending_action" && result.accounts ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {result.accounts.slice(0, 3).map(acc => (
                                                        <button
                                                            key={acc.id}
                                                            onClick={() => handleAccountSelect(result.id, acc.id, false)}
                                                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded border border-slate-600 transition"
                                                            title={acc.name}
                                                        >
                                                            {acc.name.length > 8 ? acc.name.substring(0, 8) + "..." : acc.name}
                                                        </button>
                                                    ))}
                                                    {result.credit_cards && result.credit_cards.slice(0, 2).map(cc => (
                                                        <button
                                                            key={cc.id}
                                                            onClick={() => handleAccountSelect(result.id, cc.id, true)}
                                                            className="px-2 py-1 bg-purple-900/50 hover:bg-purple-800/50 text-white text-xs rounded border border-purple-600/50 transition"
                                                            title={cc.name}
                                                        >
                                                            {cc.name.length > 8 ? cc.name.substring(0, 8) + "..." : cc.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : result.reason ? (
                                                <span className="text-xs text-gray-400">{result.reason}</span>
                                            ) : (
                                                <span className="text-xs text-gray-500">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SMSIngestTab;
