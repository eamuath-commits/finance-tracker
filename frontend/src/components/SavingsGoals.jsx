import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatCurrency, Card } from '../components/UI';
import { Target, Plus, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SavingsGoals = () => {
    const [goals, setGoals] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newGoal, setNewGoal] = useState({
        name: '',
        target_amount: '',
        current_amount: '',
        target_date: ''
    });

    useEffect(() => {
        fetchGoals();
    }, []);

    const fetchGoals = async () => {
        try {
            const res = await axios.get(`${API_URL}/goals/`);
            setGoals(res.data);
        } catch (error) {
            console.error("Error fetching goals", error);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/goals/`, {
                name: newGoal.name,
                target_amount: parseFloat(newGoal.target_amount),
                current_amount: parseFloat(newGoal.current_amount || 0),
                target_date: newGoal.target_date || null
            });
            setIsAdding(false);
            setNewGoal({ name: '', target_amount: '', current_amount: '', target_date: '' });
            fetchGoals();
        } catch (error) {
            console.error("Error creating goal", error);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Delete this goal?")) return;
        try {
            await axios.delete(`${API_URL}/goals/${id}`);
            fetchGoals();
        } catch (error) {
            console.error("Error deleting goal", error);
        }
    };

    const calculateMonthly = (goal) => {
        if (!goal.target_date) return null;
        const target = new Date(goal.target_date);
        const now = new Date();
        const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());

        if (months <= 0) return 0;
        const remaining = goal.target_amount - goal.current_amount;
        if (remaining <= 0) return 0;

        return remaining / months;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Your Saving Goals</h3>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-bold"
                >
                    <Plus size={16} /> Add Goal
                </button>
            </div>

            {isAdding && (
                <Card className="mb-6 border border-blue-500">
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-gray-400 text-xs uppercase font-bold">Goal Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700 focus:border-blue-500 outline-none"
                                    value={newGoal.name || ''}
                                    onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
                                    placeholder="e.g. Vacation"
                                />
                            </div>
                            <div>
                                <label className="text-gray-400 text-xs uppercase font-bold">Target Amount</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700 focus:border-blue-500 outline-none"
                                    value={newGoal.target_amount || ''}
                                    onChange={e => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                                    placeholder="20000"
                                />
                            </div>
                            <div>
                                <label className="text-gray-400 text-xs uppercase font-bold">Currently Saved</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700 focus:border-blue-500 outline-none"
                                    value={newGoal.current_amount || ''}
                                    onChange={e => setNewGoal({ ...newGoal, current_amount: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-gray-400 text-xs uppercase font-bold">Target Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700 focus:border-blue-500 outline-none"
                                    value={newGoal.target_date || ''}
                                    onChange={e => setNewGoal({ ...newGoal, target_date: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="text-gray-400 hover:text-white px-4 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold"
                            >
                                Save Goal
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {goals.map(goal => {
                    const progress = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                    const monthlyNeeded = calculateMonthly(goal);

                    return (
                        <div key={goal.id} className="bg-slate-800 rounded-lg p-5 border border-slate-700 relative group">
                            <button
                                onClick={() => handleDelete(goal.id)}
                                className="absolute top-3 right-3 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                            >
                                <Trash2 size={16} />
                            </button>

                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-600/20 p-2 rounded-full text-blue-400">
                                        <Target size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-lg">{goal.name}</h4>
                                        {goal.target_date && (
                                            <p className="text-xs text-gray-500">Target: {goal.target_date}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-2 flex justify-between text-sm">
                                <span className="text-gray-400">Saved: <span className="text-white">{formatCurrency(goal.current_amount)}</span></span>
                                <span className="text-gray-400">Goal: <span className="text-white">{formatCurrency(goal.target_amount)}</span></span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-700 rounded-full h-2.5 mb-4">
                                <div
                                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>

                            {monthlyNeeded !== null && monthlyNeeded > 0 && (
                                <div className="bg-slate-700/50 p-2 rounded text-center text-xs text-blue-300">
                                    Save <b>{formatCurrency(monthlyNeeded)}/mo</b> to hit your goal!
                                </div>
                            )}
                            {progress >= 100 && (
                                <div className="bg-green-600/20 p-2 rounded text-center text-xs text-green-400 font-bold">
                                    Goal Reached! 🎉
                                </div>
                            )}
                        </div>
                    );
                })}

                {goals.length === 0 && !isAdding && (
                    <div className="col-span-full text-center py-12 text-gray-500 border border-dashed border-slate-700 rounded-lg">
                        <p>No savings goals yet. Add one to start tracking!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SavingsGoals;
