import React, { useState, useEffect } from 'react';
import { CheckCircle, History, Pencil, Trash2, Banknote, Home, Zap, Utensils, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Box, GripVertical, Download, Link } from 'lucide-react';
import { formatCurrency, EditIcon } from '../components/UI';
import axios from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { exportToCSV } from '../utils/csvExport';

const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

const ObligationCard = ({ obl, getMonthStatus, monthOffset, openHistory, openObligationModal, openPaymentModal, handleQuickPay, handleDeleteHistory, CATEGORY_ICONS, dragHandleProps, match, onLinkPayment }) => {
    const prevMonth = getMonthStatus(obl, monthOffset - 1);
    const currMonth = getMonthStatus(obl, monthOffset);

    // Initial value for input: Prioritize Prev Month Amount -> Obligation Default -> Empty
    // Initial value for input: Prioritize Current Month (if saved/pending) -> Prev Month -> Empty
    const initialAmount = currMonth.amount !== null ? currMonth.amount : (prevMonth.amount !== null ? prevMonth.amount : "");
    const [payAmount, setPayAmount] = React.useState(initialAmount);
    const [isEditing, setIsEditing] = React.useState(false);

    // Update local state if the underlying data changes significantly (e.g. month navigation)
    React.useEffect(() => {
        const newVal = currMonth.amount !== null ? currMonth.amount : (prevMonth.amount !== null ? prevMonth.amount : "");
        setPayAmount(newVal);
    }, [currMonth.amount, prevMonth.amount, monthOffset]);

    const handlePay = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Smart Default Logic:
        // 1. If user typed nothing (NaN) -> Use PREVIOUS month's amount (if available)
        // 2. If user typed 0 -> Respect it (allow explicit 0).
        let val = parseFloat(payAmount);
        if (isNaN(val)) {
            if (prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
            // Removed obl.amount fallback
        }

        openPaymentModal(obl, currMonth.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            console.log("👉 Enter Key Pressed!", { payAmount });
            e.preventDefault();
            e.stopPropagation();

            let val = parseFloat(payAmount);
            if (isNaN(val)) {
                if (prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
                openObligationModal,
                    openPaymentModal,
                    handleQuickPay,
                    openHistory,
                    handleDeleteHistory,
                    monthOffset = 0,
                    onReorder
            }) => {

    const CATEGORY_ICONS = {
        "Salary": <Banknote size={20} className="text-emerald-400" />,
        "House": <Home size={20} className="text-blue-400" />,
        "Utilities": <Zap size={20} className="text-yellow-400" />,
        "Auto Loan": <Car size={20} className="text-red-400" />,
        "Food & Groceries": <Utensils size={20} className="text-orange-400" />,
        "Transport": <Car size={20} className="text-red-400" />,
        "Insurance": <Shield size={20} className="text-purple-400" />,
        "Subscription": <Smartphone size={20} className="text-cyan-400" />,
        "Tech & Subscriptions": <Smartphone size={20} className="text-cyan-400" />,
        "Loan": <Landmark size={20} className="text-rose-400" />,
        "Credit Card": <CreditCard size={20} className="text-pink-400" />,
        "Pay Later": <Clock size={20} className="text-amber-400" />,
        "Other": <Box size={20} className="text-gray-400" />
    };

    const grouped = obligations.reduce((acc, obl) => {
        const cat = obl.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(obl);
        return acc;
    }, {});

    const handleExportSnapshot = () => {
        const snapshotData = obligations.map(obl => {
            const status = getMonthStatus(obl, monthOffset); // Get status for CURRENT VIEWED MONTH
            const prevStatus = getMonthStatus(obl, monthOffset - 1); // Get status for PREVIOUS MONTH for dynamic budget

            // Dynamic Budget Logic:
            // 1. If we have a stored "BUDGET" record for this month, use that value.
            // 2. Else, fallback to Previous Month's Actual Payment (Smart Default).
            let budgetAmount = 0;
            if (status.status === 'BUDGET' && status.amount) {
                budgetAmount = status.amount;
            } else if (prevStatus.amount && prevStatus.amount > 0) {
                budgetAmount = prevStatus.amount;
            }

            let statusLabel = "Unpaid";
            if (status.isPaid) statusLabel = "Paid";
            else if (status.status === 'BUDGET') statusLabel = "Budget";

            return {
                "Obligation": obl.name,
                "Category": obl.category,
                "Target Month": status.billingDateStr,
                "Due Day": obl.due_day,
                "Budget Amount": budgetAmount,
                "Paid Amount": status.isPaid ? (status.amount || 0) : 0,
                "Status": statusLabel,
                "Payment ID": status.paymentId || ""
            };
        });

        const date = new Date();
        date.setMonth(date.getMonth() + monthOffset);
        const monthStr = date.toISOString().slice(0, 7); // YYYY-MM
        exportToCSV(snapshotData, `obligations_snapshot_${monthStr}.csv`);
    };

    const getCategoryStats = (items) => {
        let prevPaid = 0;
        let currentBudget = 0;
        let currentPaid = 0;

        items.forEach(obl => {
            const prev = getMonthStatus(obl, monthOffset - 1);
            const curr = getMonthStatus(obl, monthOffset);

            if (prev.amount) {
                prevPaid += prev.amount;
            }

            // Budget Calculation:
            // 1. If Current Month has a set Budget (Status=BUDGET), use that.
            // 2. Fallback to Previous Month's Payment.
            if (curr.status === 'BUDGET' && curr.amount) {
                currentBudget += curr.amount;
            } else if (prev.amount) {
                currentBudget += prev.amount;
            }

            if (curr.isPaid && curr.amount) currentPaid += curr.amount;
        });

        return { prevPaid, currentBudget, currentPaid };
    };

    // Calculate Global Stats
    const globalStats = obligations.reduce((acc, obl) => {
        const prev = getMonthStatus(obl, monthOffset - 1);
        const curr = getMonthStatus(obl, monthOffset);

        let budget = 0;
        // Priority: Current Month defined budget > Previous Month actuals
        if (curr.status === 'BUDGET' && curr.amount) {
            budget = curr.amount;
        } else if (prev.amount) {
            budget = prev.amount;
        }

        let paid = 0;
        if (curr.isPaid && curr.amount) paid = curr.amount;

        acc.budget += budget;
        acc.paid += paid;
        return acc;
    }, { budget: 0, paid: 0 });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Find which category group these items belong to
        const activeObl = obligations.find(o => o.id === active.id);
        const overObl = obligations.find(o => o.id === over.id);

        if (!activeObl || !overObl) return;
        if (activeObl.category !== overObl.category) return; // Prevent cross-category drag

        // 1. Get all items in this category
        const categoryName = activeObl.category || "Other";
        const categoryItems = grouped[categoryName];
        // Note: categoryItems is derived from sorted state, so it reflects current order.

        // 2. Calculate new order for THIS category
        const oldIndex = categoryItems.findIndex(i => i.id === active.id);
        const newIndex = categoryItems.findIndex(i => i.id === over.id);
        const newCategoryOrder = arrayMove(categoryItems, oldIndex, newIndex);

        // 3. Reconstruct the GLOBAL list
        // We modify 'grouped' copy, then flatten it.
        // We must preserve the order of other categories.
        // The display order of categories themselves is determined by Object.entries(grouped) loop below.
        // But grouped is derived.
        // We need a stable list.

        // Simpler approach:
        // We know 'obligations' is the global list. 
        // We can just construct a new global list where we replace the items of THIS category with 'newCategoryOrder',
        // and keep others as is.
        // But since 'obligations' might be interleaved if sort is weird,
        // it's safest to rely on the current visual grouping logic to determine "Global Order".
        // i.e. The intended Global Order IS the Flattened Grouped List.

        const newGrouped = { ...grouped, [categoryName]: newCategoryOrder };

        // Flatten, preserving key order of original 'grouped'
        // (Note: Object.keys order is generally insertion order for strings, which matches render order)
        const flattened = [];
        Object.keys(grouped).forEach(cat => {
            if (cat === categoryName) {
                flattened.push(...newCategoryOrder);
            } else {
                flattened.push(...grouped[cat]);
            }
        });

        if (onReorder) onReorder(flattened);
    };

    return (
        <div className="animate-fade-in-up">
            {/* Global Summary Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-900/40 p-2 rounded-full text-blue-400">
                        <Landmark size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white">Monthly Overview</h2>
                            <button
                                onClick={handleExportSnapshot}
                                className="text-slate-400 hover:text-white transition p-1 bg-slate-800 rounded hover:bg-slate-700"
                                title="Export Snapshot to CSV"
                            >
                                <Download size={14} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400">{obligations.length} Active Obligations</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-8 text-sm">
                    <div className="flex flex-col items-end">
                        <span className="text-blue-400 uppercase font-bold text-[10px] tracking-wider">Total Budget</span>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-mono text-blue-200 font-bold">{formatCurrency(globalStats.budget)}</span>
                        </div>
                    </div>

                    <div className="w-px bg-slate-700 h-10 hidden md:block"></div>

                    <div className="flex flex-col items-end">
                        <span className="text-green-400 uppercase font-bold text-[10px] tracking-wider">Total Paid</span>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-mono text-green-400 font-bold">{formatCurrency(globalStats.paid)}</span>
                        </div>
                    </div>

                    <div className="w-px bg-slate-700 h-10 hidden md:block"></div>

                    <div className="flex flex-col items-end">
                        <span className={`uppercase font-bold text-[10px] tracking-wider ${globalStats.paid > globalStats.budget ? 'text-red-400' : 'text-slate-400'}`}>
                            {globalStats.paid > globalStats.budget ? 'Over Budget' : 'Remaining'}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className={`text-2xl font-mono font-bold ${globalStats.paid > globalStats.budget ? 'text-red-400' : 'text-slate-500'}`}>
                                {globalStats.paid > globalStats.budget ? (
                                    <>+{formatCurrency(globalStats.paid - globalStats.budget)}</>
                                ) : (
                                    formatCurrency(globalStats.budget - globalStats.paid)
                                )}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                {Object.entries(grouped).map(([category, items]) => {
                    const stats = getCategoryStats(items);

                    return (
                        <div key={category} className="mb-8">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
                                <div className="flex items-center gap-2">
                                    {CATEGORY_ICONS[category] || <Box size={20} className="text-gray-400" />}
                                    <h2 className="text-xl font-bold text-slate-200">{category}</h2>
                                    <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-700">{items.length}</span>
                                </div>

                                <div className="flex gap-4 text-xs">
                                    <div className="flex flex-col items-end">
                                        <span className={`uppercase font-semibold ${stats.currentPaid > stats.currentBudget ? 'text-red-400' : 'text-blue-400'}`}>Budget</span>
                                        <div className="flex items-center gap-1">
                                            <span className={`font-mono ${stats.currentPaid > stats.currentBudget ? 'text-red-300' : 'text-blue-200'}`}>
                                                {formatCurrency(stats.currentBudget)}
                                            </span>
                                            {stats.currentPaid > stats.currentBudget && (
                                                <span className="text-[10px] text-red-400 font-bold bg-red-900/30 px-1 rounded">
                                                    +{formatCurrency(stats.currentPaid - stats.currentBudget)}
                                                </span>
                                            )}
                                            {stats.currentPaid <= stats.currentBudget && (
                                                <span className="text-[10px] text-emerald-500/50 font-mono">
                                                    ({formatCurrency(stats.currentBudget - stats.currentPaid)} left)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-green-400 uppercase font-semibold">Paid</span>
                                        <span className="text-green-200 font-mono">{formatCurrency(stats.currentPaid)}</span>
                                    </div>
                                </div>
                            </div>

                            <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-4">
                                    {items.map(obl => (
                                        <SortableObligationItem
                                            key={obl.id}
                                            obl={obl}
                                            getMonthStatus={getMonthStatus}
                                            monthOffset={monthOffset}
                                            openHistory={openHistory}
                                            openObligationModal={openObligationModal}
                                            openPaymentModal={openPaymentModal}
                                            handleQuickPay={handleQuickPay}
                                            handleDeleteHistory={handleDeleteHistory}
                                            CATEGORY_ICONS={CATEGORY_ICONS}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    );
                })}
            </DndContext>
        </div>
    );
};

export default ObligationsList;
