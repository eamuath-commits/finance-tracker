import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- Helper: Group Transactions by Date (Last 7 Days) ---
const processTransactionData = (transactions) => {
    // 1. Create a map of last 7 days
    const days = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString();
        days[dateStr] = 0;
    }

    // 2. Sum amounts
    transactions.forEach(tx => {
        const d = new Date(tx.timestamp).toLocaleDateString();
        if (days[d] !== undefined) {
            days[d] += tx.amount;
        }
    });

    // 3. Convert to array
    return Object.keys(days).map(date => ({
        date: date.split('/')[0] + '/' + date.split('/')[1], // Short format MM/DD
        amount: days[date]
    }));
};

// --- Helper: Group Transactions by Category ---
const processTransactionCategoryData = (transactions) => {
    const categories = {};
    transactions.forEach(tx => {
        const cat = tx.category || "Uncategorized";
        categories[cat] = (categories[cat] || 0) + tx.amount;
    });

    return Object.keys(categories).map(cat => ({
        name: cat,
        value: categories[cat]
    }));
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Analytics = ({ transactions, obligations, onCategoryClick }) => {
    const barData = processTransactionData(transactions);
    const pieData = processTransactionCategoryData(transactions);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Spending Trend */}
            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
                <h3 className="text-gray-400 text-sm font-medium uppercase mb-4">7-Day Spending Trend</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                            <YAxis stroke="#9CA3AF" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                itemStyle={{ color: '#F3F4F6' }}
                                cursor={{ fill: '#374151' }}
                            />
                            <Bar dataKey="amount" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Obligation Breakdown */}
            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
                <h3 className="text-gray-400 text-sm font-medium uppercase mb-4">Spending by Category</h3>
                <div className="h-64 flex items-center justify-center">
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    onClick={(data) => onCategoryClick && onCategoryClick(data.name)}
                                    className="cursor-pointer outline-none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                            className="cursor-pointer hover:opacity-80 transition-opacity"
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                    itemStyle={{ color: '#F3F4F6' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-gray-500 italic">No obligations to display.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;
