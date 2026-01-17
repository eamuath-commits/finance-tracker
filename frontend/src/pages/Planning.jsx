import React, { useState } from 'react';
import { TrendingDown, PiggyBank } from 'lucide-react';
import DebtManager from '../components/DebtManager';
import SavingsGoals from '../components/SavingsGoals';
import { useSearchParams } from 'react-router-dom';

const Planning = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'DEBT';

    const setTab = (tab) => {
        setSearchParams({ tab });
    };

    return (
        <div className="space-y-6">
            <header className="mb-2">
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    {activeTab === 'DEBT' ? <TrendingDown className="text-red-400" size={32} /> : <PiggyBank className="text-green-400" size={32} />}
                    Financial Planning
                </h1>
                <p className="text-gray-400">Manage your debt strategy and savings goals.</p>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 mb-6">
                <button
                    onClick={() => setTab('DEBT')}
                    className={`pb-4 px-6 text-sm font-bold flex items-center gap-2 border-b-2 transition ${activeTab === 'DEBT'
                            ? 'border-blue-500 text-white'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                >
                    <TrendingDown size={18} />
                    Debt Strategy
                </button>
                <button
                    onClick={() => setTab('SAVINGS')}
                    className={`pb-4 px-6 text-sm font-bold flex items-center gap-2 border-b-2 transition ${activeTab === 'SAVINGS'
                            ? 'border-green-500 text-white'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                >
                    <PiggyBank size={18} />
                    Savings Goals
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[600px]">
                {activeTab === 'DEBT' && <DebtManager />}
                {activeTab === 'SAVINGS' && <SavingsGoals />}
            </div>
        </div>
    );
};

export default Planning;
