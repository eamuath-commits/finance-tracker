import React, { useEffect, useState } from 'react';
import api, { API_URL } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, SectionHeader, formatCurrency } from '../components/UI';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const Reports = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [monthlyData, setMonthlyData] = useState([]);
    const [categoryData, setCategoryData] = useState([]);

    // Allow overriding API URL via environment variable for remote development
    
    const fetchData = async () => {
        try {
            const res = await api.get(`${API_URL}/transactions/`);
            processData(res.data);
            setTransactions(res.data);
        } catch (error) {
            console.error("Error fetching transactions", error);
        } finally {
            setLoading(false);
        }
    };

    const processData = (txs) => {
        // 1. Monthly Spending Trend
        const months = {};
        txs.forEach(tx => {
            const date = new Date(tx.timestamp);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
            if (!months[key]) months[key] = 0;
            months[key] += tx.amount;
        });

        const mData = Object.keys(months).sort().map(key => ({
            name: key,
            amount: months[key]
        }));
        setMonthlyData(mData);

        // 2. Category Breakdown (Total)
        const categories = {};
        txs.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            if (!categories[cat]) categories[cat] = 0;
            categories[cat] += tx.amount;
        });

        const cData = Object.keys(categories).map(key => ({
            name: key,
            value: categories[key]
        })).sort((a, b) => b.value - a.value); // Sort highest first

        setCategoryData(cData);
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <div className="p-10 text-center text-white">Loading Reports...</div>;

    const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    return (
        <div>
            <header className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white">Financial Reports</h1>
                <p className="text-gray-400 text-sm md:text-base">Analyze your spending patterns and trends.</p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                <Card title="Total Tracked Spending" value={formatCurrency(totalSpent)} color="blue" />
                <Card title="Average Transaction" value={formatCurrency(totalSpent / (transactions.length || 1))} color="indigo" />
                <Card title="Total Transactions" value={transactions.length} color="purple" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

                {/* Monthly Trend Chart */}
                <div className="bg-slate-800 p-4 md:p-6 rounded-xl border border-slate-700 shadow-lg">
                    <h3 className="text-lg md:text-xl font-bold text-white mb-4 md:mb-6">Monthly Spending Trend</h3>
                    <div className="h-48 md:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData}>
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Pie Chart */}
                <div className="bg-slate-800 p-4 md:p-6 rounded-xl border border-slate-700 shadow-lg">
                    <h3 className="text-lg md:text-xl font-bold text-white mb-4 md:mb-6">Spending by Category</h3>
                    <div className="h-48 md:h-64 flex justify-center items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value) => formatCurrency(value)}
                                />
                                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            <SectionHeader title="Category Breakdown Details" />
            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-x-auto mobile-scroll mb-8">
                <table className="min-w-full divide-y divide-slate-700">
                    <thead className="bg-slate-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Total Spent</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">% of Total</th>
                        </tr>
                    </thead>
                    <tbody className="bg-slate-800 divide-y divide-slate-700">
                        {categoryData.map((cat, idx) => (
                            <tr key={idx}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    {cat.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-white">{formatCurrency(cat.value)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-400">{((cat.value / totalSpent) * 100).toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Reports;
