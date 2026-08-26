import React, { useState, useEffect, useCallback } from "react";
import api, { API_URL } from "../utils/api";
import {
    Upload, FileText, Loader2, CheckCircle2, Undo2, ChevronDown, ChevronRight,
    RefreshCw, Trash2, Sparkles, HelpCircle, XCircle, ArrowRight,
} from "lucide-react";

// Persistent SMS-enrichment review. The tab always reflects the LIVE state of the
// user's statement rows against their stored SMS exports (no re-uploading), in
// four buckets: Ready (one confident match -> apply), Needs review (ambiguous ->
// pick), No match (no covering SMS), Enriched (done -> undo). Every action routes
// through the same reversible apply/undo, and re-reads /state so buckets stay
// current. Mirrors the statement review's always-current, resolve-in-place feel.

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }) : "—");
const shortDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { year: "2-digit", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
// How far the SMS sits from the transaction, in words (delta = sms − tx).
const humanTiming = (s) => {
    if (s == null) return "";
    const a = Math.abs(s);
    if (a <= 120) return "~same time";
    const dir = s < 0 ? "earlier" : "later";
    if (a < 3600) return `${Math.round(a / 60)} min ${dir}`;
    if (a < 86400) return `${Math.round(a / 3600)} h ${dir}`;
    const d = Math.round(a / 86400);
    return `${d} day${d > 1 ? "s" : ""} ${dir}`;
};

const Amount = ({ amount, direction }) => (
    <span className={`font-mono w-24 text-right flex-shrink-0 ${direction === "credit" ? "text-emerald-400" : "text-red-400"}`}>
        {direction === "credit" ? "+" : "−"}{money(amount)}
    </span>
);

const DetailRow = ({ label, children }) => (
    <div className="flex gap-2 text-[10px]">
        <span className="text-gray-500 w-20 flex-shrink-0">{label}</span>
        <span className="text-gray-300 flex-1 min-w-0 break-words">{children}</span>
    </div>
);

// Ledger context for an ambiguous row, so the reviewer can decide which name fits.
const DetailPanel = ({ d }) => {
    if (!d) return null;
    const fx = d.original_amount != null && d.original_currency
        ? `${money(d.original_amount)} ${d.original_currency}` : null;
    const empty = !d.account_name && !d.category && !fx && !d.description && !d.notes;
    return (
        <div className="rounded-md border border-slate-700/40 bg-slate-800/30 px-2 py-1.5 mb-2 space-y-0.5">
            {d.account_name && <DetailRow label="Account">{d.account_name}</DetailRow>}
            {d.category && <DetailRow label="Category">{d.category}</DetailRow>}
            {fx && <DetailRow label="Original">{fx}</DetailRow>}
            {d.description && <DetailRow label="Statement">{d.description}</DetailRow>}
            {d.notes && <DetailRow label="Notes">{d.notes}</DetailRow>}
            {empty && <p className="text-[10px] text-gray-500">No extra detail recorded for this row.</p>}
        </div>
    );
};

const Count = ({ n, label, color }) => (
    <div className="flex-1 bg-slate-900/40 border border-slate-700/40 rounded-lg px-2 py-2 text-center">
        <p className={`text-xl font-bold font-mono ${color}`}>{n ?? 0}</p>
        <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{label}</p>
    </div>
);

const Section = ({ icon, title, count, tone, open, onToggle, collapsible, children }) => (
    <div className="mt-3 bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <button type="button" onClick={collapsible ? onToggle : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 ${collapsible ? "hover:bg-slate-700/30 cursor-pointer" : "cursor-default"}`}>
            {icon}
            <span className="text-[12px] font-semibold text-gray-200">{title}</span>
            <span className={`text-[11px] font-mono ${tone}`}>{count}</span>
            <span className="flex-1" />
            {collapsible && (open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />)}
        </button>
        {(!collapsible || open) && children}
    </div>
);

const SMSEnrichTab = ({ onApplied }) => {
    const [st, setSt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);   // key of the row/action in flight
    const [open, setOpen] = useState({ no_match: false, enriched: false });
    const [openDetail, setOpenDetail] = useState({});   // review tx_id -> ledger details expanded
    const [openSms, setOpenSms] = useState({});         // "tx_id:i" -> full SMS expanded
    const [acctFilter, setAcctFilter] = useState("all"); // account label to scope the view

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await api.get(`${API_URL}/api/sms/enrich/state`);
            setSt(res.data);
        } catch (e) {
            setError(e.response?.data?.detail || "Could not load enrichment state.");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const refresh = async () => { await load(); onApplied?.(); };

    const applyItems = async (items, key) => {
        if (!items.length) return;
        setBusy(key); setError(null);
        try {
            await api.post(`${API_URL}/api/sms/enrich/apply`, { items });
            await refresh();
        } catch (e) {
            setError(e.response?.data?.detail || "Failed to apply.");
        } finally { setBusy(null); }
    };

    const asItem = (p, name) => ({
        transaction_id: p.transaction_id, new_merchant: name ?? p.new_merchant,
        raw_sms: p.raw_sms, sms_timestamp: p.sms_timestamp,
    });
    const applyOne = (p) => applyItems([asItem(p)], p.transaction_id);
    const inAcct = (it) => acctFilter === "all" || (it.account || "Unassigned") === acctFilter;
    const applyAll = () => applyItems((st?.ready || []).filter(inAcct).map((p) => asItem(p)), "all");
    const pick = (txId, name, rawSms, smsTs) => applyItems(
        [{ transaction_id: txId, new_merchant: name, raw_sms: rawSms, sms_timestamp: smsTs }], txId);

    const undo = async (txId) => {
        setBusy(txId); setError(null);
        try {
            await api.post(`${API_URL}/api/sms/enrich/undo-transaction/${txId}`);
            await refresh();
        } catch (e) {
            setError(e.response?.data?.detail || "Failed to undo.");
        } finally { setBusy(null); }
    };

    const upload = async (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file) return;
        setBusy("upload"); setError(null);
        try {
            const fd = new FormData(); fd.append("file", file);
            await api.post(`${API_URL}/api/sms/enrich/preview`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            await refresh();
        } catch (e) {
            setError(e.response?.data?.detail || "Upload failed — only .txt SMS exports are accepted.");
        } finally { setBusy(null); }
    };

    const removeSource = async (id) => {
        setBusy(`src-${id}`); setError(null);
        try {
            await api.delete(`${API_URL}/api/sms/enrich/sources/${id}`);
            await refresh();
        } catch (e) {
            setError(e.response?.data?.detail || "Failed to remove source.");
        } finally { setBusy(null); }
    };

    if (loading && !st) {
        return <div className="py-10 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={16} />Loading enrichment state…</div>;
    }

    const c = st?.counts || {};
    const sources = st?.sources || [];

    // Per-account filtering — matching runs across all accounts; this only scopes
    // what the page shows, so managing one account at a time is easier.
    const acctOf = (it) => it.account || "Unassigned";
    const acctList = (() => {
        const m = new Map();
        ["ready", "review", "no_match", "enriched"].forEach((k) =>
            (st?.[k] || []).forEach((it) => m.set(acctOf(it), (m.get(acctOf(it)) || 0) + 1)));
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    })();
    const fReady = (st?.ready || []).filter(inAcct);
    const fReview = (st?.review || []).filter(inAcct);
    const fNoMatch = (st?.no_match || []).filter(inAcct);
    const fEnriched = (st?.enriched || []).filter(inAcct);
    const filtered = acctFilter !== "all";
    const counts = filtered
        ? { ready: fReady.length, review: fReview.length, no_match: fNoMatch.length, enriched: fEnriched.length }
        : c;

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white">SMS Enrichment</h3>
                <span className="text-[11px] text-gray-500 hidden sm:inline">names statement rows from your bank SMS</span>
                <span className="flex-1" />
                <button onClick={load} disabled={loading} className="text-gray-400 hover:text-white p-1.5 rounded transition" title="Refresh">
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {error && <div className="mb-2 text-[11px] text-red-300 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">{error}</div>}

            {/* SMS sources */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">SMS exports</span>
                    <label className="text-[11px] font-semibold text-cyan-300 bg-cyan-600/15 hover:bg-cyan-600/30 border border-cyan-500/30 rounded px-2 py-1 cursor-pointer transition flex items-center gap-1">
                        <Upload size={12} /> {busy === "upload" ? "Uploading…" : "Add .txt"}
                        <input type="file" accept=".txt,.text" className="hidden" onChange={upload} disabled={busy === "upload"} />
                    </label>
                </div>
                {sources.length === 0
                    ? <p className="text-[11px] text-gray-500">No SMS uploaded yet — add a bulk SMS export to name your statement rows.</p>
                    : <div className="space-y-1">
                        {sources.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 text-[11px] text-gray-400">
                                <FileText size={12} className="text-gray-500 flex-shrink-0" />
                                <span className="truncate flex-1">{s.filename}</span>
                                <button onClick={() => removeSource(s.id)} disabled={busy === `src-${s.id}`}
                                    className="text-gray-500 hover:text-red-400 p-0.5 transition" title="Remove">
                                    {busy === `src-${s.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                            </div>
                        ))}
                    </div>}
            </div>

            {/* Account filter */}
            {acctList.length > 1 && (
                <div className="flex items-center gap-2 mt-3">
                    <span className="text-[11px] text-gray-400 flex-shrink-0">Account</span>
                    <select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)}
                        className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-200 outline-none focus:border-cyan-500 cursor-pointer">
                        <option value="all">All accounts</option>
                        {acctList.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
                    </select>
                    {filtered && (
                        <button onClick={() => setAcctFilter("all")} className="text-[11px] text-gray-400 hover:text-white flex-shrink-0">Clear</button>
                    )}
                </div>
            )}

            {/* Bucket counts */}
            <div className="flex gap-2 mt-3">
                <Count n={counts.ready} label="Ready" color="text-cyan-300" />
                <Count n={counts.review} label="Needs review" color="text-amber-300" />
                <Count n={counts.no_match} label="No match" color="text-gray-400" />
                <Count n={counts.enriched} label="Enriched" color="text-emerald-300" />
            </div>

            {/* Ready */}
            {fReady.length > 0 && (
                <Section icon={<Sparkles size={14} className="text-cyan-400" />} title="Ready to name" count={fReady.length} tone="text-cyan-300">
                    <div className="px-3 pb-2">
                        <div className="flex justify-end mb-1">
                            <button onClick={applyAll} disabled={busy === "all"}
                                className="text-[11px] font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded px-2.5 py-1 transition">
                                {busy === "all" ? "Applying…" : `Apply all ${fReady.length}`}
                            </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-1">
                            {fReady.map((p) => (
                                <div key={p.transaction_id} className="flex items-center gap-2 text-[11px] border-b border-slate-800/60 last:border-b-0 py-1">
                                    <span className="text-gray-500 w-14 flex-shrink-0">{shortDate(p.tx_timestamp)}</span>
                                    <Amount amount={p.amount} direction={p.direction} />
                                    <span className="text-gray-500 line-through truncate max-w-[90px]">{p.old_merchant || "—"}</span>
                                    <ArrowRight size={11} className="text-gray-500 flex-shrink-0" />
                                    <span className="text-cyan-200 font-medium truncate flex-1">{p.new_merchant}</span>
                                    <button onClick={() => applyOne(p)} disabled={busy === p.transaction_id}
                                        className="flex-shrink-0 text-[10px] font-semibold text-cyan-300 bg-cyan-600/15 hover:bg-cyan-600/30 disabled:opacity-50 border border-cyan-500/30 rounded px-1.5 py-0.5 transition">
                                        {busy === p.transaction_id ? "…" : "Apply"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>
            )}

            {/* Needs review — one readable card per ambiguous row */}
            {fReview.length > 0 && (
                <Section icon={<HelpCircle size={14} className="text-amber-400" />} title="Needs review — pick a name" count={fReview.length} tone="text-amber-300">
                    <div className="px-3 pb-3 max-h-[30rem] overflow-y-auto space-y-2">
                        {fReview.map((r) => {
                            // Named candidates first, then closest SMS to the transaction.
                            const cands = [...(r.candidates || [])].sort((a, b) =>
                                (a.name ? 0 : 1) - (b.name ? 0 : 1) ||
                                Math.abs(a.delta_seconds ?? 1e12) - Math.abs(b.delta_seconds ?? 1e12));
                            return (
                                <div key={r.transaction_id} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2.5">
                                    {/* Transaction being named */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[11px] text-gray-500 flex-shrink-0">{shortDate(r.timestamp)}</span>
                                        <Amount amount={r.amount} direction={r.direction} />
                                        <span className="text-[11px] text-gray-400 truncate flex-1" title={r.label}>
                                            was <span className="italic text-gray-500">{r.label || "—"}</span>
                                        </span>
                                        {r.detail && (
                                            <button type="button"
                                                onClick={() => setOpenDetail((o) => ({ ...o, [r.transaction_id]: !o[r.transaction_id] }))}
                                                className="flex-shrink-0 text-[10px] font-medium text-gray-400 hover:text-white flex items-center gap-0.5 transition">
                                                {openDetail[r.transaction_id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Details
                                            </button>
                                        )}
                                    </div>

                                    {openDetail[r.transaction_id] && <DetailPanel d={r.detail} />}

                                    {/* Candidate names to choose from */}
                                    <div className="space-y-1.5">
                                        {cands.map((cd, i) => {
                                            const best = i === 0 && !!cd.name;
                                            return (
                                                <div key={i} className={`rounded-md border px-2 py-1.5 ${best ? "border-amber-500/40 bg-amber-600/10" : "border-slate-700/40 bg-slate-800/30"}`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${best ? "bg-amber-400" : "border border-gray-600"}`} />
                                                        <span className="text-[12px] font-medium text-gray-200 flex-1 min-w-0 break-words">
                                                            {cd.name || <span className="italic text-gray-500">this SMS carries no name</span>}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 flex-shrink-0 whitespace-nowrap">{humanTiming(cd.delta_seconds)}</span>
                                                        {cd.name && (
                                                            <button onClick={() => pick(r.transaction_id, cd.name, cd.raw_sms, cd.timestamp)} disabled={busy === r.transaction_id}
                                                                className="flex-shrink-0 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded px-2.5 py-0.5 transition">
                                                                {busy === r.transaction_id ? "…" : "Use"}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {cd.raw_sms && (() => {
                                                        const k = `${r.transaction_id}:${i}`;
                                                        const on = openSms[k];
                                                        return (
                                                            <div className="mt-1 ml-4">
                                                                <button type="button"
                                                                    onClick={() => setOpenSms((o) => ({ ...o, [k]: !o[k] }))}
                                                                    className="flex items-start gap-1 w-full text-left text-[10px] text-gray-500 hover:text-gray-300 transition">
                                                                    {on ? <ChevronDown size={11} className="mt-px flex-shrink-0" /> : <ChevronRight size={11} className="mt-px flex-shrink-0" />}
                                                                    <span className={on ? "whitespace-pre-wrap break-words flex-1" : "truncate flex-1"}>
                                                                        {on ? cd.raw_sms.trim() : cd.raw_sms.replace(/\s+/g, " ").trim()}
                                                                    </span>
                                                                </button>
                                                                {on && cd.timestamp && (
                                                                    <span className="block ml-4 mt-0.5 text-[10px] text-gray-500">SMS sent {shortDateTime(cd.timestamp)}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1.5">None fit? Leave it — it clears when a better SMS export is added.</p>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* No match */}
            {fNoMatch.length > 0 && (
                <Section collapsible open={open.no_match} onToggle={() => setOpen((o) => ({ ...o, no_match: !o.no_match }))}
                    icon={<XCircle size={14} className="text-gray-500" />} title="No matching SMS" count={counts.no_match} tone="text-gray-400">
                    <div className="px-3 pb-2 max-h-72 overflow-y-auto space-y-1">
                        <p className="text-[10px] text-gray-500 mb-1">No SMS names these rows. They clear on their own once you add an SMS export that covers them.</p>
                        {fNoMatch.map((r) => (
                            <div key={r.transaction_id} className="flex items-center gap-2 text-[11px] border-b border-slate-800/60 last:border-b-0 py-1">
                                <span className="text-gray-500 w-14 flex-shrink-0">{shortDate(r.timestamp)}</span>
                                <Amount amount={r.amount} direction={r.direction} />
                                <span className="text-gray-500 truncate flex-1">{r.label}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Enriched */}
            {fEnriched.length > 0 && (
                <Section collapsible open={open.enriched} onToggle={() => setOpen((o) => ({ ...o, enriched: !o.enriched }))}
                    icon={<CheckCircle2 size={14} className="text-emerald-400" />} title="Enriched" count={counts.enriched} tone="text-emerald-300">
                    <div className="px-3 pb-2 max-h-72 overflow-y-auto space-y-1">
                        {fEnriched.map((r) => (
                            <div key={r.transaction_id} className="flex items-center gap-2 text-[11px] border-b border-slate-800/60 last:border-b-0 py-1">
                                <span className="text-gray-500 w-14 flex-shrink-0">{shortDate(r.timestamp)}</span>
                                <span className="font-mono w-24 text-right flex-shrink-0 text-gray-400">{money(r.amount)}</span>
                                <span className="text-emerald-200 truncate flex-1">{r.merchant}</span>
                                {r.was && <span className="text-gray-500 line-through truncate max-w-[90px] hidden sm:inline">{r.was}</span>}
                                <button onClick={() => undo(r.transaction_id)} disabled={busy === r.transaction_id}
                                    className="flex-shrink-0 text-gray-500 hover:text-amber-300 p-0.5 transition" title="Undo">
                                    {busy === r.transaction_id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {st && !st.has_sources && (st.enriched || []).length === 0 && (
                <p className="text-center text-gray-500 text-[12px] mt-6">Upload a bulk SMS export above to start naming your statement transactions.</p>
            )}
        </div>
    );
};

export default SMSEnrichTab;
