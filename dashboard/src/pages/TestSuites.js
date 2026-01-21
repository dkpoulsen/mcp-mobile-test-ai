import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { Badge } from '@/components/Badge';
import { formatDate } from '@/lib/utils';
import { Folder, ChevronRight } from 'lucide-react';
export function TestSuites() {
    const { data, isLoading } = useQuery({
        queryKey: ['suites'],
        queryFn: () => api.getTestSuites(),
    });
    const { data: runsData } = useQuery({
        queryKey: ['runs', 'all'],
        queryFn: () => api.getTestRuns({ take: 1000, skip: 0 }),
    });
    // Calculate stats per suite
    const getSuiteStats = (suiteId) => {
        const runs = runsData?.data.filter((r) => r.testSuiteId === suiteId) || [];
        const completed = runs.filter((r) => r.status === 'COMPLETED').length;
        const failed = runs.filter((r) => r.status === 'FAILED').length;
        const totalPassed = runs.reduce((sum, r) => sum + r.passedCount, 0);
        const totalFailed = runs.reduce((sum, r) => sum + r.failedCount, 0);
        const passRate = totalPassed + totalFailed > 0 ? (totalPassed / (totalPassed + totalFailed)) * 100 : 0;
        return { runs: runs.length, completed, failed, passRate };
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsx("h2", { className: "text-2xl font-bold text-gray-900", children: "Test Suites" }) }), isLoading ? (_jsx(CenteredSpinner, {})) : data && data.data.length > 0 ? (_jsx("div", { className: "grid gap-6 md:grid-cols-2 lg:grid-cols-3", children: data.data.map((suite) => {
                    const stats = getSuiteStats(suite.id);
                    return (_jsx(Link, { to: `/test-suites/${suite.id}`, children: _jsx(Card, { className: "transition-shadow hover:shadow-md", children: _jsxs(CardContent, { className: "p-6", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Folder, { className: "h-5 w-5 text-gray-400" }), _jsx("h3", { className: "text-lg font-semibold text-gray-900", children: suite.name })] }), suite.description && (_jsx("p", { className: "mt-2 text-sm text-gray-600 line-clamp-2", children: suite.description })), _jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: suite.tags.map((tag) => (_jsx(Badge, { variant: "default", children: tag }, tag))) }), _jsxs("div", { className: "mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4", children: [_jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-2xl font-bold text-gray-900", children: stats.runs }), _jsx("p", { className: "text-xs text-gray-600", children: "Runs" })] }), _jsxs("div", { className: "text-center", children: [_jsxs("p", { className: "text-2xl font-bold text-green-600", children: [stats.passRate.toFixed(0), "%"] }), _jsx("p", { className: "text-xs text-gray-600", children: "Pass Rate" })] }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-2xl font-bold text-gray-900", children: stats.completed }), _jsx("p", { className: "text-xs text-gray-600", children: "Completed" })] })] })] }), _jsx(ChevronRight, { className: "h-5 w-5 text-gray-400" })] }), _jsxs("p", { className: "mt-4 text-xs text-gray-500", children: ["Created ", formatDate(suite.createdAt)] })] }) }) }, suite.id));
                }) })) : (_jsx(Card, { children: _jsx(CardContent, { className: "p-12 text-center text-gray-500", children: "No test suites found" }) }))] }));
}
