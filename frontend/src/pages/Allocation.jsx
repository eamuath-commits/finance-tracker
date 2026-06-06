import React, { useState, useEffect, useMemo } from 'react';
import api, { API_URL } from '../utils/api';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle, Clock, Receipt } from 'lucide-react';
import { SectionHeader, formatCurrency } from '../components/UI';
import AllocationRules from '../components/AllocationRules';
import Distributions from '../components/Distributions';


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
    const [loadingPreview, setLoadingPreview] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const accRes = await api.get(`${API_URL}/accounts/`);
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
        if (!sourceAccountId) return;

        setLoadingPreview(true);
        try {
            const res = await api.post(`${API_URL}/allocation/preview`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset
            });
            setPreviewData(res.data);
        } catch (error) {
            console.error("Preview failed:", error);
        } finally {
            setLoadingPreview(false);
        }
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
                            Payday Planner
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

                {/* --- TAB 1: RULES MANAGER (Envelopes) --- */}
                {activeTab === 'manager' && (
                    <AllocationRules accounts={accounts} />
                )}

                {/* --- TAB 3: DISTRIBUTIONS --- */}
                {activeTab === 'transfers' && (
                    <Distributions accounts={accounts} />
                )}

                {/* --- TAB 2: PAYDAY PLANNER (Read-Only) --- */}
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
                                        <div className="text-[9px] text-gray-500 uppercase font-bold">Total Required</div>
                                        <div className="text-sm font-mono text-blue-400">{formatCurrency(previewData.total_required)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] text-emerald-400 uppercase font-bold">Distributed</div>
                                        <div className="text-sm font-mono text-emerald-400">{formatCurrency(previewData.total_transferred)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] text-amber-400 uppercase font-bold">Pending</div>
                                        <div className="text-lg font-mono font-bold text-amber-400">{formatCurrency(previewData.total_pending)}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Allocation Table - Read Only */}
                        {loadingPreview ? (
                            <div className="text-center py-16 text-gray-500">
                                <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
                                Loading preview...
                            </div>
                        ) : previewData && (
                            <>
                                {groupedByTarget.map(group => {
                                    const groupRequired = group.items.reduce((s, i) => s + (i.amount || 0), 0);
                                    const groupTransferred = group.items.reduce((s, i) => s + (i.already_transferred || 0), 0);
                                    const groupPending = group.items.reduce((s, i) => s + (i.pending_amount || 0), 0);
                                    const allDone = groupPending <= 0;
                                    const acc = accounts.find(a => a.id === group.target_account_id);

                                    return (
                                        <div key={group.target_account_id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-lg">
                                            {/* Group Header */}
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-700/30">
                                                <div className="flex items-center gap-2">
                                                    <ArrowUpRight size={14} className={allDone ? "text-emerald-400" : "text-slate-500"} />
                                                    <span className="text-white font-semibold text-sm">{group.target_account_name}</span>
                                                    <span className="text-[9px] text-slate-500 font-mono">
                                                        ({group.items.length} items)
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        Required: <span className="text-blue-400">{formatCurrency(groupRequired)}</span>
                                                    </span>
                                                    {groupTransferred > 0 && (
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            Done: <span className="text-emerald-400">{formatCurrency(groupTransferred)}</span>
                                                        </span>
                                                    )}
                                                    {groupPending > 0 && (
                                                        <span className="text-[10px] text-slate-400 font-mono">
                                                            Pending: <span className="text-amber-400 font-semibold">{formatCurrency(groupPending)}</span>
                                                        </span>
                                                    )}
                                                    {acc && (
                                                        <span className="text-[10px] text-slate-500 font-mono">
                                                            Bal: {formatCurrency(acc.current_balance)}
                                                        </span>
                                                    )}
                                                    {/* Status badge for envelope */}
                                                    {allDone ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 uppercase">
                                                            <CheckCircle size={11} /> Distributed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/30 uppercase">
                                                            <Clock size={11} /> Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items Table */}
                                            <table className="w-full text-left table-fixed">
                                                <thead className="bg-slate-800/50">
                                                    <tr className="text-[8px] uppercase font-bold text-slate-500">
                                                        <th className="px-3 py-1.5 w-[35%]">Obligation</th>
                                                        <th className="px-3 py-1.5 text-center w-[10%]">Due</th>
                                                        <th className="px-3 py-1.5 text-right w-[20%]">Required</th>
                                                        <th className="px-3 py-1.5 text-right w-[20%]">Distributed</th>
                                                        <th className="px-3 py-1.5 text-center w-[15%]">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.items.map(item => (
                                                        <tr
                                                            key={item.obligation_id}
                                                            className={`border-b border-slate-700/20 transition-colors ${
                                                                item.status === 'transferred' ? 'bg-emerald-900/10 opacity-60' : 'hover:bg-slate-700/30'
                                                            }`}
                                                        >
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-medium text-white text-[12px] truncate">{item.obligation_name}</span>
                                                                    {item.category && (
                                                                        <span className="text-[8px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{item.category}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className="text-[11px] font-mono text-slate-400">{item.due_day}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                <span className="text-[12px] font-mono text-slate-300">{formatCurrency(item.amount)}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                {item.already_transferred > 0 ? (
                                                                    <span className="text-[12px] font-mono text-emerald-400">{formatCurrency(item.already_transferred)}</span>
                                                                ) : (
                                                                    <span className="text-[12px] font-mono text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                {item.status === 'transferred' ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30 uppercase">
                                                                        <CheckCircle size={8} /> Done
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30 uppercase">
                                                                        <Clock size={8} /> Pending
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })}

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
                                            Unassigned Obligations ({previewData.unassigned_items.length})
                                        </h3>
                                        <p className="text-xs text-amber-300/70 mb-2">These obligations have no target envelope account. Assign them in the Envelopes tab.</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {previewData.unassigned_items.map((name, i) => (
                                                <span key={i} className="text-[10px] bg-amber-900/30 text-amber-300 px-2 py-1 rounded border border-amber-600/20">{name}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default Allocation;
