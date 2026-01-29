import React from 'react';

export const formatCurrency = (value) => {
    return (
        <span className="flex items-center gap-1 inline-flex">
            <span
                className="h-3 w-3 inline-block"
                style={{
                    backgroundColor: 'currentColor',
                    maskImage: 'url(/riyal-symbol.png)',
                    WebkitMaskImage: 'url(/riyal-symbol.png)',
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center'
                }}
            />
            <span>{Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
    );
};

// Plain text version for use in <option> elements and other non-JSX contexts
export const formatCurrencyText = (value) => {
    return `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
};

export const Card = ({ title, value, subtext, color = "blue", children, className = "" }) => {
    // If children are provided, it's a layout card
    if (children) {
        return (
            <div className={`bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 ${className}`}>
                {title && <h3 className="text-gray-400 text-sm font-medium uppercase mb-4">{title}</h3>}
                {children}
            </div>
        );
    }

    // Otherwise, it's a Stat Card
    return (
        <div className={`bg-slate-800 p-6 rounded-xl shadow-lg border-l-4 border-${color}-500 ${className}`}>
            <h3 className="text-gray-400 text-sm font-medium uppercase">{title}</h3>
            <p className="text-2xl font-bold mt-2 text-white">{value}</p>
            {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
    );
};

export const SectionHeader = ({ title, onAdd }) => (
    <div className="flex justify-between items-center mt-8 mb-4">
        <h2 className="text-xl font-semibold text-gray-100">{title}</h2>
        {onAdd && (
            <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition shadow-md">
                + Add New
            </button>
        )}
    </div>
);

export const Modal = ({ isOpen, title, children, onClose, size = "md" }) => {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-2xl",
        "2xl": "max-w-4xl"
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className={`bg-slate-800 rounded-lg p-6 w-full ${sizeClasses[size] || sizeClasses.md} border border-slate-700 shadow-2xl max-h-[90vh] overflow-auto`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

export const EditIcon = ({ onClick }) => (
    <button onClick={onClick} className="text-gray-500 hover:text-blue-400 ml-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    </button>
);

// Input styling helper
export const inputClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500";
export const selectClass = "w-full p-2 border border-slate-600 rounded bg-slate-700 text-white focus:outline-none focus:border-blue-500";

export const BrandLogo = ({ name, size = "w-8 h-8", className = "", category }) => {
    const [imgSrc, setImgSrc] = React.useState(null);
    const [hasError, setHasError] = React.useState(false);

    // Heuristic: Get Domain
    const getDomain = (merchantName) => {
        if (!merchantName) return null;
        let cleanName = merchantName.toLowerCase().trim();
        const noSpaces = cleanName.replace(/[^a-z0-9]/g, '');

        // 1. Manual Overrides (Common Saudi/Regional Brands)
        const manualMap = {
            'stc': 'stc.com.sa',
            'stc pay': 'stcpay.com.sa',
            'stcpay': 'stcpay.com.sa',
            'mobily': 'mobily.com.sa',
            'mobile': 'mobily.com.sa',
            'zain': 'sa.zain.com',
            'jarir': 'jarir.com',
            'jarir bookstore': 'jarir.com',
            'alkahraba': 'se.com.sa',
            'se': 'se.com.sa',
            'urpay': 'urpay.com.sa',
            'tamimi': 'tamimimarkets.com',
            'tamimi markets': 'tamimimarkets.com',
            'danube': 'danube.sa',
            'panda': 'panda.com.sa',
            'hyper panda': 'panda.com.sa',
            'othaim': 'othaimmarkets.com',
            'othaim markets': 'othaimmarkets.com',
            'lulu': 'luluhypermarket.com',
            'lulu hypermarket': 'luluhypermarket.com',
            'noon': 'noon.com',
            'amazon': 'amazon.sa',
            'hungerstation': 'hungerstation.com',
            'jahez': 'jahez.net',
            'uber': 'uber.com',
            'careem': 'careem.com',
            'nahdi': 'nahdi.sa',
            'al duka': 'al-dawaa.com.sa', // heuristic guess
            'aldawaa': 'al-dawaa.com.sa',
            'coop': 'coop.com',
        };

        if (manualMap[cleanName]) return manualMap[cleanName];

        // Partial match check for manually mapped keys
        for (const key of Object.keys(manualMap)) {
            if (cleanName.includes(key)) return manualMap[key];
        }

        // 2. Default Heuristic
        return `${noSpaces}.com`;
    };

    const domain = React.useMemo(() => getDomain(name), [name]);

    React.useEffect(() => {
        // Special Case for Transfers: Category match OR heuristic (if no category)
        const isTransfer = category === 'Transfer' || (!category && name && (name.toLowerCase().includes('transfer') || name.toLowerCase().includes('account')));

        if (isTransfer) {
            setHasError(true); // Force fallback immediately
            return;
        }

        if (domain) {
            // Try Google Favicon first (Most reliable)
            setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
            setHasError(false);
        }
    }, [domain, name]);

    const handleError = () => {
        // If Google failed, try DuckDuckGo
        if (imgSrc && imgSrc.includes('google')) {
            setImgSrc(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        } else {
            // If both failed, show text fallback
            setHasError(true);
        }
    };

    if (!name || hasError || !domain) {
        // Special Icon for Transfers
        const isTransfer = category === 'Transfer' || (!category && name && (name.toLowerCase().includes('transfer') || name.toLowerCase().includes('account')));

        if (isTransfer) {
            return (
                <div className={`${size} rounded-full bg-slate-700 text-blue-400 flex items-center justify-center border border-slate-600 ${className}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 10v12" />
                        <path d="M15 5.88 14 2H9l1 3.88" />
                        <path d="M11 20h10" />
                        <path d="M11 14h10" />
                        <path d="m18 11 3 3-3 3" />
                    </svg>
                </div>
            );
        }

        // Text Fallback with generated color
        const colors = ['bg-red-900', 'bg-blue-900', 'bg-green-900', 'bg-yellow-900', 'bg-purple-900', 'bg-pink-900', 'bg-indigo-900'];
        const charCode = name ? name.charCodeAt(0) : 0;
        const colorClass = colors[charCode % colors.length];

        return (
            <div className={`${size} rounded-full ${colorClass} text-white flex items-center justify-center text-xs font-bold border border-white/10 ${className}`}>
                {name ? name.charAt(0).toUpperCase() : '?'}
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            alt={name}
            className={`${size} rounded-full object-cover border border-white/10 shadow-sm bg-white ${className}`}
            onError={handleError}
        />
    );
};

