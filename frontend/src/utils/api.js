/**
 * Shared Axios API client with JWT authentication.
 * 
 * Usage (in any component):
 *   import api, { API_URL } from '../utils/api';
 *   const res = await api.get('/accounts/');
 * 
 * The token is automatically attached to every request.
 * On 401 errors, the user is redirected to /login.
 */
import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor — attach JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor — handle 401 Unauthorized
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Clear stale token and redirect to login
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            
            // Only redirect if not already on login/register page
            if (!window.location.pathname.startsWith('/login') && 
                !window.location.pathname.startsWith('/register')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

/**
 * Auth utility functions
 */
export const authUtils = {
    /** Store token and user data after login */
    login(token, user) {
        localStorage.setItem('auth_token', token);
        if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
        }
    },

    /** Clear stored auth data and redirect to login */
    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
    },

    /** Check if user has a stored token */
    isAuthenticated() {
        return !!localStorage.getItem('auth_token');
    },

    /** Get stored user object */
    getUser() {
        try {
            return JSON.parse(localStorage.getItem('auth_user'));
        } catch {
            return null;
        }
    },

    /** Get the raw token */
    getToken() {
        return localStorage.getItem('auth_token');
    },
};

export default api;
