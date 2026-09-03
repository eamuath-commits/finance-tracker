import React, { useState, useEffect } from "react";
import api, { API_URL } from "../utils/api";
import { Modal } from "./UI";

const money = (v) => Math.abs(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }) : "—");
import { Loader2, Sparkles, CheckCircle2, Cpu, ListChecks } from "lucide-react";

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

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true); setError(null); setRows([]);
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
                                            <div className="text-[12.5px] font-medium text-gray-200 break-words mt-0.5">{r.merchant || "—"}</div>
                                            {r.notes && <div className="text-[10px] text-gray-500 break-words mt-0.5 whitespace-pre-wrap">{r.notes}</div>}
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
