import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { getPlatformIcon, formatDuration, formatDate } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
export function TestRuns() {
    const [page, setPage] = useState(0);
    const pageSize = 10;
    const [statusFilter, setStatusFilter] = useState('all');
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['runs', page, statusFilter],
        queryFn: () => api.getTestRuns({
            skip: page * pageSize,
            take: pageSize,
            ...(statusFilter !== 'all' && { status: statusFilter }),
        }),
        refetchInterval: 5000,
    });
    const cancelMutation = useMutation({
        mutationFn: (id) => api.cancelTestRun(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['runs'] });
            queryClient.invalidateQueries({ queryKey: ['summary'] });
        },
    });
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsx("h2", { className: "text-2xl font-bold text-gray-900", children: "Test Runs" }), _jsx("div", { className: "flex items-center gap-4", children: _jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-600", children: ["Status:", _jsxs("select", { value: statusFilter, onChange: (e) => {
                                        setStatusFilter(e.target.value);
                                        setPage(0);
                                    }, className: "rounded-md border border-gray-300 px-3 py-1.5 text-sm", children: [_jsx("option", { value: "all", children: "All" }), _jsx("option", { value: "PENDING", children: "Pending" }), _jsx("option", { value: "RUNNING", children: "Running" }), _jsx("option", { value: "COMPLETED", children: "Completed" }), _jsx("option", { value: "FAILED", children: "Failed" }), _jsx("option", { value: "CANCELLED", children: "Cancelled" })] })] }) })] }), _jsx(Card, { children: _jsx(CardContent, { className: "p-0", children: isLoading ? (_jsx("div", { className: "flex min-h-[400px] items-center justify-center", children: _jsx(CenteredSpinner, {}) })) : data && data.data.length > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { className: "border-b border-gray-200 bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600", children: "Test Suite" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600", children: "Device" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600", children: "Status" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600", children: "Results" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600", children: "Duration" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600", children: "Started" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: data.data.map((run) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsxs("td", { className: "whitespace-nowrap px-6 py-4", children: [_jsx("div", { className: "text-sm font-medium text-gray-900", children: run.testSuite?.name }), _jsx("div", { className: "text-xs text-gray-500", children: run.id.slice(0, 8) })] }), _jsx("td", { className: "whitespace-nowrap px-6 py-4", children: _jsxs("div", { className: "flex items-center gap-2 text-sm text-gray-900", children: [_jsx("span", { children: getPlatformIcon(run.device?.platform || 'ANDROID') }), _jsx("span", { children: run.device?.name }), _jsxs("span", { className: "text-xs text-gray-500", children: ["(", run.device?.osVersion, ")"] })] }) }), _jsx("td", { className: "whitespace-nowrap px-6 py-4", children: _jsx(Badge, { variant: "status", status: run.status, children: run.status }) }), _jsxs("td", { className: "whitespace-nowrap px-6 py-4 text-right text-sm", children: [_jsxs("span", { className: "font-medium text-green-600", children: [run.passedCount, " passed"] }), _jsx("span", { className: "mx-1 text-gray-400", children: "/" }), _jsxs("span", { className: "font-medium text-red-600", children: [run.failedCount, " failed"] }), run.skippedCount > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "mx-1 text-gray-400", children: "/" }), _jsxs("span", { className: "text-gray-500", children: [run.skippedCount, " skipped"] })] }))] }), _jsx("td", { className: "whitespace-nowrap px-6 py-4 text-right text-sm text-gray-600", children: run.totalDuration ? formatDuration(run.totalDuration) : '-' }), _jsx("td", { className: "whitespace-nowrap px-6 py-4 text-right text-sm text-gray-600", children: run.startedAt ? formatDate(run.startedAt) : '-' }), _jsx("td", { className: "whitespace-nowrap px-6 py-4 text-right text-sm", children: _jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsx(Link, { to: `/test-runs/${run.id}`, children: _jsx(Button, { size: "sm", variant: "ghost", children: _jsx(Eye, { className: "h-4 w-4" }) }) }), (run.status === 'PENDING' || run.status === 'RUNNING') && (_jsx(Button, { size: "sm", variant: "danger", onClick: () => cancelMutation.mutate(run.id), disabled: cancelMutation.isPending, children: _jsx(X, { className: "h-4 w-4" }) }))] }) })] }, run.id))) })] }) }), data.pagination.totalPages > 1 && (_jsxs("div", { className: "flex items-center justify-between border-t border-gray-200 px-6 py-4", children: [_jsxs("div", { className: "text-sm text-gray-600", children: ["Showing ", page * pageSize + 1, " to ", Math.min((page + 1) * pageSize, data.pagination.total), " of", ' ', data.pagination.total, " results"] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(Button, { size: "sm", variant: "secondary", onClick: () => setPage((p) => Math.max(0, p - 1)), disabled: page === 0, children: [_jsx(ChevronLeft, { className: "h-4 w-4" }), "Previous"] }), _jsxs("span", { className: "text-sm text-gray-600", children: ["Page ", page + 1, " of ", data.pagination.totalPages] }), _jsxs(Button, { size: "sm", variant: "secondary", onClick: () => setPage((p) => Math.min(data.pagination.totalPages - 1, p + 1)), disabled: page >= data.pagination.totalPages - 1, children: ["Next", _jsx(ChevronRight, { className: "h-4 w-4" })] })] })] }))] })) : (_jsx("div", { className: "py-12 text-center text-gray-500", children: "No test runs found" })) }) })] }));
}
