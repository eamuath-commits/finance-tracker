import React, { useState, useEffect } from "react";
import UI from "../components/UI";
import { CreditCard, Wallet, AlertCircle, TrendingUp, History, Globe } from "lucide-react";
import { format } from "date-fns";

function CreditCards() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = () => {
        setLoading(true);
        fetch("http://localhost:8000/accounts/")
            .then((res) => res.json())
            .then((data) => {
                // Filter for Credit Cards or accounts with wallets
                const cards = data.filter(acc =>
                    acc.account_type === "Credit Card" || (acc.wallets && acc.wallets.length > 0)
                );
                setAccounts(cards);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Error fetching accounts:", err);
                setLoading(false);
            });
    };

    if (loading) return <div className="text-gray-400 text-center py-12">Loading Cards...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Credit Cards</h1>
                    <p className="text-gray-400 mt-1">Manage your cards and foreign currency usage</p>
                </div>
                <UI.Button variant="primary" icon={CreditCard}>Add Card</UI.Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {accounts.map((card) => (
                    <div key={card.id} className="bg-surface rounded-2xl border border-white/10 p-6 relative overflow-hidden group hover:border-brand-primary/50 transition-all duration-300">
                        {/* Card Background Decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                        <div className="flex justify-between items-start mb-6 relative">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary/20 to-brand-accent/20 flex items-center justify-center border border-white/5">
                                    <CreditCard className="w-6 h-6 text-brand-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">{card.name}</h3>
                                    <p className="text-sm text-gray-400">{card.bank_name || "Bank Unknown"}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-gray-500 font-mono block mb-1">NO. ENDING</span>
                                <span className="text-lg font-mono text-white tracking-wider">•••• {card.last_4_digits}</span>
                            </div>
                        </div>

                        <div className="space-y-4 mb-6 relative">
                            <div>
                                <p className="text-sm text-gray-400 mb-1">Current Balance (SAR)</p>
                                <p className={`text-2xl font-bold ${card.current_balance < 0 ? 'text-green-400' : 'text-white'}`}>
                                    {card.current_balance.toFixed(2)} SAR
                                </p>
                            </div>

                            {card.credit_limit && (
                                <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                                    <div
                                        className="bg-brand-primary h-full rounded-full"
                                        style={{ width: `${Math.min(Math.abs(card.current_balance) / card.credit_limit * 100, 100)}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>

                        {/* Wallets Section */}
                        {card.wallets && card.wallets.length > 0 && (
                            <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                                <div className="flex items-center gap-2 mb-3 text-sm text-gray-400">
                                    <Globe className="w-4 h-4" />
                                    <span>Foreign Currency Wallets</span>
                                </div>
                                <div className="space-y-3">
                                    {card.wallets.map(wallet => (
                                        <div key={wallet.id} className="flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-brand-accent">{wallet.currency_code}</span>
                                            </div>
                                            <span className="text-white font-mono">{wallet.balance.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2 relative">
                            <UI.Button variant="ghost" size="sm" icon={History}>View History</UI.Button>
                            <UI.Button variant="secondary" size="sm" icon={AlertCircle}>Details</UI.Button>
                        </div>
                    </div>
                ))}

                {/* Add New Placeholder */}
                <button className="border-2 border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-brand-primary/50 hover:bg-white/5 transition-all h-full min-h-[300px]">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <CreditCard className="w-8 h-8" />
                    </div>
                    <span className="font-medium">Add New Card</span>
                </button>
            </div>
        </div>
    );
}

export default CreditCards;
