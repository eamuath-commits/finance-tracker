import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Layers, ArrowRight, CheckCircle, AlertCircle, Save, Trash2, RefreshCw } from 'lucide-react';
import SectionHeader from '../components/SectionHeader';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [accRes, loanRes, ruleRes, oblRes] = await Promise.all([
                axios.get(`${API_URL}/accounts/`),
                axios.get(`${API_URL}/loans/`),
                axios.get(`${API_URL}/allocation/rules`),
                axios.get(`${API_URL}/obligations/`) // To get categories
            ]);

            setAccounts(accRes.data);
            setLoans(loanRes.data);
            setRules(ruleRes.data);

            // Extract unique categories from obligations
            const uniqueCats = [...new Set(oblRes.data.map(o => o.category).filter(c => c && c !== 'Loan'))];
            setCategories(uniqueCats);
        } catch (error) {
            console.error("Error fetching data:", error);
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

    const handleExecute = async () => {
        if (!confirm("Are you sure you want to execute these transfers? This matches your Budgeted obligations.")) return;

        setDistributing(true);
        try {
            const res = await axios.post(`${API_URL}/allocation/execute`, {
                source_account_id: sourceAccountId,
                month_offset: monthOffset
            });
            setDistributionResult(res.data);
            setPreviewData(null);
            // Refresh accounts to show new balances?
            // Maybe just show success message.
        } catch (error) {
            console.error("Execution failed:", error);
            alert("Transfer execution failed.");
        } finally {
            setDistributing(false);
        }
    };

    const renderAccountSelect = (currentValue, onChange, placeholder = "Select Target Account") => (
        <select
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
        >
            <option value="">{placeholder}</option>
            {accounts.map(acc => (
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
                <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl max-w-3xl mx-auto">
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
                                {renderAccountSelect(sourceAccountId, setSourceAccountId, "Select Account with Income")}
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
                            </div>

                            <div className="space-y-3">
                                {previewData.allocations.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border-l-4 border-emerald-500">
                                        <div>
                                            <p className="text-emerald-400 font-bold text-lg">{item.amount.toLocaleString()}</p>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider">To: {item.target_account_name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-gray-300 font-medium text-sm">{item.name}</p>
                                        </div>
                                    </div>
                                ))}
                                {previewData.allocations.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        No transfers needed based on current rules and budget.
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
                                <button
                                    onClick={handleExecute}
                                    disabled={previewData.allocations.length === 0 || distributing}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    {distributing ? 'Processing...' : 'Confirm & Execute'}
                                    <CheckCircle size={18} />
                                </button>
                            </div>
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
                                    Successfully executed <strong>{distributionResult.transfers_count}</strong> transfers.
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
