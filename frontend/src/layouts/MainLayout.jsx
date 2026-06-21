import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { Menu } from 'lucide-react';

const MainLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-gray-100 flex">
            {/* Sidebar */}
            <Sidebar isOpen={sidebarOpen} onToggle={setSidebarOpen} />

            {/* Main Content Area */}
            <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
                {/* Mobile Top Bar */}
                <header className="md:hidden sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex items-center gap-3 safe-area-top"
                    style={{ WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}
                >
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu size={22} />
                    </button>
                    <h1 className="text-lg font-bold text-white flex items-center gap-1.5">
                        <span className="text-blue-500">Finance</span>Tracker
                    </h1>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
