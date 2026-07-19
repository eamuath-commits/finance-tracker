import React, { useEffect, useState, useMemo } from 'react';
import api, { API_URL, authUtils } from '../utils/api';
import { Card, SectionHeader, Modal, formatCurrency, formatCurrencyText, inputClass, selectClass } from '../components/UI';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, TrendingUp, TrendingDown, DollarSign, Receipt, Store, ArrowUpRight, ArrowDownRight, Filter, FileText, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

// Moving money between your own accounts is not spending, and a transfer charge
// is real money but not a purchase. Both were counted as expenses while the only
// axis available was the spending category — on this data that was 254 internal
// transfers inflating the totals. transaction_type carries the bank's own
// operation, so they can be excluded properly.
const NON_SPENDING_TYPES = new Set(['INTERNAL_TRANSFER', 'FEE']);
const isSpending = (tx) => tx.type === 'debit' && !NON_SPENDING_TYPES.has(tx.transaction_type);
const isIncome = (tx) => tx.type === 'credit' && !NON_SPENDING_TYPES.has(tx.transaction_type);

// --- Monthly Summary Cards ---
const MonthlySummaryCards = ({ transactions }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthTxs = transactions.filter(tx => new Date(tx.timestamp) >= monthStart);
    const income = monthTxs.filter(isIncome).reduce((s, tx) => s + tx.amount, 0);
    const expenses = monthTxs.filter(isSpending).reduce((s, tx) => s + tx.amount, 0);
    const net = income - expenses;

    const cards = [
        { label: 'Income', value: income, icon: ArrowUpRight, color: 'emerald', prefix: '+' },
        { label: 'Expenses', value: expenses, icon: ArrowDownRight, color: 'red', prefix: '-' },
        { label: 'Net', value: Math.abs(net), icon: DollarSign, color: net >= 0 ? 'emerald' : 'red', prefix: net >= 0 ? '+' : '-' },
        { label: 'Transactions', value: monthTxs.length, icon: Receipt, color: 'blue', isCount: true },
    ];

    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
        <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">{monthName}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map(c => (
                    <div key={c.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400 font-medium uppercase">{c.label}</span>
                            <c.icon size={16} className={`text-${c.color}-400`} />
                        </div>
                        <p className={`text-xl font-bold text-${c.color}-400`}>
                            {c.isCount ? c.value : <>{c.prefix} {formatCurrency(c.value)}</>}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Top Merchants Widget ---
const TopMerchantsWidget = ({ transactions }) => {
    const merchantData = useMemo(() => {
        const map = {};
        transactions.filter(isSpending).forEach(tx => {
            const info = tx.merchant_info;
            const key = info ? info.name : (tx.merchant || 'Unknown');
            if (!map[key]) {
                map[key] = { name: key, total: 0, count: 0, logo: info?.logo_url || null };
            }
            map[key].total += tx.amount;
            map[key].count++;
        });
        return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
    }, [transactions]);

    const maxAmount = merchantData[0]?.total || 1;

    return (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm h-full">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Top Merchants</h3>
            {merchantData.length > 0 ? (
                <div className="space-y-3">
                    {merchantData.map((m, i) => (
                        <div key={m.name} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-4 text-right font-mono">{i + 1}</span>
                            {m.logo ? (
                                <img src={m.logo} alt="" className="w-7 h-7 rounded" onError={e => e.target.style.display = 'none'} />
                            ) : (
                                <div className="w-7 h-7 rounded bg-slate-700 flex items-center justify-center">
                                    <Store size={14} className="text-gray-500" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-white font-medium truncate">{m.name}</span>
                                    <span className="text-sm text-red-400 font-semibold ml-2 whitespace-nowrap">{formatCurrency(m.total)}</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-1.5">
                                    <div
                                        className="h-1.5 rounded-full transition-all"
                                        style={{ width: `${(m.total / maxAmount) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                                    />
                                </div>
                                <span className="text-xs text-gray-500 mt-0.5">{m.count} transaction{m.count > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 italic text-sm">No transactions yet</p>
            )}
        </div>
    );
};

// --- Spending by Category (Pie Chart) ---
const CategoryPieChart = ({ transactions, onCategoryClick }) => {
    const pieData = useMemo(() => {
        const cats = {};
        transactions.filter(isSpending).forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            cats[cat] = (cats[cat] || 0) + tx.amount;
        });
        return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [transactions]);

    const total = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
        const pct = ((value / total) * 100).toFixed(1);
        if (pct < 3) return null; // hide tiny slices
        const RADIAN = Math.PI / 180;
        const radius = outerRadius + 18;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (
            <text x={x} y={y} fill="#CBD5E1" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={600}>
                {pct}%
            </text>
        );
    };

    return (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm h-full">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Spending by Category</h3>
            <div className="h-48 md:h-64 flex items-center justify-center">
                {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                                label={renderLabel}
                                onClick={(d) => onCategoryClick?.(d.name)}
                                className="cursor-pointer outline-none"
                            >
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} className="cursor-pointer hover:opacity-80 transition-opacity" />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: 8, color: '#F1F5F9' }}
                                formatter={(value) => {
                                    const pct = ((value / total) * 100).toFixed(1);
                                    return `${formatCurrencyText(value)} (${pct}%)`;
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-gray-500 italic text-sm">No spending data</p>
                )}
            </div>
        </div>
    );
};

// --- 30-Day Spending Trend ---
const SpendingTrendChart = ({ transactions }) => {
    const chartData = useMemo(() => {
        const days = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days[key] = 0;
        }
        transactions.filter(isSpending).forEach(tx => {
            const key = new Date(tx.timestamp).toISOString().slice(0, 10);
            if (days[key] !== undefined) days[key] += tx.amount;
        });
        return Object.entries(days).map(([date, amount]) => ({
            date: new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
            amount: Math.round(amount * 100) / 100,
        }));
    }, [transactions]);

    return (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">30-Day Spending Trend</h3>
            <div className="h-48 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#64748B" fontSize={11} interval={4} angle={-30} textAnchor="end" height={50} />
                        <YAxis stroke="#64748B" fontSize={11} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: 8, color: '#F1F5F9' }}
                            formatter={(value) => [formatCurrencyText(value), 'Spent']}
                        />
                        <Line type="monotone" dataKey="amount" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3B82F6' }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// --- Income vs Expenses (6 Months) ---
const IncomeVsExpensesChart = ({ transactions }) => {
    const chartData = useMemo(() => {
        const months = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = { income: 0, expenses: 0 };
        }
        transactions.forEach(tx => {
            const key = new Date(tx.timestamp).toISOString().slice(0, 7);
            if (months[key]) {
                if (isIncome(tx)) months[key].income += tx.amount;
                else if (isSpending(tx)) months[key].expenses += tx.amount;
            }
        });
        return Object.entries(months).map(([month, data]) => ({
            month: new Date(month + '-01').toLocaleDateString('en', { month: 'short' }),
            Income: Math.round(data.income),
            Expenses: Math.round(data.expenses),
        }));
    }, [transactions]);

    return (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Income vs Expenses (6 Months)</h3>
            <div className="h-48 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                        <YAxis stroke="#64748B" fontSize={11} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: 8, color: '#F1F5F9' }}
                            formatter={(value) => formatCurrencyText(value)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// --- Allocation Card (Smart Analysis) ---
const AllocationCard = ({ analysis }) => {
    if (!analysis) return null;
    const isDanger = analysis.freedom_cash < 0;

    return (
        <div className={`p-6 rounded-xl border backdrop-blur-sm ${isDanger ? 'bg-red-900/10 border-red-800/50' : 'bg-emerald-900/10 border-emerald-800/50'}`}>
            <h2 className={`text-lg font-bold mb-2 ${isDanger ? 'text-red-400' : 'text-emerald-400'}`}>Smart Analysis</h2>
            <p className="text-gray-300 font-medium">{analysis.message}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-4">
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50">
                    <p className="text-xs text-gray-400 uppercase">Liquid Cash</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(analysis.liquid_cash)}</p>
                </div>
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50">
                    <p className="text-xs text-gray-400 uppercase">Upcoming Bills</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(analysis.unpaid_obligations_this_month)}</p>
                    {analysis.bills_total > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                            {analysis.bills_remaining} of {analysis.bills_total} still due
                        </p>
                    )}
                </div>
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50">
                    <p className="text-xs text-gray-400 uppercase">Safe to Spend</p>
                    <p className={`text-lg font-bold ${isDanger ? 'text-red-400' : 'text-emerald-400'}`}>{formatCurrency(analysis.freedom_cash)}</p>
                </div>
            </div>
            {analysis.recommendations?.length > 0 && (
                <div className="mt-4 space-y-1.5">
                    {analysis.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <span className="text-sm">{rec.type === 'bill' ? '🧾' : rec.type === 'save' ? '💰' : '⚠️'}</span>
                            <p className="text-sm text-gray-300">{rec.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Recent Transactions Widget ---
const RecentTransactionsWidget = ({ transactions, openTransactionModal }) => (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm h-full">
        <div className="p-4 border-b border-slate-700/50 flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Recent Transactions</h3>
            {transactions.length > 5 && (
                <button onClick={() => window.location.href = '/transactions'} className="text-xs text-blue-400 hover:text-blue-300">View All</button>
            )}
        </div>
        <table className="min-w-full divide-y divide-slate-700/50">
            <tbody className="divide-y divide-slate-700/30">
                {transactions.slice(0, 7).map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-3 md:px-4 py-2.5 whitespace-nowrap text-sm text-white">
                            <div className="flex items-center gap-2">
                                {tx.merchant_info?.logo_url && (
                                    <img src={tx.merchant_info.logo_url} alt="" className="w-5 h-5 rounded hidden sm:block" onError={e => e.target.style.display = 'none'} />
                                )}
                                <div className="flex flex-col min-w-0">
                                    <span className="font-medium truncate max-w-[120px] sm:max-w-none">{tx.merchant_info?.name || tx.merchant || 'Unknown'}</span>
                                    {tx.category && <span className="text-xs text-gray-500 hidden sm:inline">{tx.category}</span>}
                                </div>
                            </div>
                        </td>
                        <td className="px-2 md:px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 hidden sm:table-cell">
                            {new Date(tx.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className={`px-3 md:px-4 py-2.5 whitespace-nowrap text-right text-sm font-medium ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-right">
                            <button onClick={() => openTransactionModal(tx)} className="text-gray-500 hover:text-white text-xs">✏️</button>
                        </td>
                    </tr>
                ))}
                {transactions.length === 0 && (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500 italic">No transactions yet.</td></tr>
                )}
            </tbody>
        </table>
    </div>
);

// --- Sortable Widget Wrapper ---
const SortableWidget = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="relative group">
            <div {...attributes} {...listeners} className="absolute top-2 right-2 z-20 p-1.5 cursor-grab bg-slate-900/80 rounded-md text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white touch-none">
                <GripVertical size={16} />
            </div>
            {children}
        </div>
    );
};

// ========== MAIN DASHBOARD ==========
const Dashboard = () => {
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [obligations, setObligations] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedAccountId, setSelectedAccountId] = useState('all');
    const [statementHealth, setStatementHealth] = useState(null);
    const displayName = authUtils.getUser()?.username || '';

    // Modal
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [transactionForm, setTransactionForm] = useState({ category: '' });

    // Widget order
    const [widgetOrder, setWidgetOrder] = useState(() => {
        const saved = localStorage.getItem('dashboard_layout_v2');
        return saved ? JSON.parse(saved) : ['summary', 'allocation', 'statement_health', 'trend', 'income_expenses', 'merchants_category', 'transactions'];
    });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setWidgetOrder((items) => {
                const newOrder = arrayMove(items, items.indexOf(active.id), items.indexOf(over.id));
                localStorage.setItem('dashboard_layout_v2', JSON.stringify(newOrder));
                return newOrder;
            });
        }
    };

    
    const fetchData = async () => {
        try {
            const [accRes, txRes, oblRes, analysisRes, healthRes] = await Promise.all([
                api.get(`${API_URL}/accounts/`),
                api.get(`${API_URL}/transactions/`),
                api.get(`${API_URL}/obligations/`),
                api.get(`${API_URL}/analysis/allocation`),
                api.get('/api/statements/health/summary').catch(() => ({ data: null })),
            ]);
            setAccounts(accRes.data);
            setTransactions(txRes.data);
            setObligations(oblRes.data);
            setAnalysis(analysisRes.data);
            if (healthRes.data) setStatementHealth(healthRes.data);
        } catch (error) {
            console.error("Error fetching data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Filter transactions by selected account
    const filteredTransactions = useMemo(() => {
        if (selectedAccountId === 'all') return transactions;
        return transactions.filter(tx => tx.account_id === selectedAccountId);
    }, [transactions, selectedAccountId]);

    const handleSaveTransaction = async (e) => {
        e.preventDefault();
        try {
            await api.put(`${API_URL}/transactions/${editingId}`, transactionForm);
            setShowTransactionModal(false);
            setEditingId(null);
            fetchData();
        } catch (err) { console.error('Error updating transaction'); }
    };

    const openTransactionModal = (tx) => {
        setEditingId(tx.id);
        setTransactionForm({ category: tx.category || '' });
        setShowTransactionModal(true);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
    );

    const widgetMap = {
        summary: (
            <SortableWidget key="summary" id="summary">
                <MonthlySummaryCards transactions={filteredTransactions} />
            </SortableWidget>
        ),
        allocation: selectedAccountId === 'all' ? (
            <SortableWidget key="allocation" id="allocation">
                <AllocationCard analysis={analysis} />
            </SortableWidget>
        ) : (
            <SortableWidget key="allocation" id="allocation">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Smart Analysis</h3>
                    <p className="text-gray-500 text-sm italic">Smart Analysis shows overall allocation across all accounts. Select "All Accounts" to view.</p>
                </div>
            </SortableWidget>
        ),
        trend: (
            <SortableWidget key="trend" id="trend">
                <SpendingTrendChart transactions={filteredTransactions} />
            </SortableWidget>
        ),
        income_expenses: (
            <SortableWidget key="income_expenses" id="income_expenses">
                <IncomeVsExpensesChart transactions={filteredTransactions} />
            </SortableWidget>
        ),
        merchants_category: (
            <SortableWidget key="merchants_category" id="merchants_category">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TopMerchantsWidget transactions={filteredTransactions} />
                    <CategoryPieChart
                        transactions={filteredTransactions}
                        onCategoryClick={(category) => {
                            window.location.href = `/obligations?category=${encodeURIComponent(category)}`;
                        }}
                    />
                </div>
            </SortableWidget>
        ),
        statement_health: statementHealth ? (
            <SortableWidget key="statement_health" id="statement_health">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Statement Health</h3>
                        <button onClick={() => window.location.href = '/statements'} className="text-xs text-blue-400 hover:text-blue-300 transition">View All →</button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                            <div className="flex items-center gap-2 mb-1">
                                <FileText size={14} className="text-blue-400" />
                                <span className="text-xs text-gray-400">Total</span>
                            </div>
                            <p className="text-xl font-bold text-white">{statementHealth.total_statements}</p>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={14} className="text-amber-400" />
                                <span className="text-xs text-gray-400">Pending</span>
                            </div>
                            <p className={`text-xl font-bold ${statementHealth.unreconciled > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                                {statementHealth.unreconciled}
                            </p>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                                <span className="text-xs text-gray-400">Posted</span>
                            </div>
                            <p className="text-xl font-bold text-emerald-400">{statementHealth.posted ?? 0}</p>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/30">
                            <div className="flex items-center gap-2 mb-1">
                                <Receipt size={14} className="text-purple-400" />
                                <span className="text-xs text-gray-400">Transactions</span>
                            </div>
                            <p className="text-xl font-bold text-purple-400">{statementHealth.total_transactions}</p>
                        </div>
                    </div>
                    {statementHealth.recent && (
                        <div className="mt-3 p-2.5 bg-slate-700/20 rounded-lg border border-slate-700/30">
                            <div className="flex items-center gap-2 text-xs">
                                <FileText size={12} className="text-gray-500" />
                                <span className="text-gray-400">Latest:</span>
                                <span className="text-white font-medium truncate">{statementHealth.recent.filename}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    statementHealth.recent.status === 'posted' ? 'bg-emerald-500/15 text-emerald-400' :
                                    statementHealth.recent.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                                    'bg-amber-500/15 text-amber-400'
                                }`}>{statementHealth.recent.status}</span>
                            </div>
                        </div>
                    )}
                    {statementHealth.covered_months > 0 && (
                        <p className="text-xs text-gray-500 mt-2">{statementHealth.covered_months} months covered · {statementHealth.accounts_with_statements} account(s)</p>
                    )}
                </div>
            </SortableWidget>
        ) : null,
        transactions: (
            <SortableWidget key="transactions" id="transactions">
                <RecentTransactionsWidget transactions={filteredTransactions} openTransactionModal={openTransactionModal} />
            </SortableWidget>
        ),
    };

    return (
        <div className="space-y-6">
            {/* Header with Account Filter */}
            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Overview</h1>
                    <p className="text-gray-400 text-sm md:text-base">
                        {displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
                    </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter size={16} className="text-gray-400" />
                    <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none w-full sm:min-w-[180px]"
                    >
                        <option value="all">All Accounts</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                                {acc.name} {acc.bank_name ? `(${acc.bank_name})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Sortable Widgets */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
                    <div className="space-y-6">
                        {widgetOrder.map(id => widgetMap[id] || null)}
                    </div>
                </SortableContext>
            </DndContext>

            {/* Edit Transaction Modal */}
            {showTransactionModal && (
                <Modal title="Edit Transaction" onClose={() => setShowTransactionModal(false)}>
                    <form onSubmit={handleSaveTransaction} className="space-y-4">
                        <p className="text-gray-400 text-sm mb-2">Assign a category to this transaction.</p>
                        <input type="text" placeholder="Category (e.g. Food, Transport)" className={inputClass} value={transactionForm.category} onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })} />
                        <div className="flex gap-2 flex-wrap">
                            {['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Credit Card Payment', 'Obligation'].map(cat => (
                                <button key={cat} type="button" onClick={() => setTransactionForm({ ...transactionForm, category: cat })} className="bg-slate-700 text-xs px-2 py-1 rounded text-gray-300 hover:bg-slate-600 border border-slate-600">
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-500 font-medium transition">Save Changes</button>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
