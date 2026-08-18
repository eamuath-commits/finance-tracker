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
            },
        },
    },
    plugins: [],
}
