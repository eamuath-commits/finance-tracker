import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * Imperative, promise-based confirmation backed by the reliable in-app
 * ConfirmDialog (native confirm() can be blocked by Chrome, silently
 * cancelling destructive actions).
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, message, variant: 'danger' }))) return;
 *   // ...proceed with the action
 *
 * A bare string is accepted too: await confirm('Delete this?')
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [state, setState] = useState({ open: false, opts: {} });
    const resolverRef = useRef(null);

    const confirm = useCallback((opts = {}) => {
        const normalized = typeof opts === 'string' ? { message: opts } : (opts || {});
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setState({ open: true, opts: normalized });
        });
    }, []);

    const settle = useCallback((result) => {
        setState((s) => ({ ...s, open: false }));
        const resolve = resolverRef.current;
        resolverRef.current = null;
        if (resolve) resolve(result);
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog
                isOpen={state.open}
                title={state.opts.title}
                message={state.opts.message}
                confirmText={state.opts.confirmText}
                cancelText={state.opts.cancelText}
                variant={state.opts.variant}
                onConfirm={() => settle(true)}
                onCancel={() => settle(false)}
            />
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
    return ctx;
}

export default ConfirmProvider;
