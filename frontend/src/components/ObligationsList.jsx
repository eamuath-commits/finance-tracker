import React, { useState, useEffect } from 'react';
import { CheckCircle, History, Pencil, Trash2, Banknote, Home, Zap, Utensils, Car, Shield, Smartphone, Landmark, CreditCard, Clock, Box, GripVertical, Download, Link } from 'lucide-react';
import { formatCurrency, EditIcon, Modal } from '../components/UI';
import axios from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { exportToCSV } from '../utils/csvExport';


const API_URL = import.meta.env.VITE_API_URL || "http://" + window.location.hostname + ":8000";

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

const ObligationCard = ({ obl, getMonthStatus, monthOffset, openHistory, openObligationModal, openPaymentModal, handleQuickPay, handleDeleteHistory, dragHandleProps, match, onLinkPayment }) => {
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
        }

        openPaymentModal(obl, currMonth.billingDateStr, val);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();

            let val = parseFloat(payAmount);
            if (isNaN(val)) {
                if (prevMonth.amount !== null && prevMonth.amount > 0) val = prevMonth.amount;
            }

            // Pass "BUDGET" to save as budget/planned amount (not paid)
            handleQuickPay(obl.id, val, currMonth.billingDateStr, "BUDGET");
        }
    };

    // Brand Logic
    const getBrandInfo = (name) => {
        const n = name.toLowerCase();
        if (n.includes('netflix')) return { domain: 'netflix.com', color: '#E50914' };
        if (n.includes('spotify')) return { domain: 'spotify.com', color: '#1DB954' };
        if (n.includes('youtube')) return { domain: 'youtube.com', color: '#FF0000' };
        if (n.includes('osn')) return { domain: 'osn.com', color: '#2d2d2d' };
        if (n.includes('stc')) return { domain: 'stc.com.sa', color: '#4F008C' };
        if (n.includes('mobily')) return { domain: 'mobily.com.sa', color: '#0099D6' };
        if (n.includes('zain')) return { domain: 'zain.com', color: '#000000' };
        if (n.includes('amazon')) return { domain: 'amazon.sa', color: '#FF9900' };
        if (n.includes('apple')) return { domain: 'apple.com', color: '#999999' };
        if (n.includes('microsoft')) return { domain: 'microsoft.com', color: '#00A4EF' };
        if (n.includes('adobe')) return { domain: 'adobe.com', color: '#FF0000' };
        if (n.includes('chatgpt') || n.includes('openai')) return { domain: 'openai.com', color: '#10A37F' };
        return null;
    };

    // Use Provider if available for better logo matching
    const logoSource = obl.provider || obl.name;
    const brand = getBrandInfo(logoSource);

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition group relative">
            <div className="bg-slate-900/40 px-3 py-2 border-b border-slate-700 flex justify-between items-center pl-8"> {/* Added pl-8 for drag handle */}
                {/* Drag Handle */}
                <div {...dragHandleProps} className="absolute top-2 left-2 cursor-grab opacity-30 hover:opacity-100 z-10 p-1 bg-slate-900/50 rounded touch-none">
                    <GripVertical size={14} className="text-gray-400" />
                </div>

                <div className="flex items-center gap-3">
                    {/* Icon: Method 1 (Brand Logo), Method 2 (Category Icon) */}
                    <div className="flex-shrink-0">
                        {brand ? (
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64`}
                                alt={obl.name}
                                className="w-6 h-6 rounded-full object-cover border border-white/10 shadow-sm"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                            />
                        ) : null}
                        <div className={`text-slate-400 opacity-70 scale-75 ${brand ? 'hidden' : 'block'}`}>
                            {CATEGORY_ICONS[obl.category] || <Box size={24} />}
                        </div>
                    </div>

                    <div className="min-w-0">
                        {obl.provider && <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider leading-none mb-0.5">{obl.provider}</div>}
                        <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{obl.name}</h3>
                        <span className="text-[10px] text-gray-500">Day: {obl.due_day}</span>
                    </div>
                </div>
                <div className="flex gap-2 opacity-50 group-hover:opacity-100 transition">
                    <button onClick={() => openHistory(obl.id)}><History size={14} className="text-gray-400 hover:text-white" /></button>
                    <button onClick={() => openObligationModal(obl)}><Pencil size={14} className="text-gray-400 hover:text-white" /></button>
                </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-700 text-xs">
                {/* Previous Month Column */}
                <div className="p-2 flex flex-col items-center justify-center relative hover:bg-slate-700/30 transition group/cell">
                    <span className="text-[9px] uppercase font-bold text-gray-600 mb-0.5">{prevMonth.shortLabel}</span>
                    {prevMonth.isPaid ? (
                        <div className="text-center group-hover/cell:opacity-20 transition">
                            <CheckCircle size={14} className="text-green-500/50 mx-auto" />
                            <span className="font-mono text-gray-400">{formatCurrency(prevMonth.amount)}</span>
                            <span className="text-[8px] text-gray-600 block">#{prevMonth.paymentId}</span>
                        </div>
                    ) : (
                        <div className="text-center">
                            <span className="font-mono text-gray-500 block mb-1">{prevMonth.amount !== null ? formatCurrency(prevMonth.amount) : "-"}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); openPaymentModal(obl, prevMonth.billingDateStr, prevMonth.amount || null); }}
                                className="text-[9px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-800 transition"
                            >
                                Pay
                            </button>
                        </div>
                    )}
                    {prevMonth.isPaid && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/cell:opacity-100 bg-slate-800/90 transition z-10">
                            <button onClick={() => openPaymentModal(obl, prevMonth.billingDateStr, null, { id: prevMonth.paymentId, amount: prevMonth.amount, billing_month: prevMonth.billingDateStr })} className="p-1 hover:text-blue-400"><Pencil size={12} /></button>
                            <button onClick={() => handleDeleteHistory(prevMonth.paymentId)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                        </div>
                    )}
                </div>

                {/* Current Month Column */}
                <div className="p-2 flex flex-col items-center justify-center bg-slate-700/10 relative group/curr">
                    <span className="text-[9px] uppercase font-bold text-blue-400 mb-0.5">{currMonth.shortLabel}</span>
                    {currMonth.isPaid ? (
                        <div className="text-center relative">
                            <CheckCircle size={16} className="text-green-400 mx-auto mb-0.5" />
                            <span className="font-bold font-mono text-white block">{formatCurrency(currMonth.amount)}</span>
                            <span className="text-[8px] text-slate-600 block absolute bottom-[-10px] w-full text-center group-hover/curr:opacity-100 opacity-0 transition">#{currMonth.paymentId}</span>
                            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/curr:opacity-100 bg-slate-800/90 transition z-10">
                                <button onClick={() => openPaymentModal(obl, currMonth.billingDateStr, null, { id: currMonth.paymentId, amount: currMonth.amount, billing_month: currMonth.billingDateStr })} className="p-1 hover:text-blue-400"><Pencil size={12} /></button>
                                <button onClick={() => handleDeleteHistory(currMonth.paymentId)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center w-full relative">
                            {match && match.length > 0 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onLinkPayment(obl, match); }}
                                    className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded-full border border-blue-500/30 whitespace-nowrap z-20 hover:bg-blue-800 animate-pulse shadow-sm"
                                    title={`Found matching transaction: ${match[0].merchant} (${formatCurrency(match[0].amount)})`}
                                >
                                    <Link size={10} />
                                    <span>Found {formatCurrency(match[0].amount)} {match.length > 1 && `(+${match.length - 1})`}</span>
                                </button>
                            )}
                            <div className="flex items-center justify-center gap-1 mb-1 relative">
                                {isEditing ? (
                                    <input
                                        autoFocus
                                        type="number"
                                        className="bg-slate-900 border border-slate-600 rounded text-center text-white text-xs py-0.5 w-20 font-mono focus:border-blue-500 outline-none transition"
                                        placeholder={initialAmount !== "" ? Number(initialAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={handleKeyDown}
                                        onBlur={() => setIsEditing(false)}
                                    />
                                ) : (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                                        className="bg-slate-900 border border-slate-700/50 hover:border-slate-500 rounded text-center text-white text-xs py-0.5 w-20 font-mono cursor-text transition h-[26px] flex items-center justify-center"
                                    >
                                        {payAmount ? formatCurrency(payAmount) : <span className="text-slate-600 italic text-[10px]">Set amount</span>}
                                    </div>
                                )}
                                <button onClick={() => openObligationModal(obl)} className="text-gray-600 hover:text-white"><Pencil size={10} /></button>
                            </div>
                            <button
                                onClick={handlePay}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-0.5 px-2 rounded flex items-center justify-center gap-1 mt-1"
                            >
                                Pay
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SortableObligationItem = (props) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.obl.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const dragHandleProps = { ...attributes, ...listeners };

    return (
        <div ref={setNodeRef} style={style}>
            <ObligationCard {...props} dragHandleProps={dragHandleProps} match={props.match} onLinkPayment={props.onLinkPayment} />
        </div>
    );
};

const ObligationsList = ({
    obligations,
    getMonthStatus,
    openObligationModal,
    openPaymentModal,
    handleQuickPay,
    openHistory,
    handleDeleteHistory,
    monthOffset = 0,
    onReorder
}) => {
    const [matches, setMatches] = useState({});

    const [rejectedMatches, setRejectedMatches] = useState(new Set()); // Persist rejections

    // 1. Fetch matches for unpaid obligations
    useEffect(() => {
        const fetchMatches = async () => {
            const unpaid = obligations.filter(o => {
                const status = getMonthStatus(o, monthOffset);
                return !status.isPaid;
            });

            if (unpaid.length === 0) return;

            const newMatches = {};
            await Promise.all(unpaid.map(async (o) => {
                try {
                    // Only fetch if not already paid
                    const res = await axios.get(`${API_URL}/obligations/${o.id}/matches`);
                    if (res.data && res.data.length > 0) {
                        // Filter out rejected matches locally
                        const validMatches = res.data.filter(tx => !rejectedMatches.has(tx.id));
                        if (validMatches.length > 0) {
                            newMatches[o.id] = validMatches; // Store ALL valid matches
                        }
                    }
                } catch (e) { console.error("Match fetch error", e); }
            }));
            setMatches(newMatches);
        };

        // Slight delay to allow data to settle
        const timer = setTimeout(fetchMatches, 1000);
        return () => clearTimeout(timer);
    }, [obligations, monthOffset, rejectedMatches]); // Re-run if rejected list changes (to fetch next batch if needed)

    const [verifyMatch, setVerifyMatch] = useState(null); // { obl, tx, allMatches }

    const executeLinkPayment = async (obl, tx) => {
        try {
            const today = new Date();
            const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
            const billingDateStr = `${targetMonth.getFullYear()}-${(targetMonth.getMonth() + 1).toString().padStart(2, '0')}-01`;

            await axios.post(`${API_URL}/obligations/${obl.id}/pay`, {
                payment_date: tx.timestamp,
                billing_month: billingDateStr,
                amount: tx.amount,
                note: `Linked to: ${tx.merchant}`,
                status: "PAID",
                transaction_id: tx.id
            });
            // alert("Linked and Paid!"); // Removed alert for smoother flow
            window.location.reload();
        } catch (e) { alert("Linking failed"); }
    };

    const handleLinkPayment = (obl, matchArray) => {
        // matchArray is the full list of matches for this obligation
        if (!matchArray || matchArray.length === 0) return;
        setVerifyMatch({ obl, tx: matchArray[0], allMatches: matchArray });
    };

    const handleRejectMatch = () => {
        if (!verifyMatch) return;

        const rejectedTxId = verifyMatch.tx.id;
        const remainingMatches = verifyMatch.allMatches.slice(1);

        // 1. Persist Rejection (so API refetch respects it)
        setRejectedMatches(prev => {
            const newSet = new Set(prev);
            newSet.add(rejectedTxId);
            return newSet;
        });

        // 2. Update Local State Immediately (for UI responsiveness)
        setMatches(prev => {
            const updated = { ...prev };
            if (remainingMatches.length > 0) {
                updated[verifyMatch.obl.id] = remainingMatches;
            } else {
                delete updated[verifyMatch.obl.id]; // No more matches
            }
            return updated;
        });

        // 3. Cycle Modal State
        if (remainingMatches.length > 0) {
            setVerifyMatch({ ...verifyMatch, tx: remainingMatches[0], allMatches: remainingMatches });
        } else {
            setVerifyMatch(null);
        }
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

        const activeObl = obligations.find(o => o.id === active.id);
        const overObl = obligations.find(o => o.id === over.id);

        if (!activeObl || !overObl) return;
        if (activeObl.category !== overObl.category) return;

        const categoryName = activeObl.category || "Other";
        const categoryItems = grouped[categoryName];

        const oldIndex = categoryItems.findIndex(i => i.id === active.id);
        const newIndex = categoryItems.findIndex(i => i.id === over.id);
        const newCategoryOrder = arrayMove(categoryItems, oldIndex, newIndex);

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
                                            match={matches[obl.id]}
                                            status={getMonthStatus(obl, monthOffset)}
                                            getMonthStatus={getMonthStatus}
                                            monthOffset={monthOffset}
                                            openObligationModal={openObligationModal}
                                            openPaymentModal={openPaymentModal}
                                            openHistory={openHistory}
                                            handleDeleteHistory={handleDeleteHistory}
                                            handleQuickPay={handleQuickPay}
                                            onLinkPayment={handleLinkPayment}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    );
                })}
            </DndContext>

            {verifyMatch && (
                <Modal isOpen={true} title={`Verify Match (${1 + verifyMatch.allMatches.indexOf(verifyMatch.tx)}/${verifyMatch.allMatches.length})`} onClose={() => setVerifyMatch(null)}>
                    <div className="space-y-4">
                        <p className="text-gray-300 text-sm">Do you want to link this transaction to the obligation?</p>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <span className="text-xs uppercase text-slate-500 font-bold block mb-1">Obligation</span>
                                <div className="font-bold text-white text-lg">{verifyMatch.obl.name}</div>
                                {verifyMatch.obl.provider && <div className="text-sm text-blue-400">{verifyMatch.obl.provider}</div>}
                                <div className="text-xs text-slate-400 mt-1">Due Day: {verifyMatch.obl.due_day}</div>
                            </div>

                            <div className="bg-slate-900/50 p-3 rounded border border-slate-700">
                                <span className="text-xs uppercase text-slate-500 font-bold block mb-1">Transaction</span>
                                <div className="font-bold text-white text-lg">{verifyMatch.tx.merchant}</div>
                                <div className="text-sm text-green-400 font-mono">{formatCurrency(verifyMatch.tx.amount)}</div>
                                <div className="text-xs text-slate-400 mt-1">{new Date(verifyMatch.tx.timestamp).toLocaleDateString()}</div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={handleRejectMatch} className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-800/50 py-2 rounded font-medium transition">
                                Reject & Next
                            </button>
                            <button onClick={() => setVerifyMatch(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded font-medium transition">
                                Cancel
                            </button>
                            <button
                                onClick={() => executeLinkPayment(verifyMatch.obl, verifyMatch.tx)}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-medium transition shadow-lg flex items-center justify-center gap-2"
                            >
                                <Link size={16} />
                                Confirm
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

        </div >
    );
};

export default ObligationsList;
