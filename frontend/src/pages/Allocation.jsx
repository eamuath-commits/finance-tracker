import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Layers, ArrowRight, CheckCircle, AlertCircle, Save, Trash2, RefreshCw } from 'lucide-react';
import { SectionHeader } from '../components/UI';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const Allocation = () => {
    const [activeTab, setActiveTab] = useState('manager'); // 'manager' or 'distributor'
    const [accounts, setAccounts] = useState([]);
    const [loans, setLoans] = useState([]);
    const [categories, setCategories] = useState([]);
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);

    // Distributor State
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [previewData, setPreviewData] = useState(null);
    const [distributing, setDistributing] = useState(false);
    const [distributionResult, setDistributionResult] = useState(null);

    const [editableAmounts, setEditableAmounts] = useState({});

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

            // Fetch other data
            const [loanRes, ruleRes, oblRes] = await Promise.all([
                axios.get(`${API_URL}/loans/`),
                axios.get(`${API_URL}/allocation/rules`),
                axios.get(`${API_URL}/obligations/`)
            ]);

            setLoans(loanRes.data);
            setRules(ruleRes.data);

            // Extract unique categories from obligations
            const uniqueCats = [...new Set(oblRes.data.map(o => o.category).filter(c => c && c !== 'Loan'))];
            setCategories(uniqueCats);
        } catch (error) {
            console.error("Error fetching allocation data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRule = async (type, identifier, targetAccountId) => {
        try {
            // Check if rule exists
            const existing = rules.find(r => r.identifier === identifier && r.rule_type === type);
            if (existing) {
                // Delete first (since identifier is unique)
                await axios.delete(`${API_URL}/allocation/rules/${existing.id}`);
            }

            if (targetAccountId) {
                // Create new
                const payload = {
                    rule_type: type,
                    identifier: identifier,
                    target_account_id: targetAccountId
                };
                await axios.post(`${API_URL}/allocation/rules`, payload);
            }

            // Refresh rules
            const res = await axios.get(`${API_URL}/allocation/rules`);
            setRules(res.data);
        } catch (error) {
            console.error("Error saving rule:", error);
            alert("Failed to save rule");
        }
    };

    const handleRunPreview = async () => {
        // Clear previous edits on new run
        setEditableAmounts({});
        if (!sourceAccountId) {
            alert("Please select a source account");
            return;
        }
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
            alert("Failed to generate preview");
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
                } else {
                    setPreviewData({
                        ...previewData,
                        total_amount: newTotal,
                        allocations: remaining
                    });
                }

                // Refresh Account Balances
                const accRes = await axios.get(`${API_URL}/accounts/`);
                setAccounts(accRes.data);
            }
        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer execution failed.");
        } finally {
            setDistributing(false);
        }
    };

    const renderAccountSelect = (currentValue, onChange, placeholder = "Select Target Account", filterFn = null) => (
        <select
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
        >
            <option value="">{placeholder}</option>
            {accounts.filter(acc => filterFn ? filterFn(acc) : true).map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_type})</option>
            ))}
        </select>
    );

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
                <div className="grid gap-6">
                    {/* Categories Section */}
                    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                        <div className="flex items-center gap-2 mb-6">
                            <Layers className="text-blue-400" size={24} />
                            <h2 className="text-xl font-bold text-white">Category Rules</h2>
                        </div>
                        <div className="space-y-4">
                            {categories.length === 0 && <p className="text-gray-500 italic">No categories found.</p>}
                            {categories.map(cat => {
                                const rule = rules.find(r => r.identifier === cat && r.rule_type === 'CATEGORY');
                                return (
                                    <div key={cat} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                                                {cat[0].toUpperCase()}
                                            </div>
                                            <span className="font-medium text-gray-200">{cat}</span>
                                        </div>
                                        <div className="flex items-center gap-2 w-full md:w-auto">
                                            <ArrowRight className="text-gray-600 hidden md:block" size={16} />
                                            {renderAccountSelect(
                                                rule?.target_account_id,
                                                (val) => handleSaveRule('CATEGORY', cat, val)
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Loans Section */}
                    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                        <div className="flex items-center gap-2 mb-6">
                            <AlertCircle className="text-amber-400" size={24} />
                            <h2 className="text-xl font-bold text-white">Loan Rules</h2>
                        </div>
                        <div className="space-y-4">
                            {loans.length === 0 && <p className="text-gray-500 italic">No active loans found.</p>}
                            {loans.map(loan => {
                                const rule = rules.find(r => r.identifier === loan.name && r.rule_type === 'LOAN'); // Matching by Name as per backend logic
                                return (
                                    <div key={loan.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                                                L
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-200">{loan.name}</p>
                                                <p className="text-xs text-gray-500">Principal: {loan.principal_amount}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full md:w-auto">
                                            <ArrowRight className="text-gray-600 hidden md:block" size={16} />
                                            {renderAccountSelect(
                                                rule?.target_account_id,
                                                (val) => handleSaveRule('LOAN', loan.name, val)
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB 2: DISTRIBUTOR --- */}
            {activeTab === 'distributor' && (
                <div className={previewData ? "w-full animate-fade-in" : "bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl max-w-3xl mx-auto transition-all"}>
                    {!previewData && !distributionResult && (
                        <div className="space-y-8">
                            <div className="text-center space-y-2">
                                <RefreshCw className="w-12 h-12 text-emerald-500 mx-auto animate-pulse" />
                                <h2 className="text-2xl font-bold text-white">Run Payday Routine</h2>
                                <p className="text-gray-400 max-w-md mx-auto">
                                    Select the account where your income was deposited. We will calculate transfers based on your <strong>Budgeted</strong> obligations for this month.
                                </p>
                            </div>

                            <div className="space-y-4 bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
                                <label className="block text-sm font-medium text-gray-400 mb-1">Source Account (Income)</label>
                                {renderAccountSelect(
                                    sourceAccountId,
                                    setSourceAccountId,
                                    "Select Account with Income",
                                    (acc) => acc.is_income
                                )}
                            </div>

                            <button
                                onClick={handleRunPreview}
                                disabled={distributing || !sourceAccountId}
                                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                            >
                                {distributing ? 'Analyzing...' : 'Analyze & Preview Transfers'}
                                {!distributing && <ArrowRight size={20} />}
                            </button>
                        </div>
                    )}

                    {previewData && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white">Proposed Transfers</h2>
                                <p className="text-gray-400">Total to Distribute: <span className="text-emerald-400 font-bold text-lg">{previewData.total_amount.toLocaleString()}</span></p>
                                {sourceAccountId && (
                                    <p className="text-gray-400 mt-1">
                                        Source Balance: <span className={`${(accounts.find(a => a.id === sourceAccountId)?.current_balance || 0) < previewData.total_amount ? 'text-amber-400' : 'text-emerald-400'} font-bold`}>
                                            {(accounts.find(a => a.id === sourceAccountId)?.current_balance || 0).toLocaleString()}
                                        </span>
                                    </p>
                                )}
                            </div>

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
                                            {currentAmount > willTransfer && (
                                                <div className="text-xs text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
                                                    ⚠️ Source Limited. Destination covers gap of <b>{(currentAmount - willTransfer).toLocaleString()}</b>.
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
                                                        className={`w-full bg-slate-900 text-white text-right font-mono text-lg py-3 pl-3 pr-10 rounded-xl border focus:ring-2 outline-none transition-all ${isPartial ? 'border-amber-500/50 focus:border-amber-500' : 'border-slate-600 focus:border-emerald-500'}`}
                                                    />
                                                    <span className="absolute right-4 top-4 text-gray-500 text-sm font-bold">SAR</span>
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
                                {previewData.allocations.length === 0 && (
                                    <div className="col-span-full text-center py-12 text-gray-500">
                                        <p className="text-lg font-medium">No transfers needed.</p>
                                        <p className="text-sm">All obligations are covered by existing balances or no bills found.</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setPreviewData(null)}
                                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                                >
                                    Back
                                </button>
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
                        </div>
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
            )}
        </div>
    );
};

export default Allocation;
