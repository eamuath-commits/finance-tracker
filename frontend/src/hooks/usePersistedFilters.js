import { useState, useCallback } from 'react';

/**
 * A hook that persists filter state to sessionStorage.
 * Survives page refresh and navigation, clears when tab is closed.
 * 
 * @param {string} pageKey - Unique key for the page (e.g., 'transactions', 'accounts')
 * @param {Object} defaultFilters - Default filter values, e.g. { accountFilter: '', typeFilter: '' }
 * @returns {[Object, Function, Function]} [filters, setFilter, clearFilters]
 */
export function usePersistedFilters(pageKey, defaultFilters) {
    // Initialize from sessionStorage or defaults
    const [filters, setFilters] = useState(() => {
        try {
            const stored = sessionStorage.getItem(`filters_${pageKey}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with defaults to handle new filter keys added after initial save
                return { ...defaultFilters, ...parsed };
            }
        } catch (e) {
            // Ignore parse errors
        }
        return defaultFilters;
    });

    // Update a single filter value
    const setFilter = useCallback((key, value) => {
        setFilters(prev => {
            const updated = { ...prev, [key]: value };
            try {
                sessionStorage.setItem(`filters_${pageKey}`, JSON.stringify(updated));
            } catch (e) { /* ignore storage errors */ }
            return updated;
        });
    }, [pageKey]);

    // Clear all filters back to defaults
    const clearFilters = useCallback(() => {
        try {
            sessionStorage.removeItem(`filters_${pageKey}`);
        } catch (e) { /* ignore */ }
        setFilters(defaultFilters);
    }, [pageKey, defaultFilters]);

    return [filters, setFilter, clearFilters];
}
