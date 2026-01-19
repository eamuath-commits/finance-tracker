import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowRight, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { SectionHeader, formatCurrency } from '../components/UI';
import AllocationRules from '../components/AllocationRules';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const Allocation = () => {
    const [activeTab, setActiveTab] = useState('manager'); // 'manager' or 'distributor'
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Distributor State
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [previewData, setPreviewData] = useState(null);
    const [distributing, setDistributing] = useState(false);
    const [distributionResult, setDistributionResult] = useState(null);

    const [editableAmounts, setEditableAmounts] = useState({});
    const [surplusTargetId, setSurplusTargetId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch Accounts separately to ensure they load
            try {
                const accRes = await axios.get(`${API_URL}/accounts/`);
                setAccounts(accRes.data);
            } catch (err) {
                console.error("Failed to fetch accounts", err);
            }

            // Fetch other data if needed
            // const [oblRes] = await Promise.all([
            //     axios.get(`${API_URL}/obligations/`)
            // ]);
            // Obligation categories separate? 
            // For Distributor we might need categories if we want to filter logic, but for now logic is backend driven.
            // Actually, Distributor relies on previewData from backend, so we don't need local categories/rules/loans state!

        } catch (error) {
            console.error("Error fetching allocation data:", error);
        } finally {
            setLoading(false);
        }
    };



    // Auto-select Source Account when accounts load
    useEffect(() => {
        if (accounts.length > 0 && !sourceAccountId) {
            // Find first income account
            const incomeAcc = accounts.find(a => a.is_income);
            if (incomeAcc) setSourceAccountId(incomeAcc.id);
        }
    }, [accounts]);

    // Auto-Run Preview when Source or Tab changes
    useEffect(() => {
        if (activeTab === 'distributor' && sourceAccountId) {
            handleRunPreview();
        }
    }, [activeTab, sourceAccountId]);

    const handleRunPreview = async () => {
        // Clear previous edits on new run ONLY if switching accounts significantly, 
        // but for now let's keep edits if possible? No, safer to reset if source changes context.
        // Actually user might just be toggling source.
        setEditableAmounts({});
        if (!sourceAccountId) return;

        setDistributing(true);
        try {
            const res = await axios.post(`${API_URL}/allocation/preview`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset
            });
            setPreviewData(res.data);
            setDistributionResult(null);
        } catch (error) {
            console.error("Preview failed:", error);
        } finally {
            setDistributing(false);
        }
    };

    const handleExecute = async (targetAccountId, overrideAmount) => {
        if (!confirm(`Execute transfer of ${overrideAmount?.toLocaleString()} SAR?`)) return;

        setDistributing(true);
        try {
            const res = await axios.post(`${API_URL}/allocation/execute`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset,
                target_account_id: targetAccountId,
                override_amount: overrideAmount
            });

            // Check for partial transfers/shortages
            if (res.data.details && res.data.details.length > 0) {
                const partials = res.data.details.filter(d => d.shortage > 0);
                if (partials.length > 0) {
                    const msg = partials.map(p =>
                        `Partial Transfer to ${p.target}: Transferred ${p.transferred.toLocaleString()} (Shortage: ${p.shortage.toLocaleString()})`
                    ).join('\n');
                    alert(`⚠️ Source Account Shortage Detected:\n\n${msg}\n\nTransferred available balance.`);
                }
            }

            // Update Preview Data locally by removing the executed item
            if (previewData) {
                const remaining = previewData.allocations.filter(item => item.target_account_id !== targetAccountId);
                const newTotal = remaining.reduce((sum, item) => sum + item.amount, 0);

                if (remaining.length === 0) {
                    setDistributionResult(res.data);
                    setPreviewData(null);
                    // Refresh Account Balances
                    const accRes = await axios.get(`${API_URL}/accounts/`);
                    setAccounts(accRes.data);
                } else {
                    setPreviewData({
                        ...previewData,
                        total_amount: newTotal,
                        allocations: remaining
                    });
                    // Refresh Account Balances quietly
                    const accRes = await axios.get(`${API_URL}/accounts/`);
                    setAccounts(accRes.data);
                }
            }
        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer execution failed.");
        } finally {
            setDistributing(false);
        }
    };

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

    // Calculate dynamic total based on edits
    const currentDistributingTotal = previewData ? previewData.allocations.reduce((sum, item) => {
        return sum + (editableAmounts[item.identifier] !== undefined ? editableAmounts[item.identifier] : item.amount);
    }, 0) : 0;

    return (
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
                        Rules Manager
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
                </div>
            </div>

            {/* --- TAB 1: RULES MANAGER --- */}
            {activeTab === 'manager' && (
                <AllocationRules accounts={accounts} />
            )}

            {/* --- TAB 2: DISTRIBUTOR --- */}
            {activeTab === 'distributor' && (
                <div className="w-full space-y-6 animate-fade-in">

                    {/* Dashboard Header & Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-center bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <RefreshCw className={`w-6 h-6 text-emerald-500 ${distributing ? 'animate-spin' : ''}`} />
                                Payday Distributor
                            </h2>
                            <div className="text-sm mt-1 flex flex-col sm:flex-row gap-2 sm:gap-6">
                                {previewData ? (
                                    <>
                                        <span className="text-gray-400">Total Obligation: <span className="text-white font-bold">{formatCurrency(previewData.total_required || currentDistributingTotal)}</span></span>
                                        <span className="text-gray-400">Distributing: <span className="text-emerald-400 font-bold">{formatCurrency(currentDistributingTotal)}</span></span>
                                        {((previewData.total_required || currentDistributingTotal) - currentDistributingTotal) > 0.01 && (
                                            <span className="text-amber-500 font-bold">Uncovered Gap: {formatCurrency((previewData.total_required || currentDistributingTotal) - currentDistributingTotal)}</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-gray-500">Calculating transfers...</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="w-full md:w-64">
                                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Source Income Account</label>
                                {renderAccountSelect(
                                    sourceAccountId,
                                    setSourceAccountId,
                                    "Select Source Account",
                                    acc => acc.is_income
                                )}
                            </div>

                            {/* Bal Display */}
                            {sourceAccountId && (
                                <div className="text-right hidden sm:block">
                                    {(() => {
                                        const bal = accounts.find(a => a.id === sourceAccountId)?.current_balance || 0;
                                        const dist = currentDistributingTotal;
                                        const remaining = bal - dist;
                                        return (
                                            <>
                                                <div className="flex items-center justify-end gap-2 text-xs text-gray-500 mb-0.5">
                                                    <span className="uppercase font-bold tracking-wider">Available</span>
                                                    <span className="font-mono text-gray-400">{formatCurrency(bal)}</span>
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Remaining</span>
                                                    <span className={`font-mono font-bold text-xl ${remaining < -0.01 ? 'text-red-400' : Math.abs(remaining) < 0.01 ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                        {formatCurrency(remaining)}
                                                    </span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>

                    {previewData && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {previewData.allocations.map((item, idx) => {
                                    const sourceBalance = accounts.find(a => a.id === sourceAccountId)?.current_balance || 0;
                                    const targetAcc = accounts.find(a => a.id === item.target_account_id);

                                    // Determine amount to use (edited or default)
                                    const currentAmount = editableAmounts[item.identifier] !== undefined
                                        ? editableAmounts[item.identifier]
                                        : item.amount;

                                    const shortage = Math.max(0, currentAmount - sourceBalance);
                                    const willTransfer = Math.max(0, currentAmount - shortage);
                                    const isPartial = shortage > 0;

                                    return (
                                        <div key={idx} className={`relative flex flex-col gap-4 p-5 rounded-2xl border transition-all hover:shadow-lg hover:border-slate-600 ${isPartial ? 'bg-amber-900/10 border-amber-500/30' : 'bg-slate-800/40 border-slate-700'}`}>

                                            {/* Header: Name & Type */}
                                            <div className="flex justify-between items-start gap-4">
                                                <div>
                                                    <h3 className="font-bold text-lg text-white leading-snug line-clamp-2" title={item.name}>{item.name}</h3>
                                                    <span className="inline-block mt-1.5 text-[10px] font-bold text-gray-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50 uppercase tracking-wider">
                                                        {item.rule_type}
                                                    </span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center text-sm font-mono text-gray-400 shrink-0">
                                                    {idx + 1}
                                                </div>
                                            </div>

                                            {/* Target Account Box */}
                                            <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Destination</span>
                                                    <span className="text-emerald-400 font-medium truncate max-w-[150px]">{item.target_account_name}</span>
                                                </div>
                                                {targetAcc && (
                                                    <div className="text-right">
                                                        <span className="text-[10px] text-gray-500 block">Current Bal</span>
                                                        <span className="text-xs text-gray-300 font-mono">{targetAcc.current_balance.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Logic Notes (Gaps/Limits) */}
                                            {((item.required_amount || 0) - item.amount) > 0.01 && (
                                                <div className="mb-4 flex items-start gap-2 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                                                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Source Limit Reached</span>
                                                        <span className="text-xs text-amber-400/80">
                                                            Coverage Gap: <span className="text-amber-400 font-bold">{formatCurrency((item.required_amount || 0) - item.amount)}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Footer: Amount & Action */}
                                            <div className="mt-auto pt-2">
                                                <div className="relative mb-3">
                                                    <label className="absolute -top-2 left-2 bg-slate-800 px-1 text-[10px] text-gray-400">Transfer Amount</label>
                                                    <input
                                                        type="number"
                                                        value={currentAmount}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setEditableAmounts(prev => ({
                                                                ...prev,
                                                                [item.identifier]: val
                                                            }));
                                                        }}
                                                        className={`w-full bg-slate-900 text-right font-mono text-lg py-3 pl-3 pr-10 rounded-xl border focus:ring-2 outline-none transition-all 
                                                            ${((item.required_amount || 0) - item.amount) > 0.01
                                                                ? 'text-amber-500 border-amber-500/50 focus:border-amber-500 ring-amber-500/20'
                                                                : 'text-white border-slate-600 focus:border-emerald-500'}`}
                                                    />
                                                    <span
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-500 pointer-events-none"
                                                        style={{
                                                            maskImage: 'url(/riyal-symbol.png)',
                                                            WebkitMaskImage: 'url(/riyal-symbol.png)',
                                                            maskSize: 'contain',
                                                            WebkitMaskSize: 'contain',
                                                            maskRepeat: 'no-repeat',
                                                            WebkitMaskRepeat: 'no-repeat',
                                                            maskPosition: 'center',
                                                            WebkitMaskPosition: 'center'
                                                        }}
                                                    />
                                                </div>

                                                <button
                                                    onClick={() => handleExecute(item.target_account_id, currentAmount)}
                                                    disabled={distributing || willTransfer <= 0}
                                                    className={`w-full py-3.5 ${isPartial ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
                                                >
                                                    {isPartial ? <span>Confirm Partial Transfer</span> : <span>Confirm Transfer</span>}
                                                    <ArrowRight size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* SURPLUS CARD */}
                                {(() => {
                                    const sourceBalance = accounts.find(a => a.id === sourceAccountId)?.current_balance || 0;
                                    const currentSurplus = Math.max(0, sourceBalance - currentDistributingTotal);

                                    if (currentSurplus < 0.01) return null;

                                    return (
                                        <div className="relative flex flex-col gap-4 p-5 rounded-2xl border border-emerald-500/30 bg-emerald-900/10 transition-all hover:shadow-lg hover:border-emerald-500/50">
                                            {/* Header */}
                                            <div className="flex justify-between items-start gap-4">
                                                <div>
                                                    <h3 className="font-bold text-lg text-white leading-snug">Zero-Based Surplus</h3>
                                                    <span className="inline-block mt-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider">
                                                        Savings Opportunity
                                                    </span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                                    <ArrowRight size={16} />
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-xs text-emerald-200/70 leading-relaxed">
                                                You have <b>{formatCurrency(currentSurplus)}</b> remaining after all obligations.
                                                Transfer this to savings to reach zero-balance.
                                            </p>

                                            {/* Target Selector */}
                                            <div className="mt-auto pt-2 space-y-3">
                                                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-2">Transfer To</span>
                                                    {renderAccountSelect(
                                                        surplusTargetId,
                                                        setSurplusTargetId,
                                                        "Select Savings Account",
                                                        acc => acc.account_type === 'SAVINGS' || acc.account_type === 'INVESTMENT'
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => handleExecute(surplusTargetId, currentSurplus)}
                                                    disabled={!surplusTargetId || distributing}
                                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${!surplusTargetId
                                                        ? 'bg-slate-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                                                        }`}
                                                >
                                                    {distributing ? <RefreshCw className="animate-spin w-4 h-4" /> : 'Confirm Transfer'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                                {previewData.allocations.length === 0 && (
                                    <div className="col-span-full text-center py-12 text-gray-500">
                                        <p className="text-lg font-medium">No transfers needed.</p>
                                        <p className="text-sm">All obligations are covered by existing balances or no bills found.</p>
                                    </div>
                                )}
                            </div>

                            {/* Transparency Logs */}
                            {(previewData.fulfilled_items?.length > 0) && (
                                <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                                    <h3 className="text-blue-400 font-bold mb-2 text-sm uppercase tracking-wider flex items-center gap-2">
                                        <CheckCircle size={16} /> Covered by Existing Balance
                                    </h3>
                                    <ul className="text-sm text-gray-400 space-y-1">
                                        {previewData.fulfilled_items.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {(previewData.skipped_items?.length > 0) && (
                                <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                                    <h3 className="text-gray-400 font-bold mb-2 text-sm uppercase tracking-wider flex items-center gap-2">
                                        <AlertCircle size={16} /> Unallocated Items (No Rule Matched)
                                    </h3>
                                    <ul className="text-sm text-gray-500 space-y-1">
                                        {previewData.skipped_items.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}

                    {distributionResult && (
                        <div className="text-center space-y-6 animate-fade-in py-8">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Success!</h2>
                                <p className="text-gray-300">
                                    Transfers executed successfully.
                                </p>
                                <p className="text-sm text-gray-500 mt-2">Your account balances have been updated.</p>
                            </div>
                            <button
                                onClick={() => { setDistributionResult(null); setSourceAccountId(''); }}
                                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            )
            }
        </div >
    );
};

export default Allocation;
