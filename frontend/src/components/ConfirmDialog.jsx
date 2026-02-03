import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * A reusable confirmation dialog component that replaces native confirm().
 * Native confirm() is unreliable in Chrome and can be blocked by user settings.
 */
const ConfirmDialog = ({
    isOpen,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger", // "danger" | "warning" | "info"
    onConfirm,
    onCancel
}) => {
    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: 'text-red-400',
            iconBg: 'bg-red-500/20',
            confirmBtn: 'bg-red-600 hover:bg-red-500',
            border: 'border-red-500/30'
        },
        warning: {
            icon: 'text-yellow-400',
            iconBg: 'bg-yellow-500/20',
            confirmBtn: 'bg-yellow-600 hover:bg-yellow-500',
            border: 'border-yellow-500/30'
        },
        info: {
            icon: 'text-blue-400',
            iconBg: 'bg-blue-500/20',
            confirmBtn: 'bg-blue-600 hover:bg-blue-500',
            border: 'border-blue-500/30'
        }
    };

    const styles = variantStyles[variant] || variantStyles.danger;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                style={{ WebkitBackdropFilter: 'blur(4px)' }}
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className={`relative bg-slate-800 rounded-xl border ${styles.border} shadow-2xl max-w-md w-full mx-4 animate-fade-in-up`}>
                <div className="p-6">
                    {/* Icon */}
                    <div className={`w-12 h-12 ${styles.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                        <AlertTriangle className={styles.icon} size={24} />
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white text-center mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-slate-400 text-center text-sm mb-6">
                        {message}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 px-4 rounded-lg font-medium transition"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={`flex-1 ${styles.confirmBtn} text-white py-2.5 px-4 rounded-lg font-medium transition`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>

    );
};

export default ConfirmDialog;
