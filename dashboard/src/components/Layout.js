import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, ListChecks, Calendar, Settings, Menu, X, } from 'lucide-react';
import { useState } from 'react';
const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/test-runs', icon: ListChecks, label: 'Test Runs' },
    { to: '/test-suites', icon: FlaskConical, label: 'Test Suites' },
    { to: '/schedule', icon: Calendar, label: 'Schedule' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];
export function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsx("aside", { className: `fixed inset-y-0 left-0 z-50 w-64 transform border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`, children: _jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex h-16 items-center justify-between border-b border-gray-200 px-6", children: [_jsx(Link, { to: "/", className: "text-xl font-bold text-gray-900", children: "MCP Test AI" }), _jsx("button", { onClick: () => setSidebarOpen(false), className: "lg:hidden", children: _jsx(X, { className: "h-6 w-6" }) })] }), _jsx("nav", { className: "flex-1 space-y-1 p-4", children: navItems.map((item) => (_jsxs(NavLink, { to: item.to, onClick: () => setSidebarOpen(false), className: ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700 hover:bg-gray-100'}`, children: [_jsx(item.icon, { className: "h-5 w-5" }), item.label] }, item.to))) }), _jsx("div", { className: "border-t border-gray-200 p-4", children: _jsx("p", { className: "text-xs text-gray-500", children: "v0.1.0" }) })] }) }), _jsxs("div", { className: "lg:pl-64", children: [_jsxs("header", { className: "sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-6", children: [_jsx("button", { onClick: () => setSidebarOpen(true), className: "lg:hidden", children: _jsx(Menu, { className: "h-6 w-6" }) }), _jsx("div", { className: "flex-1", children: _jsx("h1", { className: "text-lg font-semibold text-gray-900", children: navItems.find((item) => item.to === location.pathname)?.label || 'Dashboard' }) })] }), _jsx("main", { className: "p-6", children: _jsx(Outlet, {}) })] }), sidebarOpen && (_jsx("div", { className: "fixed inset-0 z-40 bg-black/50 lg:hidden", onClick: () => setSidebarOpen(false) }))] }));
}
