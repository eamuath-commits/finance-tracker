import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, AlertCircle, RefreshCw, Receipt, Clock, ArrowUpRight } from 'lucide-react';
import { SectionHeader, formatCurrency, Modal } from '../components/UI';
import AllocationRules from '../components/AllocationRules';
import Distributions from '../components/Distributions';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const Allocation = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'manager';

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
    };
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Distributor State
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [previewData, setPreviewData] = useState(null);
    const [distributing, setDistributing] = useState(false);

    // Editable override amounts per obligation
    const [editableAmounts, setEditableAmounts] = useState({});
    // Selected obligations for batch execute
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [surplusTargetId, setSurplusTargetId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const accRes = await axios.get(`${API_URL}/accounts/`);
            setAccounts(accRes.data);
        } catch (error) {
            console.error("Error fetching allocation data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-select Source Account when accounts load
    useEffect(() => {
        if (accounts.length > 0 && !sourceAccountId) {
            const incomeAcc = accounts.find(a => a.is_income);
            if (incomeAcc) setSourceAccountId(incomeAcc.id);
        }
    }, [accounts]);

    // Auto-Run Preview when Source or Tab changes
    useEffect(() => {
        if (activeTab === 'distributor' && sourceAccountId) {
            handleRunPreview();
        }
    }, [activeTab, sourceAccountId, monthOffset]);

    const handleRunPreview = async () => {
        setEditableAmounts({});
        if (!sourceAccountId) return;

        setDistributing(true);
        try {
            const res = await axios.post(`${API_URL}/allocation/preview`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset
            });
            setPreviewData(res.data);
            // Auto-select all pending items
            const pendingIds = new Set();
            res.data.allocations?.forEach(item => {
                if (item.status === 'pending' || item.status === 'partial') {
                    pendingIds.add(item.obligation_id);
                }
            });
            setSelectedIds(pendingIds);
        } catch (error) {
            console.error("Preview failed:", error);
        } finally {
            setDistributing(false);
        }
    };

    const handleExecuteSelected = async () => {
        if (selectedIds.size === 0) return;

        // Build override amounts for edited items
        const overrides = {};
        selectedIds.forEach(id => {
            if (editableAmounts[id] !== undefined) {
                overrides[id] = editableAmounts[id];
            }
        });

        const totalAmount = getSelectedTotal();
        if (!confirm(`Execute ${selectedIds.size} transfers totaling ${formatCurrency(totalAmount)}?`)) return;

        setDistributing(true);
        try {
            await axios.post(`${API_URL}/allocation/execute`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset,
                obligation_ids: [...selectedIds],
                override_amounts: Object.keys(overrides).length > 0 ? overrides : null
            });

            // Re-fetch preview and accounts
            const [previewRes, accRes] = await Promise.all([
                axios.post(`${API_URL}/allocation/preview`, {
                    source_account_id: sourceAccountId,
                    month_offset: monthOffset
                }),
                axios.get(`${API_URL}/accounts/`)
            ]);
            setPreviewData(previewRes.data);
            setAccounts(accRes.data);
            setSelectedIds(new Set());
            setEditableAmounts({});
        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer execution failed.");
        } finally {
            setDistributing(false);
        }
    };

    const handleExecuteOne = async (obligationId) => {
        const item = previewData?.allocations.find(a => a.obligation_id === obligationId);
        if (!item) return;

        const amount = editableAmounts[obligationId] ?? item.pending_amount;
        if (!confirm(`Distribute ${formatCurrency(amount)} for ${item.obligation_name}?`)) return;

        setDistributing(true);
        try {
            const overrides = editableAmounts[obligationId] !== undefined
                ? { [obligationId]: editableAmounts[obligationId] }
                : null;
            await axios.post(`${API_URL}/allocation/execute`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset,
                obligation_ids: [obligationId],
                override_amounts: overrides
            });

            // Refresh
            const [previewRes, accRes] = await Promise.all([
                axios.post(`${API_URL}/allocation/preview`, {
                    source_account_id: sourceAccountId,
                    month_offset: monthOffset
                }),
                axios.get(`${API_URL}/accounts/`)
            ]);
            setPreviewData(previewRes.data);
            setAccounts(accRes.data);
            selectedIds.delete(obligationId);
            setSelectedIds(new Set(selectedIds));
        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer failed.");
        } finally {
            setDistributing(false);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (!previewData) return;
        const pendingIds = previewData.allocations
            .filter(a => a.status === 'pending' || a.status === 'partial')
            .map(a => a.obligation_id);
        if (selectedIds.size === pendingIds.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pendingIds));
        }
    };

    const getItemAmount = (item) => {
        if (editableAmounts[item.obligation_id] !== undefined) {
            return editableAmounts[item.obligation_id];
        }
        return item.pending_amount;
    };

    const getSelectedTotal = () => {
        if (!previewData) return 0;
        return previewData.allocations
            .filter(a => selectedIds.has(a.obligation_id))
            .reduce((sum, a) => sum + getItemAmount(a), 0);
    };

    // Group allocations by target account for visual grouping
    const groupedByTarget = useMemo(() => {
        if (!previewData?.allocations) return [];
        const groups = {};
        previewData.allocations.forEach(item => {
            const key = item.target_account_id;
            if (!groups[key]) {
                groups[key] = {
                    target_account_id: key,
                    target_account_name: item.target_account_name,
                    items: []
                };
            }
            groups[key].items.push(item);
        });
        // Sort items within each group by due_day
        Object.values(groups).forEach(g => g.items.sort((a, b) => (a.due_day || 0) - (b.due_day || 0)));
        return Object.values(groups).sort((a, b) => a.target_account_name.localeCompare(b.target_account_name));
    }, [previewData]);

    const renderAccountSelect = (currentValue, onChange, placeholder = "Select Account", filterFn = null) => (
        <select
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none w-full"
        >
            <option value="">{placeholder}</option>
            {accounts.filter(acc => filterFn ? filterFn(acc) : true).map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_type})</option>
            ))}
        </select>
    );

    // Date display
    const getMonthLabel = () => {
        const d = new Date();
        d.setMonth(d.getMonth() + monthOffset);
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const selectedTotal = getSelectedTotal();
    const sourceBalance = accounts.find(a => a.id === sourceAccountId)?.current_balance || 0;

    return (
        <>
            <div className="space-y-8 animate-fade-in pb-20">
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <SectionHeader title="Smart Allocation" />
                    <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <button
                            onClick={() => setActiveTab('manager')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'manager'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Envelopes
                        </button>
                        <button
                            onClick={() => setActiveTab('distributor')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'distributor'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Payday Distributor
                        </button>
                        <button
                            onClick={() => setActiveTab('transfers')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'transfers'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <Receipt size={14} />
                            Distributions
                        </button>
                    </div>
                </div>

                {/* --- TAB 1: RULES MANAGER (now "Envelopes") --- */}
                {activeTab === 'manager' && (
                    <AllocationRules accounts={accounts} />
                )}

                {/* --- TAB 3: DISTRIBUTIONS --- */}
                {activeTab === 'transfers' && (
                    <Distributions accounts={accounts} />
                )}

                {/* --- TAB 2: DISTRIBUTOR --- */}
                {activeTab === 'distributor' && (
                    <div className="w-full space-y-5 animate-fade-in">

                        {/* Controls Bar */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 shadow-lg gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-56">
                                    <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1 block">Source Income</label>
                                    {renderAccountSelect(
                                        sourceAccountId,
                                        setSourceAccountId,
                                        "Select Source Account",
                                        acc => acc.is_income
                                    )}
                                </div>
                                {/* Month navigation */}
                                {(() => {
                                    const now = new Date();
                                    const current = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
                                    const selectedMonth = current.getMonth();
                                    const selectedYear = current.getFullYear();

                                    const monthNames = ["January", "February", "March", "April", "May", "June",
                                        "July", "August", "September", "October", "November", "December"];

                                    const setMonthYear = (m, y) => {
                                        const target = new Date(y, m, 1);
                                        const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
                                        setMonthOffset(diff);
                                    };

                                    return (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => setMonthOffset(prev => prev - 1)}
                                                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-2 py-1.5 text-xs transition"
                                            >◀</button>
                                            <select
                                                value={selectedMonth}
                                                onChange={(e) => setMonthYear(parseInt(e.target.value), selectedYear)}
                                                className="bg-slate-700 text-white text-sm rounded-lg px-2 py-1.5 border border-slate-600 outline-none focus:border-blue-500 transition"
                                            >
                                                {monthNames.map((name, i) => (
                                                    <option key={i} value={i}>{name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={selectedYear}
                                                onChange={(e) => setMonthYear(selectedMonth, parseInt(e.target.value))}
                                                className="bg-slate-700 text-white text-sm rounded-lg px-2 py-1.5 border border-slate-600 outline-none focus:border-blue-500 transition"
                                            >
                                                {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => setMonthOffset(prev => prev + 1)}
                                                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-2 py-1.5 text-xs transition"
                                            >▶</button>
                                            {monthOffset !== 0 && (
                                                <button
                                                    onClick={() => setMonthOffset(0)}
                                                    className="text-[10px] text-blue-400 hover:text-blue-300 ml-1 transition font-semibold"
                                                >Today</button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Balance summary */}
                            {sourceAccountId && previewData && (
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Available</div>
                                        <div className="text-sm font-mono text-white">{formatCurrency(sourceBalance)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Total Required</div>
                                        <div className="text-sm font-mono text-blue-400">{formatCurrency(previewData.total_required)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] text-emerald-400 uppercase font-bold">Transferred</div>
                                        <div className="text-sm font-mono text-emerald-400">{formatCurrency(previewData.total_transferred)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] text-amber-400 uppercase font-bold">Pending</div>
                                        <div className="text-lg font-mono font-bold text-amber-400">{formatCurrency(previewData.total_pending)}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Allocation Table */}
                        {previewData && (
                            <>
                                {groupedByTarget.map(group => (
                                    <div key={group.target_account_id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-lg">
                                        {/* Group Header */}
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-700/30">
                                            <div className="flex items-center gap-2">
                                                <ArrowUpRight size={14} className="text-emerald-400" />
                                                <span className="text-white font-semibold text-sm">{group.target_account_name}</span>
                                                <span className="text-[9px] text-slate-500 font-mono">
                                                    ({group.items.length} items)
                                                </span>
                                            </div>
                                            {(() => {
                                                const acc = accounts.find(a => a.id === group.target_account_id);
                                                return acc ? (
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        Balance: {formatCurrency(acc.current_balance)}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>

                                        {/* Items Table */}
                                        <table className="w-full text-left table-fixed">
                                            <thead className="bg-slate-800/50">
                                                <tr className="text-[8px] uppercase font-bold text-slate-500">
                                                    <th className="px-3 py-1.5 w-[4%]"></th>
                                                    <th className="px-3 py-1.5 w-[28%]">Obligation</th>
                                                    <th className="px-3 py-1.5 text-center w-[8%]">Due</th>
                                                    <th className="px-3 py-1.5 text-right w-[15%]">Required</th>
                                                    <th className="px-3 py-1.5 text-right w-[15%]">Transferred</th>
                                                    <th className="px-3 py-1.5 text-right w-[15%]">Pending</th>
                                                    <th className="px-3 py-1.5 text-center w-[8%]">Status</th>
                                                    <th className="px-3 py-1.5 text-center w-[7%]"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(item => {
                                                    const isPending = item.status === 'pending' || item.status === 'partial';
                                                    const isSelected = selectedIds.has(item.obligation_id);
                                                    const editedAmount = getItemAmount(item);

                                                    return (
                                                        <tr
                                                            key={item.obligation_id}
                                                            className={`border-b border-slate-700/20 transition-colors ${
                                                                item.status === 'transferred' ? 'bg-emerald-900/10 opacity-70' :
                                                                isSelected ? 'bg-blue-900/10' : 'hover:bg-slate-700/30'
                                                            }`}
                                                        >
                                                            {/* Checkbox */}
                                                            <td className="px-3 py-2 text-center">
                                                                {isPending && (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSelect(item.obligation_id)}
                                                                        className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                                                                    />
                                                                )}
                                                            </td>
                                                            {/* Obligation Name */}
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-medium text-white text-[12px] truncate">{item.obligation_name}</span>
                                                                    {item.category && (
                                                                        <span className="text-[8px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{item.category}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            {/* Due Day */}
                                                            <td className="px-3 py-2 text-center">
                                                                <span className="text-[11px] font-mono text-slate-400">{item.due_day}</span>
                                                            </td>
                                                            {/* Required Amount */}
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="text-[12px] font-mono text-slate-300">{formatCurrency(item.amount)}</span>
                                                            </td>
                                                            {/* Already Transferred */}
                                                            <td className="px-3 py-2 text-right">
                                                                {item.already_transferred > 0 ? (
                                                                    <span className="text-[12px] font-mono text-emerald-400">{formatCurrency(item.already_transferred)}</span>
                                                                ) : (
                                                                    <span className="text-[12px] font-mono text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                            {/* Pending Amount (editable) */}
                                                            <td className="px-3 py-2 text-right">
                                                                {isPending ? (
                                                                    <input
                                                                        type="number"
                                                                        value={editedAmount}
                                                                        onChange={(e) => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            setEditableAmounts(prev => ({
                                                                                ...prev,
                                                                                [item.obligation_id]: val
                                                                            }));
                                                                        }}
                                                                        className="w-20 bg-slate-700/60 text-right font-mono text-[12px] py-1 px-2 rounded border border-slate-600 focus:border-emerald-500 outline-none text-white"
                                                                    />
                                                                ) : (
                                                                    <span className="text-[12px] font-mono text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                            {/* Status Badge */}
                                                            <td className="px-3 py-2 text-center">
                                                                {item.status === 'transferred' ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase">
                                                                        <CheckCircle size={8} /> Done
                                                                    </span>
                                                                ) : item.status === 'partial' ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 uppercase">
                                                                        <Clock size={8} /> Partial
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase">
                                                                        <Clock size={8} /> Pending
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {/* Individual Execute */}
                                                            <td className="px-3 py-2 text-center">
                                                                {isPending && (
                                                                    <button
                                                                        onClick={() => handleExecuteOne(item.obligation_id)}
                                                                        disabled={distributing}
                                                                        className="text-emerald-400 hover:text-emerald-300 disabled:opacity-30 transition"
                                                                        title={`Distribute ${formatCurrency(editedAmount)}`}
                                                                    >
                                                                        <ArrowRight size={14} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}

                                {/* No items */}
                                {groupedByTarget.length === 0 && previewData.unassigned_items?.length === 0 && (
                                    <div className="text-center py-16 text-gray-500">
                                        <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                                        <p>No obligations found.</p>
                                    </div>
                                )}

                                {/* Unassigned Items Warning */}
                                {previewData.unassigned_items?.length > 0 && (
                                    <div className="bg-amber-900/15 border border-amber-500/25 rounded-xl p-4">
                                        <h3 className="text-amber-400 font-bold mb-2 text-xs uppercase tracking-wider flex items-center gap-2">
                                            <AlertCircle size={14} /> Unassigned Obligations ({previewData.unassigned_items.length})
                                        </h3>
                                        <p className="text-xs text-amber-300/70 mb-2">These obligations have no target envelope account. Assign them in the Envelopes tab.</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {previewData.unassigned_items.map((name, i) => (
                                                <span key={i} className="text-[10px] bg-amber-900/30 text-amber-300 px-2 py-1 rounded border border-amber-600/20">{name}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Batch Execute Bar (sticky bottom) */}
                                {selectedIds.size > 0 && (
                                    <div className="sticky bottom-4 bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-4 shadow-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={toggleSelectAll}
                                                className="text-[10px] text-blue-400 hover:text-blue-300 uppercase font-bold transition"
                                            >
                                                {selectedIds.size === previewData.allocations.filter(a => a.status !== 'transferred').length ? 'Deselect All' : 'Select All'}
                                            </button>
                                            <span className="text-sm text-white">
                                                <span className="font-bold text-emerald-400">{selectedIds.size}</span> items selected
                                            </span>
                                            <span className="text-lg font-mono font-bold text-white">{formatCurrency(selectedTotal)}</span>
                                        </div>
                                        <button
                                            onClick={handleExecuteSelected}
                                            disabled={distributing}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {distributing ? (
                                                <RefreshCw className="animate-spin w-4 h-4" />
                                            ) : (
                                                <>
                                                    <span>Distribute Selected</span>
                                                    <ArrowRight size={16} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Surplus Card */}
                                {(() => {
                                    const currentSurplus = Math.max(0, sourceBalance - (previewData.total_pending + previewData.total_transferred));
                                    if (currentSurplus < 0.01) return null;

                                    return (
                                        <div className="bg-emerald-900/10 border border-emerald-500/25 rounded-xl p-5 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-lg text-white">Zero-Based Surplus</h3>
                                                    <span className="text-[10px] text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider font-bold">
                                                        Savings Opportunity
                                                    </span>
                                                </div>
                                                <span className="text-2xl font-mono font-bold text-emerald-400">{formatCurrency(currentSurplus)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    {renderAccountSelect(
                                                        surplusTargetId,
                                                        setSurplusTargetId,
                                                        "Select Savings Account",
                                                        acc => acc.account_type === 'Savings' || acc.account_type === 'Investment'
                                                    )}
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        if (!surplusTargetId || !confirm(`Transfer ${formatCurrency(currentSurplus)} to savings?`)) return;
                                                        try {
                                                            await axios.post(`${API_URL}/distributions`, {
                                                                source_account_id: sourceAccountId,
                                                                target_account_id: surplusTargetId,
                                                                amount: currentSurplus,
                                                                billing_month: previewData.billing_month,
                                                                note: "Surplus savings transfer"
                                                            });
                                                            handleRunPreview();
                                                        } catch (e) {
                                                            alert("Failed to create surplus transfer");
                                                        }
                                                    }}
                                                    disabled={!surplusTargetId || distributing}
                                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-gray-400 text-white font-bold px-5 py-2 rounded-xl transition"
                                                >
                                                    Transfer
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default Allocation;
