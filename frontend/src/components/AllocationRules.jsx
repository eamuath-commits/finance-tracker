import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Layers, AlertCircle, ArrowRight } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const AllocationRules = ({ accounts }) => {
    const [rules, setRules] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loans, setLoans] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [ruleRes, catsRes, loanRes, oblRes] = await Promise.all([
                axios.get(`${API_URL}/allocation/rules`),
                axios.get(`${API_URL}/categories`),
                axios.get(`${API_URL}/loans/`),
                axios.get(`${API_URL}/obligations/`)
            ]);
            setRules(ruleRes.data);
            setLoans(loanRes.data);

            // Extract unique categories from obligations + existing categories endpoint if needed
            // Merging both sources for completeness
            const uniqueCats = [...new Set([
                ...oblRes.data.map(o => o.category).filter(c => c && c !== 'Loan'),
                ...catsRes.data.map(c => c.name)
            ])];
            setCategories(uniqueCats.sort());
        } catch (error) {
            console.error("Error fetching rules data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveRule = async (type, identifier, targetAccountId) => {
        try {
            // Check if rule exists
            const existing = rules.find(r => r.identifier === identifier && r.rule_type === type);
            if (existing) {
                // Delete first (since identifier is unique per type)
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

    const renderAccountSelect = (currentValue, onChange) => (
        <select
            value={currentValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none w-full md:w-64"
        >
            <option value="">-- No Envelope --</option>
            {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_type})</option>
            ))}
        </select>
    );

    if (loading) return <div className="text-gray-400 p-8 text-center">Loading Rules...</div>;

    return (
        <div className="grid gap-6 animate-fade-in">
            {/* Categories Section */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                    <Layers className="text-blue-400" size={24} />
                    <h2 className="text-xl font-bold text-white">Category Envelopes</h2>
                </div>
                <div className="space-y-4">
                    {categories.length === 0 && <p className="text-gray-500 italic">No categories found.</p>}
                    {categories.map(cat => {
                        const rule = rules.find(r => r.identifier === cat && r.rule_type === 'CATEGORY');
                        return (
                            <div key={cat} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition">
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
                    <h2 className="text-xl font-bold text-white">Loan Envelopes</h2>
                </div>
                <div className="space-y-4">
                    {loans.length === 0 && <p className="text-gray-500 italic">No active loans found.</p>}
                    {loans.map(loan => {
                        const rule = rules.find(r => r.identifier === loan.name && r.rule_type === 'LOAN');
                        return (
                            <div key={loan.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                                        L
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-200">{loan.name}</p>
                                        <p className="text-[10px] text-gray-500">Principal: {loan.principal_amount}</p>
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
    );
};

export default AllocationRules;
