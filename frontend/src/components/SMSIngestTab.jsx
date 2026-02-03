import React, { useState, useEffect } from "react";
import axios from "axios";
import { Send, CheckCircle, AlertTriangle, XCircle, Loader2, RefreshCw, Upload, Clock, Ban, ChevronDown, ChevronRight, Eye, Copy } from "lucide-react";
import { formatCurrency } from "./UI";

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const STORAGE_KEY = "sms_ingest_results";

const SMSIngestTab = ({ accounts = [], creditCards = [], onTransactionCreated }) => {
    const [smsInput, setSmsInput] = useState("");
    const [processingQueue, setProcessingQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [agentStatus, setAgentStatus] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState([]);
    const [expandedRows, setExpandedRows] = useState(new Set());

    // DISABLED: localStorage was causing stale results to accumulate
    // Results now reset on page refresh for cleaner experience
    // useEffect(() => {
    //     try {
    //         const saved = localStorage.getItem(STORAGE_KEY);
    //         if (saved) {
    //             const parsed = JSON.parse(saved);
    //             if (Array.isArray(parsed)) {
    //                 setResults(parsed);
    //             }
    //         }
    //     } catch (e) {
    //         console.error("Failed to load saved results:", e);
    //     }
    // }, []);

    // DISABLED: No longer saving to localStorage
    // useEffect(() => {
    //     if (results.length > 0) {
    //         try {
    //             localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
    //         } catch (e) {
    //             console.error("Failed to save results:", e);
    //         }
    //     }
    // }, [results]);

    const parseSMSMessages = (text) => {
        // If explicit separator exists, use it
        if (text.includes('----')) {
            return text.split(/\n-{4,}\n/).map(s => s.trim()).filter(s => s.length > 0);
        }

        // Check if text contains timestamp headers (YYYY-MM-DD HH:MM:SS from BankName)
        const timestampPattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+/i;
        const hasTimestamp = timestampPattern.test(text);

        if (hasTimestamp) {
            // Split on timestamp headers, keeping each timestamp with its body
            const splitPattern = /(?=\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+)/i;
            return text.split(splitPattern).map(s => s.trim()).filter(s => s.length > 0);
        }

        // No timestamp found - fall back to double-newline split
        return text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    };

    const toggleExpand = (id) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const processSMS = async () => {
        const messages = parseSMSMessages(smsInput);
        if (messages.length === 0) return;

        // Clear old results when starting a fresh batch
        setResults([]);
        localStorage.removeItem(STORAGE_KEY);

        const initialQueue = messages.map((sms, idx) => ({
            id: Date.now() + idx,
            sms,
            status: "waiting",
            result: null,
            steps: [] // Track processing steps
        }));

        setProcessingQueue(initialQueue);
        setIsProcessing(true);
        setCurrentIndex(0);
        setSmsInput("");

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const itemId = initialQueue[i].id;

            // Step 1: Starting
            setCurrentIndex(i);
            const addStep = (step) => {
                setProcessingQueue(prev => prev.map((item, idx) =>
                    idx === i ? { ...item, steps: [...item.steps, { time: new Date().toLocaleTimeString(), ...step }] } : item
                ));
            };

            addStep({ action: "Starting", detail: "Sending to Gemini AI for parsing..." });
            setAgentStatus(`🤖 Gemini: Parsing SMS ${i + 1} of ${messages.length}...`);
            setProcessingQueue(prev => prev.map((item, idx) =>
                idx === i ? { ...item, status: "parsing" } : item
            ));

            try {
                await new Promise(r => setTimeout(r, 100));

                addStep({ action: "Extracting", detail: "Gemini extracting transaction details..." });
                setAgentStatus(`🤖 Gemini: Extracting transaction from SMS ${i + 1}...`);

                const res = await axios.post(`${API_URL}/api/sms/ingest`, {
                    sender: "WebUI",
                    body: msg
                });

                const result = {
                    id: itemId,
                    sms: msg,
                    ...res.data
                };

                // Add parsing result step
                if (res.data.parsed) {
                    addStep({
                        action: "Parsed",
                        detail: `Type: ${res.data.parsed.type || 'N/A'}, Amount: ${res.data.parsed.amount || 'N/A'}, Merchant: ${res.data.parsed.description || res.data.parsed.merchant || 'N/A'}`
                    });
                }

                let finalStatus = res.data.status;
                if (finalStatus === "pending_action") {
                    result.accounts = res.data.accounts;
                    result.credit_cards = res.data.credit_cards;
                    result.transaction_id = res.data.transaction_id;
                    addStep({ action: "Pending", detail: "Needs account selection" });
                } else if (finalStatus === "success") {
                    addStep({ action: "Created", detail: `Transaction created: ${res.data.transaction?.merchant || 'Transaction'}` });
                } else if (finalStatus === "ignored") {
                    addStep({ action: "Ignored", detail: res.data.reason || "Message ignored" });
                } else if (finalStatus === "blocked") {
                    addStep({ action: "Blocked", detail: `Queue blocked: ${res.data.blocked_count} pending transaction(s)` });
                }

                // Get final steps before updating
                let finalSteps = [];
                setProcessingQueue(prev => {
                    const item = prev.find((_, idx) => idx === i);
                    finalSteps = item?.steps || [];
                    return prev.map((item, idx) =>
                        idx === i ? { ...item, status: finalStatus, result: { ...result, steps: [...finalSteps, { time: new Date().toLocaleTimeString(), action: "Complete", detail: `Status: ${finalStatus}` }] } } : item
                    );
                });

                // SEQUENTIAL QUEUE: Stop processing if this item needs resolution
                // Mark all subsequent items as 'waiting' - they will be processed after resolution
                if (finalStatus === "pending_action") {
                    setAgentStatus(`⏳ Waiting: SMS ${i + 1} needs account selection before continuing`);
                    setProcessingQueue(prev => prev.map((item, idx) =>
                        idx > i ? {
                            ...item,
                            status: "waiting",
                            result: {
                                reason: "Waiting for previous SMS to be resolved",
                                steps: [{ time: new Date().toLocaleTimeString(), action: "Waiting", detail: "Queued - waiting for pending item" }]
                            }
                        } : item
                    ));
                    break; // Stop processing loop - resume when pending_action is resolved
                }

                if (finalStatus === "blocked") {
                    setAgentStatus(`⚠️ Queue blocked: ${res.data.blocked_count} pending transaction(s) need resolution`);
                    setProcessingQueue(prev => prev.map((item, idx) =>
                        idx > i ? { ...item, status: "waiting", result: { reason: "Waiting for blocked item", steps: [{ time: new Date().toLocaleTimeString(), action: "Waiting", detail: "Queued - waiting for blocked item" }] } } : item
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
                            reason: err.response?.data?.detail || err.message,
                            steps: [...(item.steps || []), { time: new Date().toLocaleTimeString(), action: "Failed", detail: err.response?.data?.detail || err.message }]
                        }
                    } : item
                ));
            }
        }

        setIsProcessing(false);
        setAgentStatus("");
        setCurrentIndex(-1);

        // REPLACE results instead of appending (fixes duplication issue)
        setProcessingQueue(prev => {
            const completed = prev.filter(p => p.result);
            setResults(completed);  // Replace, not append
            return [];
        });

        if (onTransactionCreated) {
            setTimeout(() => onTransactionCreated(), 200);
        }
    };

    const handleAccountSelect = async (resultId, accountId, isCreditCard = false) => {
        const result = results.find(r => r.result?.transaction_id === resultId || r.id === resultId);
        if (!result) return;

        try {
            const txId = result.result?.transaction_id || resultId;
            const params = new URLSearchParams();
            params.append("transaction_id", txId);
            if (isCreditCard) {
                params.append("credit_card_id", accountId);
            } else {
                params.append("account_id", accountId);
            }

            const res = await axios.post(`${API_URL}/api/sms/assign-account?${params.toString()}`);

            setResults(prev => prev.map(r => {
                if ((r.result?.transaction_id === txId) || r.id === resultId) {
                    return {
                        ...r,
                        status: "success",
                        result: {
                            ...r.result,
                            status: "success",
                            transaction: res.data.transaction,
                            steps: [...(r.result?.steps || []), { time: new Date().toLocaleTimeString(), action: "Assigned", detail: `Account assigned successfully` }]
                        }
                    };
                }
                return r;
            }));

            if (onTransactionCreated) onTransactionCreated();

            // RESUME QUEUE: Process any waiting SMS items after resolving pending_action
            setTimeout(() => resumeWaitingItems(), 300);
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to assign account");
        }
    };

    // Ignore a pending/blocked SMS and continue processing
    const handleIgnore = async (resultId, transactionId) => {
        // If there's a transaction in the database, delete it
        if (transactionId) {
            try {
                await axios.delete(`${API_URL}/transactions/${transactionId}`);
            } catch (err) {
                console.log("Transaction may not exist:", err.message);
            }
        }

        // Mark item as ignored in results
        setResults(prev => prev.map(r => {
            if (r.id === resultId || r.result?.transaction_id === transactionId) {
                return {
                    ...r,
                    status: "ignored",
                    result: {
                        ...r.result,
                        status: "ignored",
                        reason: "Skipped by user",
                        steps: [...(r.result?.steps || []), { time: new Date().toLocaleTimeString(), action: "Ignored", detail: "Skipped by user" }]
                    }
                };
            }
            return r;
        }));

        // Also check processingQueue
        setProcessingQueue(prev => prev.map(item => {
            if (item.id === resultId || item.result?.transaction_id === transactionId) {
                return {
                    ...item,
                    status: "ignored",
                    result: {
                        ...item.result,
                        status: "ignored",
                        reason: "Skipped by user",
                        steps: [...(item.result?.steps || item.steps || []), { time: new Date().toLocaleTimeString(), action: "Ignored", detail: "Skipped by user" }]
                    }
                };
            }
            return item;
        }));

        // Resume processing waiting items
        setTimeout(() => resumeWaitingItems(), 300);
    };

    // Resume processing waiting SMS items (called after pending_action is resolved)
    const resumeWaitingItems = async () => {
        // Use setResults to get CURRENT state (avoids stale closure issue)
        let waitingItems = [];
        setResults(prev => {
            waitingItems = prev.filter(r => r.status === 'waiting');
            return prev; // Don't modify, just read
        });

        // Wait a tick for state to settle
        await new Promise(r => setTimeout(r, 50));

        if (waitingItems.length === 0) return;

        // Process first waiting item, update in-place
        const firstWaiting = waitingItems[0];
        const itemId = firstWaiting.id;
        const msg = firstWaiting.sms;

        setIsProcessing(true);
        setAgentStatus(`🤖 Gemini: Processing queued SMS...`);

        // Update to parsing in-place
        setResults(prev => prev.map(r =>
            r.id === itemId ? { ...r, status: "parsing" } : r
        ));

        try {
            const res = await axios.post(`${API_URL}/api/sms/ingest`, {
                sender: "WebUI",
                body: msg
            });

            const result = { id: itemId, sms: msg, ...res.data };

            if (res.data.status === "pending_action") {
                result.accounts = res.data.accounts;
                result.credit_cards = res.data.credit_cards;
                result.transaction_id = res.data.transaction_id;
            }

            // Update item in-place (no removal/addition)
            setResults(prev => prev.map(r =>
                r.id === itemId ? {
                    ...r,
                    status: res.data.status,
                    result: { ...result, steps: [{ time: new Date().toLocaleTimeString(), action: "Resumed", detail: `Status: ${res.data.status}` }] }
                } : r
            ));

            // If still pending_action, don't process more - user needs to resolve first
            if (res.data.status === "pending_action") {
                setIsProcessing(false);
                setAgentStatus(`⏳ Waiting: This SMS needs account selection before continuing`);
            } else if (res.data.status === "blocked") {
                setIsProcessing(false);
                setAgentStatus(`⚠️ Blocked: Transaction needs resolution`);
            } else {
                // Success - continue with remaining waiting items
                setIsProcessing(false);
                setAgentStatus("");
                setTimeout(() => resumeWaitingItems(), 300);
            }
        } catch (err) {
            setResults(prev => prev.map(r =>
                r.id === itemId ? {
                    ...r,
                    status: "failed",
                    result: { status: "failed", reason: err.response?.data?.detail || err.message }
                } : r
            ));
            setIsProcessing(false);
            setAgentStatus("");
        }
    };

    const retryBlocked = async () => {
        // Get IDs of blocked/waiting items to retry (in their current order in results)
        const blockedOrWaitingIds = results
            .filter(r => r.status === 'blocked' || r.result?.status === 'blocked' || r.status === 'waiting')
            .map(r => r.id);

        if (blockedOrWaitingIds.length === 0) return;

        setIsProcessing(true);
        setCurrentIndex(0);

        // Process each blocked/waiting item ONE AT A TIME, updating IN-PLACE (no removal/re-add)
        for (let i = 0; i < blockedOrWaitingIds.length; i++) {
            const itemId = blockedOrWaitingIds[i];

            // Get current item from results (may have changed during processing)
            let currentItem = null;
            setResults(prev => {
                currentItem = prev.find(r => r.id === itemId);
                return prev;
            });
            await new Promise(r => setTimeout(r, 10)); // Let state settle

            if (!currentItem) continue;
            const msg = currentItem.sms;

            setCurrentIndex(i);
            setAgentStatus(`🤖 Gemini: Retrying SMS ${i + 1} of ${blockedOrWaitingIds.length}...`);

            // Update this item to 'parsing' status in-place
            setResults(prev => prev.map(r =>
                r.id === itemId ? { ...r, status: "parsing" } : r
            ));

            try {
                await new Promise(r => setTimeout(r, 100));

                const res = await axios.post(`${API_URL}/api/sms/ingest`, {
                    sender: "WebUI",
                    body: msg
                });

                const result = { id: itemId, sms: msg, ...res.data };

                if (res.data.status === "pending_action") {
                    result.accounts = res.data.accounts;
                    result.credit_cards = res.data.credit_cards;
                    result.transaction_id = res.data.transaction_id;
                }

                // Update this item with result IN-PLACE (no appending)
                setResults(prev => prev.map(r =>
                    r.id === itemId ? {
                        ...r,
                        status: res.data.status,
                        result: { ...result, steps: [{ time: new Date().toLocaleTimeString(), action: "Retried", detail: `Status: ${res.data.status}` }] }
                    } : r
                ));

                // SEQUENTIAL: Stop on pending_action - user needs to resolve first
                if (res.data.status === "pending_action") {
                    setAgentStatus(`⏳ Waiting: This SMS needs account selection before continuing`);
                    setIsProcessing(false);
                    return; // Exit - resumeWaitingItems will handle remaining items after resolution
                }

                if (res.data.status === "blocked") {
                    setAgentStatus(`⚠️ Blocked: ${res.data.blocked_count} pending transaction(s) need resolution`);
                    setIsProcessing(false);
                    return;
                }
            } catch (err) {
                setResults(prev => prev.map(r =>
                    r.id === itemId ? {
                        ...r,
                        status: "failed",
                        result: { status: "failed", reason: err.response?.data?.detail || err.message }
                    } : r
                ));
            }
        }

        setIsProcessing(false);
        setAgentStatus("");
        setCurrentIndex(-1);

        if (onTransactionCreated) setTimeout(() => onTransactionCreated(), 200);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case "success": return <CheckCircle className="text-emerald-400" size={18} />;
            case "pending_action": return <AlertTriangle className="text-amber-400" size={18} />;
            case "declined": return <XCircle className="text-orange-400" size={18} />;
            case "ignored": return <XCircle className="text-gray-400" size={18} />;
            case "failed": return <XCircle className="text-red-400" size={18} />;
            case "blocked": return <Ban className="text-orange-400" size={18} />;
            case "duplicate": return <Copy className="text-purple-400" size={18} />;
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
            duplicate: "bg-purple-500/20 text-purple-400 border-purple-500/30",
            parsing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
            waiting: "bg-slate-500/20 text-slate-400 border-slate-500/30"
        };
        return `px-2 py-0.5 rounded text-xs font-medium border ${styles[status] || styles.waiting}`;
    };

    const clearResults = () => {
        setResults([]);
        setProcessingQueue([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    const hasBlockedMessages = results.some(r => r.status === 'blocked' || r.result?.status === 'blocked');
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
                <div className="bg-slate-800 rounded-xl border border-blue-500/50 p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Loader2 size={18} className="text-blue-400 animate-spin" />
                            Processing ({currentIndex + 1} of {processingQueue.length})
                        </h3>
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
                    {agentStatus && (
                        <div className="text-sm text-blue-300 bg-blue-900/30 rounded-lg px-3 py-2 font-mono">
                            {agentStatus}
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
                            Processing Results ({allItems.length})
                        </h3>
                        <div className="flex gap-2">
                            {hasBlockedMessages && !isProcessing && (
                                <button
                                    type="button"
                                    onClick={retryBlocked}
                                    className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                                >
                                    <RefreshCw size={14} /> Retry Blocked
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={clearResults}
                                className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
                            >
                                <RefreshCw size={14} /> Clear
                            </button>
                        </div>
                    </div>

                    {/* SMS Rows with Expandable Details */}
                    <div className="divide-y divide-slate-700">
                        {processingQueue.map((item, idx) => (
                            <SMSRow
                                key={`q-${item.id}`}
                                item={item}
                                index={idx}
                                isExpanded={expandedRows.has(item.id)}
                                onToggle={() => toggleExpand(item.id)}
                                getStatusIcon={getStatusIcon}
                                getStatusBadge={getStatusBadge}
                                onAccountSelect={handleAccountSelect}
                                onIgnore={handleIgnore}
                                accounts={accounts}
                            />
                        ))}
                        {results.map((item, idx) => (
                            <SMSRow
                                key={`r-${item.id}`}
                                item={item}
                                index={processingQueue.length + idx}
                                isExpanded={expandedRows.has(item.id)}
                                onToggle={() => toggleExpand(item.id)}
                                getStatusIcon={getStatusIcon}
                                getStatusBadge={getStatusBadge}
                                onAccountSelect={handleAccountSelect}
                                onIgnore={handleIgnore}
                                accounts={accounts}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Individual SMS Row Component with expandable details
const SMSRow = ({ item, index, isExpanded, onToggle, getStatusIcon, getStatusBadge, onAccountSelect, onIgnore, accounts }) => {
    const r = item.result || {};
    const tx = r.transaction;
    const status = r.status || item.status;
    const steps = r.steps || item.steps || [];
    const parsed = r.parsed;

    return (
        <div className={`transition ${item.status === 'parsing' ? 'bg-blue-900/20' : 'hover:bg-slate-700/30'}`}>
            {/* Main Row */}
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
                <button type="button" className="text-gray-400 hover:text-white p-1">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className="text-gray-500 text-sm w-6">{index + 1}</span>
                <div className="flex items-center gap-2 min-w-[120px]">
                    {getStatusIcon(status)}
                    <span className={getStatusBadge(status)}>
                        {status?.toUpperCase().replace("_", " ")}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">
                        {tx?.merchant || parsed?.description || parsed?.merchant || "Processing..."}
                    </div>
                    <div className="text-xs text-gray-500 font-mono truncate">
                        {item.sms.length > 80 ? item.sms.substring(0, 80) + "..." : item.sms}
                    </div>
                </div>
                <div className="text-right min-w-[100px]">
                    {tx ? (
                        <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(tx.amount)}
                        </span>
                    ) : parsed?.amount ? (
                        <span className="text-gray-400 font-mono">{parsed.amount}</span>
                    ) : "-"}
                </div>
                <div className="min-w-[180px]">
                    {status === "pending_action" && r.accounts ? (
                        <div className="flex flex-wrap gap-1 items-center">
                            {r.accounts.slice(0, 2).map(acc => (
                                <button
                                    type="button"
                                    key={acc.id}
                                    onClick={(e) => { e.stopPropagation(); onAccountSelect(r.transaction_id || item.id, acc.id, false); }}
                                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded border border-slate-600 transition"
                                >
                                    {acc.name.length > 10 ? acc.name.substring(0, 10) + "..." : acc.name}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onIgnore(item.id, r.transaction_id); }}
                                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-gray-200 text-xs rounded border border-gray-500 transition"
                                title="Skip this SMS"
                            >
                                Skip
                            </button>
                        </div>
                    ) : tx?.account_name ? (
                        <span className="text-gray-400 text-sm">{tx.account_name}</span>
                    ) : r.reason ? (
                        <span className="text-xs text-gray-500">{r.reason}</span>
                    ) : null}
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="bg-slate-900/50 border-t border-slate-700 px-6 py-4 space-y-4">
                    {/* Original SMS */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-2">
                            <Eye size={12} /> Original SMS
                        </h4>
                        <pre className="text-xs text-gray-300 bg-black/30 p-3 rounded-lg font-mono whitespace-pre-wrap max-h-32 overflow-y-auto border border-slate-700">
                            {item.sms}
                        </pre>
                    </div>

                    {/* Parsed Data */}
                    {parsed && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">🤖 Gemini Parsed Data</h4>
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                    <span className="text-gray-500">Type:</span>
                                    <span className={`ml-2 font-bold ${parsed.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {parsed.type?.toUpperCase() || 'N/A'}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Amount:</span>
                                    <span className="ml-2 text-white font-mono">{parsed.amount || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Merchant:</span>
                                    <span className="ml-2 text-white">{parsed.description || parsed.merchant || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Category:</span>
                                    <span className="ml-2 text-blue-400">{parsed.category || 'N/A'}</span>
                                </div>
                                {parsed.card_last_4 && (
                                    <div>
                                        <span className="text-gray-500">Card:</span>
                                        <span className="ml-2 text-white font-mono">•••• {parsed.card_last_4}</span>
                                    </div>
                                )}
                                {parsed.currency && (
                                    <div>
                                        <span className="text-gray-500">Currency:</span>
                                        <span className="ml-2 text-white">{parsed.currency}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Processing Steps Timeline */}
                    {steps.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">📋 Processing Timeline</h4>
                            <div className="space-y-1">
                                {steps.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                        <span className="text-gray-600 font-mono w-20 flex-shrink-0">{step.time}</span>
                                        <span className={`font-bold w-16 flex-shrink-0 ${step.action === 'Complete' ? 'text-emerald-400' :
                                            step.action === 'Failed' || step.action === 'Blocked' ? 'text-red-400' :
                                                step.action === 'Pending' ? 'text-amber-400' :
                                                    'text-blue-400'
                                            }`}>{step.action}</span>
                                        <span className="text-gray-400">{step.detail}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Transaction Result */}
                    {tx && (
                        <div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">✅ Created Transaction</h4>
                            <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-800/30 text-xs">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    <div><span className="text-gray-500">ID:</span> <span className="text-white font-mono">{tx.id?.substring(0, 8)}...</span></div>
                                    <div><span className="text-gray-500">Merchant:</span> <span className="text-white">{tx.merchant}</span></div>
                                    <div><span className="text-gray-500">Amount:</span> <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(tx.amount)}</span></div>
                                    <div><span className="text-gray-500">Account:</span> <span className="text-white">{tx.account_name || 'N/A'}</span></div>
                                    <div><span className="text-gray-500">Category:</span> <span className="text-blue-400">{tx.category || 'N/A'}</span></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SMSIngestTab;
