import React, { useState, useMemo } from "react";
import api, { API_URL } from "../utils/api";
import { formatCurrency } from "./UI";
import {
    Upload, FileText, Loader2, CheckCircle2, AlertTriangle, ArrowRight,
    Undo2, ChevronDown, ChevronRight, Scissors, Sparkles, Ban,
} from "lucide-react";

// Overwrite ONLY the counterparty name on statement-imported transactions using
// the real names carried in a bulk bank-SMS export. Upload -> review the diff ->
// apply as one reversible batch. Nothing is created, deleted, or re-amounted.

const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
};

const SKIP_LABELS = {
    already_named: "already had a real name",
    ambiguous_sms: "matched more than one transaction",
    contested_row: "transaction claimed by another message",
    no_match: "no matching transaction",
};

const SMSEnrichTab = ({ onApplied }) => {
    const [stage, setStage] = useState("upload");      // upload | preview | done
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [preview, setPreview] = useState(null);       // {stats, skipped, proposals}
    const [selected, setSelected] = useState(new Set()); // transaction_ids to apply
    const [expanded, setExpanded] = useState(new Set());
    const [applyResult, setApplyResult] = useState(null);
    const [undoing, setUndoing] = useState(false);

    const proposals = preview?.proposals || [];
    const truncatedCount = useMemo(() => proposals.filter(p => p.truncated).length, [proposals]);

    const resetAll = () => {
        setStage("upload"); setFile(null); setPreview(null);
        setSelected(new Set()); setExpanded(new Set()); setApplyResult(null); setError(null);
    };

    const runPreview = async (f) => {
        if (!f) return;
        setLoading(true); setError(null);
        try {
            const fd = new FormData();
            fd.append("file", f);
            const res = await api.post(`${API_URL}/api/sms/enrich/preview`, fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
            setPreview(res.data);
            // Pre-select every proposal — the user confirmed truncated fragments
            // still beat the statement label — but they can review before applying.
            setSelected(new Set((res.data.proposals || []).map(p => p.transaction_id)));
            setStage("preview");
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Failed to read the SMS file. Check it's a plain-text export.");
        } finally {
            setLoading(false);
        }
    };

    const onPick = (f) => { if (f) { setFile(f); runPreview(f); } };

    const toggle = (id) => setSelected(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    const toggleExpand = (id) => setExpanded(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    const selectAll = () => setSelected(new Set(proposals.map(p => p.transaction_id)));
    const selectNone = () => setSelected(new Set());
    const deselectShortened = () => setSelected(prev => {
        const n = new Set(prev); proposals.forEach(p => p.truncated && n.delete(p.transaction_id)); return n;
    });

    const apply = async () => {
        const items = proposals
            .filter(p => selected.has(p.transaction_id))
            .map(p => ({ transaction_id: p.transaction_id, new_merchant: p.new_merchant }));
        if (items.length === 0) return;
        setLoading(true); setError(null);
        try {
            const res = await api.post(`${API_URL}/api/sms/enrich/apply`, { items });
            setApplyResult(res.data);
            setStage("done");
            if (onApplied) onApplied();
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to apply changes.");
        } finally {
            setLoading(false);
        }
    };

    const undo = async () => {
        if (!applyResult?.batch_id) return;
        setUndoing(true); setError(null);
        try {
            await api.post(`${API_URL}/api/sms/enrich/undo/${applyResult.batch_id}`);
            if (onApplied) onApplied();
            resetAll();
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to undo.");
        } finally {
            setUndoing(false);
        }
    };

    // ---------- UPLOAD ----------
    if (stage === "upload") {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-lg">
                    <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                        <Sparkles size={20} className="text-cyan-400" />
                        SMS Name Enrichment
                    </h2>
                    <p className="text-sm text-gray-400 mb-1">
                        Upload a bulk bank-SMS text export. It fills in the real merchant and
                        beneficiary names that the statement PDF left as generic labels.
                    </p>
                    <p className="text-xs text-gray-500 mb-5">
                        Only names are changed, and only on statement-imported transactions —
                        amounts, dates, and accounts are never touched. You review every change before it's applied.
                    </p>

                    <label
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files?.[0]); }}
                        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition ${
                            dragOver ? "border-cyan-500 bg-cyan-500/5" : "border-slate-600 hover:border-slate-500 bg-slate-900/40"}`}
                    >
                        {loading ? (
                            <><Loader2 size={28} className="text-cyan-400 animate-spin" />
                              <span className="text-sm text-gray-300">Parsing and matching…</span></>
                        ) : (
                            <><Upload size={28} className="text-gray-500" />
                              <span className="text-sm text-gray-300 font-medium">Drop a .txt SMS export here, or click to choose</span>
                              <span className="text-xs text-gray-500">{file ? file.name : "Plain-text file exported from your phone"}</span></>
                        )}
                        <input type="file" accept=".txt,text/plain" className="hidden"
                               onChange={e => onPick(e.target.files?.[0])} disabled={loading} />
                    </label>

                    {error && (
                        <div className="mt-4 flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {error}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ---------- DONE ----------
    if (stage === "done" && applyResult) {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-slate-800 rounded-xl border border-emerald-700/40 p-6 shadow-lg text-center">
                    <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-white mb-1">
                        {applyResult.applied} name{applyResult.applied !== 1 ? "s" : ""} updated
                    </h2>
                    <p className="text-sm text-gray-400 mb-5">
                        Applied as one batch. If anything looks wrong you can undo the whole batch.
                    </p>
                    {applyResult.failed?.length > 0 && (
                        <p className="text-xs text-amber-400 mb-4">{applyResult.failed.length} item(s) were skipped server-side.</p>
                    )}
                    <div className="flex gap-3 justify-center">
                        <button onClick={undo} disabled={undoing}
                            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition border border-slate-600">
                            {undoing ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} Undo this batch
                        </button>
                        <button onClick={resetAll}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition">
                            <Upload size={16} /> Enrich another file
                        </button>
                    </div>
                    {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
                </div>
            </div>
        );
    }

    // ---------- PREVIEW ----------
    const stats = preview?.stats || {};
    const skipped = preview?.skipped || {};
    const selectedCount = selected.size;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Summary */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <FileText size={18} className="text-cyan-400" /> {proposals.length} proposed name{proposals.length !== 1 ? "s" : ""}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            from {stats.money_events || 0} money messages · {stats.noise || 0} non-transaction messages ignored
                            {stats.fx_skipped ? ` · ${stats.fx_skipped} foreign-currency skipped` : ""}
                        </p>
                    </div>
                    <button onClick={resetAll} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                        <Upload size={14} /> Start over
                    </button>
                </div>
                {/* what was left alone */}
                <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(skipped).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k} className="text-[11px] text-gray-400 bg-slate-700/40 border border-slate-600/40 rounded px-2 py-0.5">
                            {v} {SKIP_LABELS[k] || k}
                        </span>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <button onClick={selectAll} className="text-cyan-400 hover:text-cyan-300 text-xs">Select all</button>
                    <span className="text-gray-600">·</span>
                    <button onClick={selectNone} className="text-gray-400 hover:text-white text-xs">Select none</button>
                    {truncatedCount > 0 && (
                        <>
                            <span className="text-gray-600">·</span>
                            <button onClick={deselectShortened} className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1">
                                <Scissors size={12} /> Deselect {truncatedCount} shortened
                            </button>
                        </>
                    )}
                    <span className="text-gray-500 text-xs ml-1">{selectedCount} selected</span>
                </div>
                <button onClick={apply} disabled={loading || selectedCount === 0}
                    className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition shadow">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Apply {selectedCount} name{selectedCount !== 1 ? "s" : ""}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {error}
                </div>
            )}

            {/* Proposals */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden divide-y divide-slate-700/60">
                {proposals.map(p => {
                    const on = selected.has(p.transaction_id);
                    const isOpen = expanded.has(p.transaction_id);
                    return (
                        <div key={p.transaction_id} className={`transition ${on ? "" : "opacity-50"}`}>
                            <div className="flex items-center gap-3 px-3 md:px-4 py-2.5">
                                <input type="checkbox" checked={on} onChange={() => toggle(p.transaction_id)}
                                    className="w-4 h-4 accent-cyan-500 flex-shrink-0" />
                                <button onClick={() => toggleExpand(p.transaction_id)} className="text-gray-500 hover:text-white flex-shrink-0">
                                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                                <span className={`text-sm font-medium flex-shrink-0 w-24 text-right ${p.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                                    {p.direction === "credit" ? "+" : "-"}{formatCurrency(p.amount)}
                                </span>
                                <span className="text-xs text-gray-500 w-24 flex-shrink-0 hidden sm:block">{fmtTime(p.tx_timestamp)}</span>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <span className="text-xs text-gray-500 line-through truncate max-w-[40%]">{p.old_merchant || "—"}</span>
                                    <ArrowRight size={13} className="text-gray-600 flex-shrink-0" />
                                    <span className="text-sm text-white font-medium truncate">{p.new_merchant}</span>
                                    {p.truncated && (
                                        <span title="Bank-shortened name" className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1 py-0.5 flex items-center gap-0.5 flex-shrink-0">
                                            <Scissors size={9} /> short
                                        </span>
                                    )}
                                </div>
                            </div>
                            {isOpen && (
                                <div className="px-6 md:px-12 pb-3 pt-0">
                                    <div className="text-[11px] text-gray-500 mb-1.5">
                                        matched the SMS {Math.abs(p.delta_seconds).toFixed(0)}s from the transaction · {p.shape.replace(/_/g, " ")}
                                    </div>
                                    <pre className="text-xs text-gray-400 bg-black/30 p-3 rounded-lg font-mono whitespace-pre-wrap border border-slate-700 max-h-40 overflow-y-auto">{p.raw_sms}</pre>
                                </div>
                            )}
                        </div>
                    );
                })}
                {proposals.length === 0 && (
                    <div className="px-6 py-12 text-center text-gray-500">
                        <Ban size={24} className="mx-auto mb-2 text-gray-600" />
                        No confident name matches in this file.
                    </div>
                )}
            </div>
        </div>
    );
};

export default SMSEnrichTab;
