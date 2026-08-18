import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// Persisted light/dark switch. The stored value is read pre-paint by the
// inline script in index.html; this component keeps <html data-theme> and
// localStorage in sync while the app runs. Default is dark (the app's
// historical look).
const getStoredTheme = () => {
    try {
        return localStorage.getItem('qayd-theme') || 'dark';
    } catch (e) {
        return 'dark';
    }
};

const ThemeToggle = () => {
    const [theme, setTheme] = useState(getStoredTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('qayd-theme', theme);
        } catch (e) { /* storage unavailable — session-only */ }
    }, [theme]);

    const isDark = theme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-400 hover:bg-slate-800 hover:text-gray-200 transition-colors"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>
        </button>
    );
};

export default ThemeToggle;
