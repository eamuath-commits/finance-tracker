import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';

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

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<MainLayout />}>
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
                </Route>
            </Routes>
        </Router>
    );
}

export default App;

