import React, { useEffect, useState } from 'react';

function App() {
    const [message, setMessage] = useState('Loading...');

    useEffect(() => {
        // Simple verification that we can talk to backend
        fetch('http://localhost:8000/')
            .then(res => res.json())
            .then(data => setMessage(data.message))
            .catch(err => setMessage('Error connecting to API'));
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md">
                <h1 className="text-2xl font-bold mb-4">Finance Tracker Dashboard</h1>
                <p className="text-gray-700">Backend Status: <span className="font-mono text-blue-600">{message}</span></p>
            </div>
        </div>
    );
}

export default App;
