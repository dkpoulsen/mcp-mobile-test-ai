import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { TestRuns } from '@/pages/TestRuns';
import { TestRunDetail } from '@/pages/TestRunDetail';
import { TestSuites } from '@/pages/TestSuites';
import { TestSuiteDetail } from '@/pages/TestSuiteDetail';
import { Schedule } from '@/pages/Schedule';
import { Settings } from '@/pages/Settings';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5000,
            retry: 1,
        },
    },
});
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsx(Routes, { children: _jsxs(Route, { path: "/", element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "test-runs", element: _jsx(TestRuns, {}) }), _jsx(Route, { path: "test-runs/:id", element: _jsx(TestRunDetail, {}) }), _jsx(Route, { path: "test-suites", element: _jsx(TestSuites, {}) }), _jsx(Route, { path: "test-suites/:id", element: _jsx(TestSuiteDetail, {}) }), _jsx(Route, { path: "schedule", element: _jsx(Schedule, {}) }), _jsx(Route, { path: "settings", element: _jsx(Settings, {}) })] }) }) }) }));
}
export default App;
