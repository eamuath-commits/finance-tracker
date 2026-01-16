import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';

import Obligations from './pages/Obligations';

import Reports from './pages/Reports';
import Transactions from './pages/Transactions';

import Accounts from './pages/Accounts';
import Loans from './pages/Loans';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<MainLayout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="accounts" element={<Accounts />} />
                    <Route path="transactions" element={<Transactions />} />
                    <Route path="loans" element={<Loans />} />
                    <Route path="obligations" element={<Obligations />} />
                    <Route path="reports" element={<Reports />} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
