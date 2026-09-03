import React, { useState, useEffect } from "react";
import api, { API_URL } from "../utils/api";
import { Modal } from "./UI";

const money = (v) => Math.abs(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (v) => (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }) : "—");
const longDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
import { Loader2, Sparkles, CheckCircle2, Cpu, ListChecks, ChevronRight } from "lucide-react";

// Review-and-confirm categorization. Fetches suggestions (deterministic rules +
// optional local AI), lets the user tweak/deselect, and applies on confirm.
// Nothing is written until the user clicks Apply.
const CategorySuggestions = ({ isOpen, onClose, onApplied }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);         // {..suggestion, chosen, selected}
    const [cats, setCats] = useState([]);
    const [meta, setMeta] = useState({});
    const [applying, setApplying] = useState(false);
    const [expanded, setExpanded] = useState(() => new Set());  // rows showing full detail
    const toggleExpand = (id) => setExpanded((s) => {
        const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true); setError(null); setRows([]); setExpanded(new Set());
        api.post(`${API_URL}/transactions/categorize`, { scope: "uncategorized", limit: 60 })
            .then((res) => {
                setCats(res.data.categories || []);
                setMeta({ ai_available: res.data.ai_available, ai_used: res.data.ai_used, count: res.data.count });
                setRows((res.data.suggestions || []).map((s) => ({ ...s, chosen: s.category, selected: true })));
            })
            .catch((e) => setError(e.response?.data?.detail || "Could not get suggestions."))
            .finally(() => setLoading(false));
    }, [isOpen]);

    const setRow = (id, patch) => setRows((rs) => rs.map((r) => r.transaction_id === id ? { ...r, ...patch } : r));
    const selectedCount = rows.filter((r) => r.selected).length;
    const allSel = rows.length > 0 && rows.every((r) => r.selected);

    const apply = async () => {
        const items = rows.filter((r) => r.selected).map((r) => ({ transaction_id: r.transaction_id, category: r.chosen }));
        if (!items.length) return;
        setApplying(true); setError(null);
        try {
            await api.post(`${API_URL}/transactions/categorize/apply`, { items });
            onApplied?.();
            onClose();
        } catch (e) {
            setError(e.response?.data?.detail || "Failed to apply.");
        } finally { setApplying(false); }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen={true} title="Suggested categories" onClose={onClose} size="xl">
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-gray-400">
                    <ListChecks size={15} className="text-blue-400" />
                    <span>{rows.length} suggestions</span>
                    <span className="flex-1" />
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${meta.ai_available ? "text-cyan-300 border-cyan-500/30 bg-cyan-600/10" : "text-gray-500 border-slate-700"}`}>
                        <Cpu size={11} /> AI {meta.ai_available ? `on (${meta.ai_used || 0})` : "off — rules only"}
                    </span>
                </div>

                {error && <div className="text-[11px] text-red-300 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">{error}</div>}

                {loading ? (
                    <div className="py-10 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={16} />Categorizing… (a moment while the AI reviews new merchants)</div>
                ) : rows.length === 0 ? (
                    <div className="py-10 text-center text-gray-500 text-sm">Nothing to suggest — everything's categorized. 🎉</div>
                ) : (
                    <>
                        <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer select-none">
                            <input type="checkbox" checked={allSel} onChange={() => setRows((rs) => rs.map((r) => ({ ...r, selected: !allSel })))} className="accent-blue-500" />
                            Select all
                        </label>
                        <div className="max-h-[30rem] overflow-y-auto space-y-2 pr-1">
                            {rows.map((r) => (
                                <div key={r.transaction_id} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2.5">
                                    {/* Full transaction context so you can decide */}
                                    <div className="flex items-start gap-2">
                                        <input type="checkbox" checked={r.selected} onChange={() => setRow(r.transaction_id, { selected: !r.selected })}
                                            className="accent-blue-500 flex-shrink-0 mt-1" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-[11px]">
                                                <span className="text-gray-500 flex-shrink-0">{shortDate(r.timestamp)}</span>
                                                <span className={`font-mono font-semibold ${r.direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>
                                                    {r.direction === "credit" ? "+" : "−"}{money(r.amount)}
                                                </span>
                                                {r.account && <span className="text-gray-500 truncate">· {r.account}</span>}
                                            </div>
                                            <div className="flex items-start gap-1.5 mt-0.5">
                                                <div className="text-[12.5px] font-medium text-gray-200 break-words flex-1 min-w-0">{r.merchant || "—"}</div>
                                                <button type="button" onClick={() => toggleExpand(r.transaction_id)}
                                                    className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-blue-300 transition">
                                                    <ChevronRight size={12} className={`transition-transform ${expanded.has(r.transaction_id) ? "rotate-90" : ""}`} />
                                                    Details
                                                </button>
                                            </div>
                                            {r.notes && <div className="text-[10px] text-gray-500 break-words mt-0.5 whitespace-pre-wrap">{r.notes}</div>}
                                            {expanded.has(r.transaction_id) && (
                                                <div className="mt-2 rounded-md border border-slate-700/60 bg-slate-950/40 p-2 space-y-1.5 text-[10.5px]">
                                                    {r.raw_sms ? (
                                                        <div>
                                                            <div className="text-[9px] uppercase tracking-wide text-gray-600 mb-0.5">Full text</div>
                                                            <div className="text-gray-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed">{r.raw_sms}</div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-600 italic">No original message stored for this row.</div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-slate-800/60">
                                                        <div><span className="text-gray-600">When: </span><span className="text-gray-300">{longDateTime(r.timestamp)}</span></div>
                                                        <div><span className="text-gray-600">Account: </span><span className="text-gray-300">{r.account || "—"}</span></div>
                                                        {r.balance_after != null && <div><span className="text-gray-600">Balance after: </span><span className="text-gray-300 font-mono">{signed(r.balance_after)}</span></div>}
                                                        {r.txn_type && <div><span className="text-gray-600">Bank action: </span><span className="text-gray-300">{r.txn_type}</span></div>}
                                                        {r.origin && <div><span className="text-gray-600">Source: </span><span className="text-gray-300">{r.origin}</span></div>}
                                                        {r.current_category && <div><span className="text-gray-600">Current: </span><span className="text-gray-300">{r.current_category}</span></div>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Decision row */}
                                    <div className="flex items-center gap-2 mt-2 ml-6 flex-wrap">
                                        {r.current_category && <span className="text-[10px] text-gray-500">now: {r.current_category} →</span>}
                                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${r.source === "learned" ? "text-emerald-300 bg-emerald-600/15" : r.source === "ai" ? "text-cyan-300 bg-cyan-600/15" : "text-blue-300 bg-blue-600/15"}`}>
                                            {r.source === "learned" ? "learned" : r.source === "ai" ? "AI" : "rule"}
                                        </span>
                                        <select value={r.chosen} onChange={(e) => setRow(r.transaction_id, { chosen: e.target.value })}
                                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-500 w-40">
                                            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button onClick={onClose} className="px-3 py-2 text-[12px] text-gray-400 hover:text-white transition">Cancel</button>
                            <button onClick={apply} disabled={applying || selectedCount === 0}
                                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2 rounded-lg transition">
                                {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Apply {selectedCount}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default CategorySuggestions;
