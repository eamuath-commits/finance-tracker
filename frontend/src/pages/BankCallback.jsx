import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

/**
 * BankCallback — Landing page after Al Rajhi OAuth redirect.
 * 
 * This page handles two scenarios:
 * 1. Success: bank_connected=true in query params → show success and redirect to Settings
 * 2. Error: bank_error in query params → show error message with retry option
 * 
 * The actual token exchange happens server-side at /api/bank/callback,
 * which then redirects here via the frontend URL.
 */
const BankCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading'); // loading, success, error
    const [message, setMessage] = useState('');
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        const connected = searchParams.get('bank_connected');
        const error = searchParams.get('bank_error');

        if (connected === 'true') {
            setStatus('success');
            setMessage('Your Al Rajhi account has been connected successfully!');
        } else if (error) {
            setStatus('error');
            setMessage(decodeURIComponent(error));
        } else {
            // If no params, redirect to settings
            navigate('/settings', { replace: true });
            return;
        }
    }, [searchParams, navigate]);

    // Auto-redirect countdown for success
    useEffect(() => {
        if (status !== 'success') return;
        if (countdown <= 0) {
            navigate('/settings', { replace: true });
            return;
        }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [status, countdown, navigate]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            padding: '1.5rem',
        }}>
            <div style={{
                maxWidth: '480px',
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: '1.5rem',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '2rem 2rem 1.5rem',
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(100, 116, 139, 0.2)',
                }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        margin: '0 auto 1rem',
                        background: 'linear-gradient(135deg, #047857, #059669)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: 'white',
                    }}>
                        🏦
                    </div>
                    <h1 style={{
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        marginBottom: '0.25rem',
                        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                    }}>
                        Bank Connection
                    </h1>
                    <p style={{
                        color: '#94a3b8',
                        fontSize: '0.875rem',
                    }}>
                        Al Rajhi Open Banking
                    </p>
                </div>

                {/* Content */}
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                    {status === 'loading' && (
                        <div>
                            <Loader2
                                size={48}
                                style={{
                                    color: '#3b82f6',
                                    animation: 'spin 1s linear infinite',
                                    margin: '0 auto 1rem',
                                }}
                            />
                            <p style={{ color: '#cbd5e1', fontSize: '1rem' }}>
                                Processing your bank connection...
                            </p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                margin: '0 auto 1.25rem',
                                background: 'rgba(16, 185, 129, 0.15)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <CheckCircle size={32} style={{ color: '#10b981' }} />
                            </div>
                            <h2 style={{
                                color: '#10b981',
                                fontSize: '1.25rem',
                                fontWeight: '600',
                                marginBottom: '0.75rem',
                            }}>
                                Connected Successfully!
                            </h2>
                            <p style={{
                                color: '#94a3b8',
                                fontSize: '0.875rem',
                                lineHeight: '1.5',
                                marginBottom: '1.5rem',
                            }}>
                                {message}
                            </p>
                            <p style={{
                                color: '#64748b',
                                fontSize: '0.75rem',
                            }}>
                                Redirecting to Settings in {countdown}s...
                            </p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                margin: '0 auto 1.25rem',
                                background: 'rgba(239, 68, 68, 0.15)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <XCircle size={32} style={{ color: '#ef4444' }} />
                            </div>
                            <h2 style={{
                                color: '#ef4444',
                                fontSize: '1.25rem',
                                fontWeight: '600',
                                marginBottom: '0.75rem',
                            }}>
                                Connection Failed
                            </h2>
                            <p style={{
                                color: '#94a3b8',
                                fontSize: '0.875rem',
                                lineHeight: '1.5',
                                marginBottom: '1.5rem',
                            }}>
                                {message}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={{
                    padding: '1rem 2rem 1.5rem',
                    borderTop: '1px solid rgba(100, 116, 139, 0.2)',
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.75rem',
                }}>
                    <button
                        onClick={() => navigate('/settings', { replace: true })}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: status === 'error' ? '#3b82f6' : 'rgba(51, 65, 85, 0.6)',
                            color: 'white',
                            border: '1px solid rgba(100, 116, 139, 0.3)',
                            borderRadius: '0.75rem',
                            padding: '0.625rem 1.25rem',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <ArrowLeft size={14} />
                        Go to Settings
                    </button>
                </div>
            </div>

            {/* Spin animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default BankCallback;