// --- Missing Components Added by Agent ---

export const Badge = ({ children, variant = "neutral", className = "" }) => {
    const variants = {
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        danger: "bg-red-500/10 text-red-400 border-red-500/20",
        neutral: "bg-slate-700 text-slate-300 border-slate-600",
        primary: "bg-blue-500/10 text-blue-400 border-blue-500/20"
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${variants[variant] || variants.neutral} ${className}`}>
            {children}
        </span>
    );
};

export const Button = ({ children, variant = "primary", onClick, className = "", icon: Icon, disabled = false, ...props }) => {
    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
        secondary: "bg-slate-700 hover:bg-slate-600 text-white",
        danger: "bg-red-600 hover:bg-red-500 text-white",
        ghost: "hover:bg-white/5 text-slate-400 hover:text-white"
    };

    const disabledClasses = disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "";

    return (
        <button
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 active:scale-95 ${variants[variant] || variants.primary} ${disabledClasses} ${className}`}
            {...props}
        >
            {Icon && <Icon size={18} />}
            {children}
        </button>
    );
};

export const Input = ({ className = "", ...props }) => (
    <input
        className={`w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors placeholder-gray-500 ${className}`}
        {...props}
    />
);

export const Spinner = () => (
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
);

const UI = {
    Card,
    Badge,
    Button,
    Input,
    Spinner,
    SectionHeader,
    Modal,
    BrandLogo,
    formatCurrency,
    formatCurrencyText,
    inputClass,
    selectClass,
    EditIcon
};

export default UI;
