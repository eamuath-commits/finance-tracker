import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, AlertCircle, RefreshCw, Receipt, Link2 } from 'lucide-react';
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
    const [distributionResult, setDistributionResult] = useState(null);

    const [editableAmounts, setEditableAmounts] = useState({});
    const [surplusTargetId, setSurplusTargetId] = useState('');

    // Link Suggestions Modal State
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkingTransferId, setLinkingTransferId] = useState(null);
    const [linkingTransferInfo, setLinkingTransferInfo] = useState(null);
    const [suggestedTransactions, setSuggestedTransactions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

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
        if (!confirm(`Execute transfer of ${formatCurrency(overrideAmount)} ?`)) return;

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
                        `Partial Transfer to ${p.target}: Transferred ${formatCurrency(p.transferred)} (Shortage: ${formatCurrency(p.shortage)})`
                    ).join('\n');
                    alert(`⚠️ Source Account Shortage Detected:\n\n${msg}\n\nTransferred available balance.`);
                }
            }

            // Re-fetch preview to show updated status (transferred items)
            const previewRes = await axios.post(`${API_URL}/allocation/preview`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset
            });
            setPreviewData(previewRes.data);

            // Refresh Account Balances
            const accRes = await axios.get(`${API_URL}/accounts/`);
            setAccounts(accRes.data);

            // Note: Don't show suggestion modal here - the transactions created by
            // the distributor are internal records, not SMS-parsed transactions to link

        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer execution failed.");
        } finally {
            setDistributing(false);
        }
    };

    const handleLinkTransaction = async (transactionId) => {
        if (!linkingTransferId) return;

        try {
            await axios.post(`${API_URL}/payroll-transfers/${linkingTransferId}/link?transaction_id=${transactionId}`);
            setShowLinkModal(false);
            setLinkingTransferId(null);
            setLinkingTransferInfo(null);
            setSuggestedTransactions([]);
        } catch (err) {
            console.error("Error linking transaction:", err);
            alert("Failed to link transaction");
        }
    };

    const handleSkipLinking = () => {
        setShowLinkModal(false);
        setLinkingTransferId(null);
        setLinkingTransferInfo(null);
        setSuggestedTransactions([]);
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

    // Group allocations by target account
    const groupedAllocations = React.useMemo(() => {
        if (!previewData?.allocations) return [];

        const byAccount = {};
        previewData.allocations.forEach(item => {
            const accId = item.target_account_id;
            if (!byAccount[accId]) {
                byAccount[accId] = {
                    target_account_id: accId,
                    target_account_name: item.target_account_name,
                    items: [],
                    pendingAmount: 0,
                    allocatedAmount: 0,
                    transferredAmount: 0,
                    coveredAmount: 0,
                    totalRequired: 0
                };
            }

            const isAllocated = item.status === 'allocated';
            const isTransferred = item.status === 'transferred';
            const isCovered = item.status === 'covered';

            // Use edited amount if available (only for pending items)
            const amount = (!isAllocated && !isTransferred && !isCovered && editableAmounts[item.identifier] !== undefined)
                ? editableAmounts[item.identifier]
                : item.amount;

            byAccount[accId].items.push({
                ...item,
                editedAmount: amount
            });

            if (isAllocated) {
                byAccount[accId].allocatedAmount += amount;
            } else if (isTransferred) {
                byAccount[accId].transferredAmount += amount;
            } else if (isCovered) {
                byAccount[accId].coveredAmount += item.required_amount;  // Track required amount for display
            } else {
                byAccount[accId].pendingAmount += amount;
            }
            byAccount[accId].totalRequired += item.required_amount;
        });

        // Sort by target account balance (ascending) - prioritize accounts with less money
        const groups = Object.values(byAccount);
        groups.sort((a, b) => {
            const balA = accounts.find(acc => acc.id === a.target_account_id)?.current_balance || 0;
            const balB = accounts.find(acc => acc.id === b.target_account_id)?.current_balance || 0;
            return balA - balB; // Lowest balance first
        });

        return groups;
    }, [previewData, editableAmounts, accounts]);

    // Calculate dynamic total based on pending amounts only
    const currentDistributingTotal = groupedAllocations.reduce((sum, group) => sum + group.pendingAmount, 0);

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

                {/* --- TAB 1: RULES MANAGER --- */}
                {activeTab === 'manager' && (
                    <AllocationRules accounts={accounts} />
                )}

                {/* --- TAB 3: PAYROLL TRANSFERS --- */}
                {activeTab === 'transfers' && (
                    <Distributions accounts={accounts} />
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
                                    {groupedAllocations.map((group, idx) => {
                                        const sourceBalance = accounts.find(a => a.id === sourceAccountId)?.current_balance || 0;
                                        const targetAcc = accounts.find(a => a.id === group.target_account_id);

                                        // Calculate cumulative spent before this group
                                        const previousPending = groupedAllocations
                                            .slice(0, idx)
                                            .reduce((sum, g) => sum + g.pendingAmount, 0);
                                        const remainingBefore = sourceBalance - previousPending;

                                        // Shortage based on what's left after previous transfers
                                        const shortage = Math.max(0, group.pendingAmount - remainingBefore);
                                        const willTransfer = Math.max(0, group.pendingAmount - shortage);
                                        const isPartial = shortage > 0 && willTransfer > 0;
                                        const isFullShortage = willTransfer === 0 && group.pendingAmount > 0;
                                        const hasAllocated = group.allocatedAmount > 0;
                                        const hasPending = group.pendingAmount > 0;
                                        const hasTransferred = group.transferredAmount > 0;
                                        const hasCovered = group.coveredAmount > 0;

                                        // Card color: green if fully transferred/covered, red if full shortage, amber if partial, default otherwise
                                        const cardClass = (hasTransferred || hasCovered) && !hasPending
                                            ? 'bg-emerald-900/20 border-emerald-500/40'
                                            : isFullShortage
                                                ? 'bg-red-900/10 border-red-500/30'
                                                : isPartial
                                                    ? 'bg-amber-900/10 border-amber-500/30'
                                                    : 'bg-slate-800/40 border-slate-700';

                                        return (
                                            <div key={group.target_account_id} className={`relative flex flex-col gap-4 p-5 rounded-2xl border transition-all hover:shadow-lg hover:border-slate-600 ${cardClass}`}>

                                                {/* Header: Target Account Name */}
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Transfer To</span>
                                                        <h3 className="font-bold text-xl text-emerald-400 leading-snug" title={group.target_account_name}>{group.target_account_name}</h3>
                                                    </div>
                                                    <div className="text-right">
                                                        {targetAcc && (
                                                            <>
                                                                <span className="text-[10px] text-gray-500 block">Current Balance</span>
                                                                <span className="text-sm text-gray-300 font-mono">{formatCurrency(targetAcc.current_balance)}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Amount Display */}
                                                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                                    {/* Main totals */}
                                                    <div className="flex justify-between items-baseline mb-3">
                                                        <span className="text-sm font-medium text-gray-400">
                                                            {hasTransferred && !hasPending ? 'Already Transferred' : hasPending ? 'Pending Transfer' : 'Allocated'}
                                                        </span>
                                                        <span className={`text-2xl font-bold font-mono ${hasTransferred && !hasPending ? 'text-emerald-400' : 'text-white'}`}>
                                                            {formatCurrency(group.pendingAmount + group.allocatedAmount + group.transferredAmount)}
                                                        </span>
                                                    </div>

                                                    {/* Status badges */}
                                                    {(hasAllocated || hasPending || hasTransferred || hasCovered || shortage > 0) && (
                                                        <div className="flex gap-2 mb-3 flex-wrap">
                                                            {hasTransferred && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                                                    <CheckCircle size={10} />
                                                                    {formatCurrency(group.transferredAmount)} Transferred This Month
                                                                </span>
                                                            )}
                                                            {hasCovered && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30">
                                                                    <CheckCircle size={10} />
                                                                    {formatCurrency(group.coveredAmount)} Covered by Balance
                                                                </span>
                                                            )}
                                                            {hasAllocated && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                                                                    <CheckCircle size={10} />
                                                                    {formatCurrency(group.allocatedAmount)} Paid
                                                                </span>
                                                            )}
                                                            {hasPending && !isFullShortage && (
                                                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${isPartial ? 'text-amber-400 bg-amber-500/20' : 'text-emerald-400 bg-emerald-500/20'} px-2 py-0.5 rounded`}>
                                                                    {isPartial ? formatCurrency(willTransfer) : formatCurrency(group.pendingAmount)} Can Transfer
                                                                </span>
                                                            )}
                                                            {/* Shortage warning */}
                                                            {shortage > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/20 px-2 py-0.5 rounded border border-red-500/30">
                                                                    <AlertCircle size={10} />
                                                                    {formatCurrency(shortage)} Shortage
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Breakdown of contributing items */}
                                                    <div className="space-y-2 mt-3 pt-3 border-t border-slate-700/50">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Breakdown</span>
                                                        {group.items.map((item, i) => {
                                                            const isAllocated = item.status === 'allocated';
                                                            const isTransferred = item.status === 'transferred';
                                                            const isCovered = item.status === 'covered';
                                                            const isDisabled = isAllocated || isTransferred || isCovered;
                                                            return (
                                                                <div key={item.identifier} className={`flex justify-between items-center text-sm ${isDisabled ? 'opacity-60' : ''}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        {isTransferred ? (
                                                                            <CheckCircle size={12} className="text-emerald-500" />
                                                                        ) : isCovered ? (
                                                                            <CheckCircle size={12} className="text-cyan-500" />
                                                                        ) : isAllocated ? (
                                                                            <CheckCircle size={12} className="text-blue-500" />
                                                                        ) : (
                                                                            <span className={`w-2 h-2 rounded-full ${item.rule_type === 'LOAN' ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                                                                        )}
                                                                        <span className={`truncate max-w-[140px] ${isDisabled ? 'text-gray-500' : 'text-gray-300'}`} title={item.name}>
                                                                            {item.name}
                                                                            {isTransferred && <span className="text-[9px] text-emerald-400 ml-1">(done)</span>}
                                                                            {isCovered && <span className="text-[9px] text-cyan-400 ml-1">(covered)</span>}
                                                                        </span>
                                                                    </div>
                                                                    {isDisabled ? (
                                                                        <span className={`font-mono text-sm ${isTransferred ? 'text-emerald-500' : isCovered ? 'text-cyan-500' : 'text-blue-500'}`}>
                                                                            {isCovered ? formatCurrency(item.required_amount) : formatCurrency(item.amount)}
                                                                        </span>
                                                                    ) : (
                                                                        <input
                                                                            type="number"
                                                                            value={item.editedAmount}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value) || 0;
                                                                                setEditableAmounts(prev => ({
                                                                                    ...prev,
                                                                                    [item.identifier]: val
                                                                                }));
                                                                            }}
                                                                            className="w-24 bg-slate-800 text-right font-mono text-sm py-1 px-2 rounded border border-slate-600 focus:border-emerald-500 outline-none text-white"
                                                                        />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Gap Warning - only for pending */}
                                                {hasPending && (group.totalRequired - (group.pendingAmount + group.allocatedAmount)) > 0.01 && (
                                                    <div className="flex items-start gap-2 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                                                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Source Limit Reached</span>
                                                            <span className="text-xs text-amber-400/80">
                                                                Coverage Gap: <span className="text-amber-400 font-bold">{formatCurrency(group.totalRequired - (group.pendingAmount + group.allocatedAmount))}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Execute Button - only show if there are pending items */}
                                                {hasPending ? (
                                                    <div className="mt-auto pt-2">
                                                        <button
                                                            onClick={() => handleExecute(group.target_account_id, willTransfer > 0 ? willTransfer : group.pendingAmount)}
                                                            disabled={distributing || isFullShortage}
                                                            className={`w-full py-3.5 ${isFullShortage
                                                                ? 'bg-red-600/50 cursor-not-allowed'
                                                                : isPartial
                                                                    ? 'bg-amber-600 hover:bg-amber-500'
                                                                    : 'bg-emerald-600 hover:bg-emerald-500'
                                                                } text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
                                                        >
                                                            {isFullShortage ? (
                                                                <><AlertCircle size={18} /><span>No Funds Available</span></>
                                                            ) : isPartial ? (
                                                                <><span>Distribute {formatCurrency(willTransfer)}</span><ArrowRight size={18} /></>
                                                            ) : (
                                                                <><span>Distribute {formatCurrency(group.pendingAmount)}</span><ArrowRight size={18} /></>
                                                            )}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="mt-auto pt-2 text-center">
                                                        <span className="inline-flex items-center gap-2 text-sm text-emerald-400 font-medium">
                                                            <CheckCircle size={16} />
                                                            All items transferred this month
                                                        </span>
                                                    </div>
                                                )}
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
                                                            acc => acc.account_type === 'Savings' || acc.account_type === 'Investment'
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
                                                        {distributing ? <RefreshCw className="animate-spin w-4 h-4" /> : 'Transfer'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {groupedAllocations.length === 0 && (
                                        <div className="col-span-full text-center py-12 text-gray-500">
                                            <p className="text-lg font-medium">No transfers needed.</p>
                                            <p className="text-sm">All obligations are covered by existing balances or no allocations needed.</p>
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

            {/* Link Transaction Suggestions Modal */}
            <Modal isOpen={showLinkModal} title="Link Transfer to Transaction" onClose={handleSkipLinking}>
                <div className="space-y-4">
                    {linkingTransferInfo && (
                        <div className="bg-slate-700/50 p-3 rounded-lg text-sm">
                            <div className="text-slate-400 text-xs uppercase font-bold mb-1">Transfer Executed</div>
                            <div className="text-white font-semibold">{linkingTransferInfo.target}</div>
                            <div className="text-emerald-400 font-mono">{formatCurrency(linkingTransferInfo.amount)}</div>
                        </div>
                    )}

                    <div className="text-slate-400 text-xs uppercase font-bold">Suggested Transactions to Link</div>

                    {loadingSuggestions ? (
                        <div className="text-center py-8 text-slate-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            Finding matching transactions...
                        </div>
                    ) : suggestedTransactions.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {suggestedTransactions.map(tx => (
                                <div
                                    key={tx.id}
                                    className="p-3 rounded-lg border cursor-pointer transition bg-slate-700/50 border-slate-600 hover:border-purple-500 hover:bg-purple-500/10"
                                    onClick={() => handleLinkTransaction(tx.id)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-white font-semibold text-sm">{tx.merchant || 'Transfer'}</div>
                                            <div className="text-slate-400 text-xs">
                                                {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-emerald-400 font-mono text-sm">{formatCurrency(tx.amount)}</div>
                                            <div className="flex items-center gap-1 text-purple-400 text-[10px]">
                                                <Link2 size={10} /> Click to link
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <Link2 className="mx-auto mb-2 opacity-30" size={32} />
                            <div>No matching transactions found.</div>
                            <div className="text-xs mt-1">You can link later from the Distributions tab.</div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleSkipLinking}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition"
                        >
                            Skip for Now
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default Allocation;

