import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';

import Obligations from './pages/Obligations';

// Placeholder pages for now (to be extracted later)
const Transactions = () => <div className="text-white p-8">Transaction Management Page (Coming Soon)</div>;
const Loans = () => <div className="text-white p-8">Loan Management Page (Coming Soon)</div>;
const Reports = () => <div className="text-white p-8">Reports Page (Coming Soon)</div>;

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<MainLayout />}>
                    <Route index element={<Dashboard />} />
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
