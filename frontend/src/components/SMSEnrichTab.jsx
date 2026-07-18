import React, { useState, useMemo, useEffect } from "react";
import api, { API_URL } from "../utils/api";
import { formatCurrency } from "./UI";
import {
    Upload, FileText, Loader2, CheckCircle2, AlertTriangle, ArrowRight,
    Undo2, ChevronDown, ChevronRight, Scissors, Sparkles, Ban, RefreshCw, Trash2,
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

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

const Stat = ({ n, label, hint, color, onClick, active }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!onClick || !n}
        title={hint || ""}
        className={`bg-slate-900/40 border rounded-lg px-2 py-2 text-center transition ${
            active ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-700/40'
        } ${onClick && n ? 'hover:border-slate-500 cursor-pointer' : 'cursor-default'}`}
    >
        <p className={`text-lg font-bold font-mono ${color}`}>{n ?? 0}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
    </button>
);

const money = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

// The transactions behind one bucket. For a contested row the competing messages
// are shown too — that is what makes an ambiguous case actionable rather than
// just a count.
const BucketRows = ({ title, note, rows }) => {
    if (!rows?.length) return null;
    return (
        <div className="mt-3 bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
            <p className="text-[11px] text-gray-300 font-semibold mb-1">{title}</p>
            {note && <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">{note}</p>}
            <div className="max-h-72 overflow-y-auto space-y-1">
                {rows.map(r => (
                    <div key={r.transaction_id} className="text-[11px] border-b border-slate-800/60 last:border-b-0 pb-1">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-12 flex-shrink-0">{shortDate(r.timestamp)}</span>
                            <span className={`font-mono w-24 text-right flex-shrink-0 ${r.direction === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {r.direction === 'credit' ? '+' : '−'}{money(r.amount)}
                            </span>
                            <span className="text-gray-300 truncate flex-1">{r.label}</span>
                        </div>
                        {r.candidates?.length > 0 && (
                            <div className="ml-14 mt-0.5 space-y-0.5">
                                {r.candidates.map((c, i) => (
                                    <div key={i} className="text-[10px] text-gray-500 flex items-center gap-2">
                                        <span className="text-amber-500/70">competing:</span>
                                        <span className="text-gray-400 truncate">{c.name || `(${c.shape} — names no one)`}</span>
                                        <span className="text-gray-600">{c.delta_seconds > 0 ? '+' : ''}{c.delta_seconds}s</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Coverage counted from the TRANSACTIONS, which is the question people actually
// ask ("I have N transactions, why did only M get a name?"). Shared by the
// preview screen and the standalone report so both tell the same story.
const CoveragePanel = ({ coverage, openBucket, setOpenBucket, namedLabel = "named by this run", className = "" }) => {
    if (!coverage?.transactions) return null;
    const stuck = (coverage.no_sms_found || 0) + (coverage.sms_has_no_name || 0) + (coverage.contested || 0);
    const toggle = (k) => setOpenBucket(openBucket === k ? null : k);
    return (
        <div className={className}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                    Your {coverage.transactions} statement transactions
                </span>
                <span className="text-[11px] text-gray-500">
                    {pct((coverage.already_named || 0) + (coverage.will_be_named || 0), coverage.transactions)}% have a real name
                </span>
            </div>

            <div className="flex h-2 rounded-full overflow-hidden bg-slate-700/50 mb-3">
                <div className="bg-slate-500" style={{ width: `${pct(coverage.already_named, coverage.transactions)}%` }}
                     title={`${coverage.already_named} already had a real name`} />
                <div className="bg-cyan-500" style={{ width: `${pct(coverage.will_be_named, coverage.transactions)}%` }}
                     title={`${coverage.will_be_named} ${namedLabel}`} />
                <div className="bg-amber-500/60" style={{ width: `${pct(stuck, coverage.transactions)}%` }}
                     title={`${stuck} cannot be named`} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <Stat n={coverage.already_named} label="already named" hint="the statement gave a usable name" color="text-gray-300" />
                <Stat n={coverage.will_be_named} label={namedLabel} color="text-cyan-400" />
                <Stat n={coverage.sms_has_no_name} label="SMS names no one" color="text-amber-400"
                      hint="the matching message is an internal transfer or card settlement — the bank sends only an account or card number. Click to see them."
                      onClick={() => toggle('sms_has_no_name')} active={openBucket === 'sms_has_no_name'} />
                <Stat n={coverage.no_sms_found} label="no SMS found" color="text-amber-400"
                      hint="no message matched this transaction. Click to see them."
                      onClick={() => toggle('no_sms_found')} active={openBucket === 'no_sms_found'} />
                <Stat n={coverage.contested} label="too ambiguous" color="text-amber-400"
                      hint="more than one message could be this row — not guessed. Click to see them and the competing messages."
                      onClick={() => toggle('contested')} active={openBucket === 'contested'} />
            </div>

            {openBucket === 'contested' && (
                <BucketRows
                    title={`${coverage.contested} transactions with more than one possible message`}
                    note="Each had several messages that could plausibly be it, so none was applied rather than guessing. The competing messages are listed under each row."
                    rows={coverage.details?.contested}
                />
            )}
            {openBucket === 'no_sms_found' && (
                <BucketRows
                    title={`${coverage.no_sms_found} transactions with no matching message`}
                    note="No message in your exports matched these on amount, direction and time — usually the SMS was never captured, or it is from a bank whose messages are not in the export."
                    rows={coverage.details?.no_sms_found}
                />
            )}
            {openBucket === 'sms_has_no_name' && (
                <BucketRows
                    title={`${coverage.sms_has_no_name} transactions whose message names no one`}
                    note="A message does match these, but it carries no counterparty — internal transfers, card settlements and ATM withdrawals only quote an account or card number. No amount of uploading will name them."
                    rows={coverage.details?.sms_has_no_name}
                />
            )}
        </div>
    );
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
    const [sources, setSources] = useState([]);   // previously uploaded exports
    const [batches, setBatches] = useState([]);   // previously applied enrichments
    const [reversingId, setReversingId] = useState(null);
    const [openBucket, setOpenBucket] = useState(null);  // which coverage bucket is expanded
    const [report, setReport] = useState(null);          // on-demand coverage report
    const [loadingReport, setLoadingReport] = useState(false);

    // The coverage figures used to live only inside a preview response, so they
    // could be read once and then only by re-uploading. This recomputes them
    // against the current transactions whenever asked, and changes nothing.
    const loadReport = async () => {
        setLoadingReport(true);
        setError(null);
        try {
            const res = await api.get(`${API_URL}/api/sms/enrich/report`, { timeout: 180000 });
            setReport(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || "Could not build the coverage report.");
        } finally {
            setLoadingReport(false);
        }
    };

    const loadSources = () => {
        api.get(`${API_URL}/api/sms/enrich/sources`)
            .then(res => setSources(res.data?.sources || []))
            .catch(() => setSources([]));
    };
    const loadBatches = () => {
        api.get(`${API_URL}/api/sms/enrich/batches`)
            .then(res => setBatches(res.data?.batches || []))
            .catch(() => setBatches([]));
    };
    useEffect(() => { loadSources(); loadBatches(); }, []);

    // Reverse a previously applied batch, from the list rather than only from
    // the screen that created it — the same way a posted statement can be
    // reversed from the statement list at any time.
    const reverseBatch = async (batch) => {
        const ok = window.confirm(
            `Reverse this enrichment?\n\n` +
            `${batch.count} transaction${batch.count !== 1 ? 's' : ''} will go back to their original ` +
            `statement labels (e.g. "${batch.samples?.[0]?.to || ''}" back to "${batch.samples?.[0]?.from || ''}").\n\n` +
            `The names can be re-applied afterwards by running the enrichment again.`
        );
        if (!ok) return;
        setReversingId(batch.batch_id);
        setError(null);
        try {
            await api.post(`${API_URL}/api/sms/enrich/undo/${batch.batch_id}`);
            loadBatches();
            if (onApplied) onApplied();
        } catch (err) {
            setError(err.response?.data?.detail || "Could not reverse that enrichment.");
        } finally {
            setReversingId(null);
        }
    };

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
            loadSources();
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Failed to read the SMS file. Check it's a plain-text export.");
        } finally {
            setLoading(false);
        }
    };

    // Re-run against every stored export — no re-upload needed.
    const runRerun = async () => {
        setLoading(true); setError(null);
        try {
            const res = await api.post(`${API_URL}/api/sms/enrich/rerun`, {}, { timeout: 180000 });
            setPreview(res.data);
            setSelected(new Set((res.data.proposals || []).map(p => p.transaction_id)));
            setStage("preview");
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Re-run failed.");
        } finally {
            setLoading(false);
        }
    };

    const forgetSource = async (id) => {
        try {
            await api.delete(`${API_URL}/api/sms/enrich/sources/${id}`);
            loadSources();
        } catch { /* non-fatal */ }
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

                    {/* Previously uploaded exports — re-run without re-uploading */}
                    {sources.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                                    Saved exports ({sources.length})
                                </span>
                                <button
                                    onClick={runRerun}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 disabled:opacity-50 text-cyan-300 border border-cyan-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                                >
                                    <RefreshCw size={13} /> Re-run enrichment
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-500 mb-2">
                                Re-checks every saved export against your statements. Names you've already
                                applied are left alone — this only fills in what was missed.
                            </p>

                            {/* Coverage report — read-only, repeatable, proposes nothing */}
                            <div className="mb-3">
                                <button
                                    onClick={() => (report ? setReport(null) : loadReport())}
                                    disabled={loadingReport}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 border border-slate-600/50 rounded-lg px-3 py-1.5 transition"
                                >
                                    {loadingReport
                                        ? <><Loader2 size={12} className="animate-spin" />Building report…</>
                                        : <><FileText size={12} />{report ? 'Hide coverage report' : 'Coverage report'}</>}
                                </button>
                                {report?.coverage?.transactions > 0 && (
                                    <div className="mt-3 bg-slate-900/30 border border-slate-700/40 rounded-lg p-3">
                                        <CoveragePanel
                                            coverage={report.coverage}
                                            openBucket={openBucket}
                                            setOpenBucket={setOpenBucket}
                                            namedLabel="would be named now"
                                        />
                                        <p className="text-[10px] text-gray-600 mt-3">
                                            Recomputed against your transactions right now. Nothing was changed.
                                        </p>
                                    </div>
                                )}
                                {report && !report.has_sources && (
                                    <p className="text-[11px] text-amber-400 mt-2">
                                        No saved exports yet — upload one to get a coverage report.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1">
                                {sources.map(s => (
                                    <div key={s.id} className="flex items-center gap-2 text-[11px] text-gray-400 bg-slate-900/40 border border-slate-700/40 rounded px-2 py-1.5">
                                        <FileText size={12} className="text-gray-600 flex-shrink-0" />
                                        <span className="truncate flex-1">{s.filename}</span>
                                        <span className="text-gray-600 flex-shrink-0">{Math.round(s.size / 1024)} KB</span>
                                        <button onClick={() => forgetSource(s.id)} title="Forget this export"
                                            className="text-gray-600 hover:text-red-400 transition flex-shrink-0">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Applied enrichments — reversible at any time, like a posted statement */}
                    {batches.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-700/50">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                                Applied enrichments ({batches.length})
                            </span>
                            <p className="text-[11px] text-gray-500 mt-1 mb-2">
                                Each batch can be reversed at any time — the original statement labels are
                                kept, so reversing puts every name in that batch back.
                            </p>
                            <div className="space-y-1.5">
                                {batches.map(b => (
                                    <div key={b.batch_id} className="flex items-center gap-3 bg-slate-900/40 border border-slate-700/40 rounded px-2.5 py-2">
                                        <Sparkles size={12} className="text-cyan-400 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[11px] text-gray-300">
                                                <span className="font-semibold text-white">{b.count}</span> name{b.count !== 1 ? 's' : ''} applied
                                                {b.applied_at && (
                                                    <span className="text-gray-500">
                                                        {' · '}{new Date(b.applied_at).toLocaleString(undefined, {
                                                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                            {b.samples?.[0] && (
                                                <div className="text-[10px] text-gray-500 truncate">
                                                    e.g. “{b.samples[0].from}” → “{b.samples[0].to}”
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => reverseBatch(b)}
                                            disabled={reversingId === b.batch_id}
                                            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-300 bg-red-600/15 hover:bg-red-600/30 disabled:opacity-50 border border-red-500/30 rounded px-2.5 py-1 transition flex-shrink-0"
                                        >
                                            {reversingId === b.batch_id
                                                ? <><Loader2 size={11} className="animate-spin" />Reversing…</>
                                                : <><Undo2 size={11} />Reverse</>}
                                        </button>
                                    </div>
                                ))}
                            </div>
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
                            <Upload size={16} /> Upload or re-run
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
    const coverage = preview?.coverage || {};
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
                {/* what was left alone (per-message view) */}
                <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(skipped).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k} className="text-[11px] text-gray-400 bg-slate-700/40 border border-slate-600/40 rounded px-2 py-0.5">
                            {v} {SKIP_LABELS[k] || k}
                        </span>
                    ))}
                </div>

                <CoveragePanel
                    coverage={coverage}
                    openBucket={openBucket}
                    setOpenBucket={setOpenBucket}
                    namedLabel="named by this run"
                    className="mt-4 pt-4 border-t border-slate-700/50"
                />
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
