import React, { useState, useEffect } from 'react';
import api, { API_URL } from '../utils/api';
import { formatCurrency, Card } from '../components/UI';
import { TrendingDown, Target, ArrowRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


const DebtManager = () => {
    const [debts, setDebts] = useState([]);
    const [strategy, setStrategy] = useState('AVALANCHE'); // AVALANCHE or SNOWBALL
    const [extraPayment, setExtraPayment] = useState(0);
    const [simulationResult, setSimulationResult] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDebts();
    }, []);

    useEffect(() => {
        if (debts.length > 0) {
            runSimulation();
        }
    }, [debts, strategy, extraPayment]);

    const fetchDebts = async () => {
        try {
            // Need a new endpoint or aggregate existing ones
            // For now, let's pretend we fetch standard accounts/loans and map them
            const [accountsRes, loansRes] = await Promise.all([
                api.get(`${API_URL}/accounts/`),
                api.get(`${API_URL}/loans/`)
            ]);

            const creditCards = accountsRes.data
                .filter(a => a.account_type === 'Credit Card')
                .map(cc => ({
                    id: cc.id,
                    name: cc.name,
                    balance: Math.abs(cc.current_balance), // Debts are usually negative balance in accounts? Or positive?
                    // In our system, Credit Cards usually have negative balance if owing.
                    rate: cc.interest_rate || 20.0, // Default fallback
                    min_payment: cc.minimum_payment || (Math.abs(cc.current_balance) * 0.03) // Estimate 3%
                }));

            const loans = loansRes.data.map(l => ({
                id: l.id,
                name: l.name,
                balance: l.remaining_balance,
                rate: l.interest_rate,
                min_payment: l.monthly_payment || (l.remaining_balance * 0.02) // Fallback
            }));

            // Filter out positive balance CCs (if any)
            const activeDebts = [...creditCards, ...loans].filter(d => d.balance > 0);
            setDebts(activeDebts);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching debts", error);
            setLoading(false);
        }
    };

    const runSimulation = () => {
        // We will do client-side simulation for instant feedback since we wrote the logic in Python heavily
        // match the Python logic roughly

        let activeDebts = JSON.parse(JSON.stringify(debts));

        if (strategy === 'AVALANCHE') {
            activeDebts.sort((a, b) => b.rate - a.rate);
        } else {
            activeDebts.sort((a, b) => a.balance - b.balance);
        }

        let totalInterest = 0;
        let months = 0;
        let timeline = [];
        let maxMonths = 360; // 30 years cap

        // Initial total minimum
        const initialTotalMin = activeDebts.reduce((sum, d) => sum + d.min_payment, 0);

        while (activeDebts.some(d => d.balance > 0.1) && months < maxMonths) {
            months++;
            let availableExtra = extraPayment; // Simplistic: Fixed extra amount on top of minimums

            // 1. apply interest
            activeDebts.forEach(d => {
                if (d.balance > 0) {
                    const interest = d.balance * (d.rate / 100 / 12);
                    d.balance += interest;
                    totalInterest += interest;
                }
            });

            // 2. minimums
            activeDebts.forEach(d => {
                if (d.balance > 0) {
                    const pay = Math.min(d.min_payment, d.balance);
                    d.balance -= pay;
                }
            });

            // 3. extra payment (Avalanche/Snowball target)
            for (let d of activeDebts) {
                if (d.balance > 0 && availableExtra > 0) {
                    const pay = Math.min(availableExtra, d.balance);
                    d.balance -= pay;
                    availableExtra -= pay;
                }
            }

            // Record snapshot
            const snapshot = { month: months };
            debts.forEach(orig => { // Use original order for chart consistency
                const current = activeDebts.find(d => d.name === orig.name); // simplistic match by name
                snapshot[orig.name] = current ? Math.floor(Math.max(0, current.balance)) : 0;
            });
            timeline.push(snapshot);
        }

        const payoffDate = new Date();
        payoffDate.setMonth(payoffDate.getMonth() + months);

        setSimulationResult({
            months,
            payoffDate,
            totalInterest,
            timeline
        });
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="text-blue-400 animate-pulse text-xl font-bold">Loading Debt Data...</div>
        </div>
    );

    if (debts.length === 0) return (
        <div className="text-center py-20 bg-slate-800 rounded-xl border border-dashed border-slate-700">
            <TrendingDown className="mx-auto text-slate-600 mb-4" size={48} />
            <h3 className="text-xl font-bold text-white mb-2">No Active Debts Found</h3>
            <p className="text-gray-400">Great job! You have no credit card balances or loans to track.</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Strategy Controls */}
                <Card className="md:col-span-1 space-y-6">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">Strategy</h3>
                        <div className="flex bg-slate-800 p-1 rounded-lg">
                            <button
                                onClick={() => setStrategy('AVALANCHE')}
                                className={`flex-1 py-2 rounded text-sm font-bold transition ${strategy === 'AVALANCHE' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Avalanche (Highest Rate)
                            </button>
                            <button
                                onClick={() => setStrategy('SNOWBALL')}
                                className={`flex-1 py-2 rounded text-sm font-bold transition ${strategy === 'SNOWBALL' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                Snowball (Lowest Balance)
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {strategy === 'AVALANCHE' ? 'Minimizes interest paid.' : 'Maximizes psychological wins.'}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">Monthly Extra Payment</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-green-400">+</span>
                            <input
                                type="number"
                                value={extraPayment}
                                onChange={(e) => setExtraPayment(Number(e.target.value))}
                                className="bg-slate-800 text-white text-xl font-mono p-2 rounded w-full border border-slate-700 focus:border-blue-500 outline-none"
                            />
                            <span className="text-gray-400 font-mono">SAR</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="5000" step="100"
                            value={extraPayment}
                            onChange={(e) => setExtraPayment(Number(e.target.value))}
                            className="w-full mt-4 accent-blue-500"
                        />
                    </div>
                </Card>

                {/* 2. Simulation Results */}
                <Card className="md:col-span-2 relative overflow-hidden">
                    {simulationResult && (
                        <div className="grid grid-cols-2 gap-8 h-full">
                            <div className="flex flex-col justify-center">
                                <h2 className="text-sm text-gray-400 uppercase tracking-wider font-bold mb-1">Debt Free Date</h2>
                                <div className="text-4xl font-bold text-white mb-1">
                                    {simulationResult.payoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </div>
                                <div className="text-blue-400 font-mono text-lg flex items-center gap-2">
                                    <Target size={18} />
                                    {simulationResult.months} Months away
                                </div>
                            </div>

                            <div className="flex flex-col justify-center border-l border-slate-700 pl-8">
                                <h2 className="text-sm text-gray-400 uppercase tracking-wider font-bold mb-1">Total Interest Paid</h2>
                                <div className="text-4xl font-bold text-red-400 mb-1">
                                    {formatCurrency(simulationResult.totalInterest)}
                                </div>
                                <div className="text-gray-500 text-sm">
                                    Cost of borrowing
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* 3. Timeline Chart */}
            <Card title="Payoff Timeline">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simulationResult?.timeline || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="month" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                            {debts.map((d, index) => (
                                <Line
                                    key={d.name}
                                    type="monotone"
                                    dataKey={d.name}
                                    stroke={`hsl(${index * 60 + 200}, 70%, 50%)`}
                                    strokeWidth={3}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* 4. Debt List */}
            <h3 className="text-xl font-bold text-white mt-8 mb-4">Your Debts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {debts.map(debt => (
                    <div key={debt.name} className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-white text-lg">{debt.name}</h4>
                            <div className="flex gap-4 text-sm text-gray-400 mt-1">
                                <span>APR: <span className="text-white">{debt.rate}%</span></span>
                                <span>Min Pay: <span className="text-white">{formatCurrency(debt.min_payment)}</span></span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-white">{formatCurrency(debt.balance)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DebtManager;
