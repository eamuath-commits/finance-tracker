import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';

import Obligations from './pages/Obligations';

import Reports from './pages/Reports';
import Planning from './pages/Planning';
import Transactions from './pages/Transactions';
import Allocation from './pages/Allocation';

import Accounts from './pages/Accounts';
import Loans from './pages/Loans';
import CreditCards from './pages/CreditCards';
import Categories from './pages/Categories';
import Merchants from './pages/Merchants';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import Settlement from './pages/Settlement';
import UserManagement from './pages/UserManagement';

import { authUtils } from './utils/api';

/**
 * PrivateRoute wrapper — redirects to /login if not authenticated.
 */
const PrivateRoute = ({ children }) => {
    return authUtils.isAuthenticated() ? children : <Navigate to="/login" replace />;
};

function App() {
    return (
        <Router>
            <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Protected routes */}
                <Route
                    path="/"
                    element={
                        <PrivateRoute>
                            <MainLayout />
                        </PrivateRoute>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="accounts" element={<Accounts />} />
                    <Route path="credit-cards" element={<CreditCards />} />
                    <Route path="allocation" element={<Allocation />} />
                    <Route path="transactions" element={<Transactions />} />
                    <Route path="merchants" element={<Merchants />} />
                    <Route path="loans" element={<Loans />} />
                    <Route path="obligations" element={<Obligations />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="planning" element={<Planning />} />
                    <Route path="categories" element={<Categories />} />
                    <Route path="audit" element={<Audit />} />
                    <Route path="settlement" element={<Settlement />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="users" element={<UserManagement />} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
