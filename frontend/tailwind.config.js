/** @type {import('tailwindcss').Config} */

// Qayd "Nocturne" theme.
// The app was authored dark-only with literal Tailwind color classes
// (bg-slate-800, text-white, text-blue-400, …). Rather than rewrite 2,900
// class usages, we remap the slate / gray / blue / white scales to CSS
// variables defined per-theme in index.css. Values are stored as raw
// "R G B" channel triplets and wrapped with `rgb(var(--x) / <alpha-value>)`
// so Tailwind's opacity modifiers (bg-slate-800/50, etc.) keep working.
const ch = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
                display: ['Sora', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
            colors: {
                // Strong foreground text ("text-white") — flips to ink in light mode.
                white: ch('--c-white'),

                // Structural neutrals — surfaces, borders, secondary text.
                slate: {
                    200: ch('--c-slate-200'),
                    300: ch('--c-slate-300'),
                    400: ch('--c-slate-400'),
                    500: ch('--c-slate-500'),
                    600: ch('--c-slate-600'),
                    700: ch('--c-slate-700'),
                    800: ch('--c-slate-800'),
                    900: ch('--c-slate-900'),
                    950: ch('--c-slate-950'),
                },
                gray: {
                    200: ch('--c-gray-200'),
                    300: ch('--c-gray-300'),
                    400: ch('--c-gray-400'),
                    500: ch('--c-gray-500'),
                    600: ch('--c-gray-600'),
                    700: ch('--c-gray-700'),
                },
                // Brand accent — remapped from the old blue to Nocturne indigo.
                blue: {
                    200: ch('--c-blue-200'),
                    300: ch('--c-blue-300'),
                    400: ch('--c-blue-400'),
                    500: ch('--c-blue-500'),
                    600: ch('--c-blue-600'),
                    700: ch('--c-blue-700'),
                    800: ch('--c-blue-800'),
                    900: ch('--c-blue-900'),
                },

                // Semantic families — themed per mode so money/status colors
                // stay readable on white in light mode (see index.css tokens).
                emerald: {
                    300: ch('--c-emerald-300'),
                    400: ch('--c-emerald-400'),
                    500: ch('--c-emerald-500'),
                    600: ch('--c-emerald-600'),
                    700: ch('--c-emerald-700'),
                    800: ch('--c-emerald-800'),
                    900: ch('--c-emerald-900'),
                },
                green: {
                    300: ch('--c-green-300'),
                    400: ch('--c-green-400'),
                    500: ch('--c-green-500'),
                    600: ch('--c-green-600'),
                    900: ch('--c-green-900'),
                },
                red: {
                    200: ch('--c-red-200'),
                    300: ch('--c-red-300'),
                    400: ch('--c-red-400'),
                    500: ch('--c-red-500'),
                    600: ch('--c-red-600'),
                    700: ch('--c-red-700'),
                    800: ch('--c-red-800'),
                    900: ch('--c-red-900'),
                },
                rose: {
                    400: ch('--c-rose-400'),
                    500: ch('--c-rose-500'),
                    900: ch('--c-rose-900'),
                },
                amber: {
                    300: ch('--c-amber-300'),
                    400: ch('--c-amber-400'),
                    500: ch('--c-amber-500'),
                    600: ch('--c-amber-600'),
                    900: ch('--c-amber-900'),
                },
                yellow: {
                    400: ch('--c-yellow-400'),
                    500: ch('--c-yellow-500'),
                    600: ch('--c-yellow-600'),
                    700: ch('--c-yellow-700'),
                    900: ch('--c-yellow-900'),
                },
                orange: {
                    300: ch('--c-orange-300'),
                    400: ch('--c-orange-400'),
                    500: ch('--c-orange-500'),
                    900: ch('--c-orange-900'),
                },
                purple: {
                    200: ch('--c-purple-200'),
                    300: ch('--c-purple-300'),
                    400: ch('--c-purple-400'),
                    500: ch('--c-purple-500'),
                    600: ch('--c-purple-600'),
                    700: ch('--c-purple-700'),
                    800: ch('--c-purple-800'),
                    900: ch('--c-purple-900'),
                },
                indigo: {
                    300: ch('--c-indigo-300'),
                    400: ch('--c-indigo-400'),
                    500: ch('--c-indigo-500'),
                    600: ch('--c-indigo-600'),
                    900: ch('--c-indigo-900'),
                },
                cyan: {
                    300: ch('--c-cyan-300'),
                    400: ch('--c-cyan-400'),
                    500: ch('--c-cyan-500'),
                    600: ch('--c-cyan-600'),
                },
                pink: {
                    400: ch('--c-pink-400'),
                    500: ch('--c-pink-500'),
                    900: ch('--c-pink-900'),
                },
            },
        },
    },
    plugins: [],
}
