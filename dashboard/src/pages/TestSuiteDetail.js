import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Play, List, Clock } from 'lucide-react';
import { useState } from 'react';
export function TestSuiteDetail() {
    const { id } = useParams();
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const { data: suite, isLoading: suiteLoading } = useQuery({
        queryKey: ['suite', id],
        queryFn: () => api.getTestSuite(id),
        enabled: !!id,
    });
    const { data: cases } = useQuery({
        queryKey: ['cases', id],
        queryFn: () => api.getTestCases({ testSuiteId: id }),
        enabled: !!id,
    });
    const { data: devices } = useQuery({
        queryKey: ['devices'],
        queryFn: () => api.getDevices(),
    });
    const { data: runs } = useQuery({
        queryKey: ['runs', 'suite', id],
        queryFn: () => api.getTestRuns({ testSuiteId: id, take: 10, skip: 0 }),
        enabled: !!id,
    });
    if (suiteLoading || !suite) {
        return _jsx(CenteredSpinner, {});
    }
    const testSuite = suite.data;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Link, { to: "/test-suites", children: _jsxs(Button, { size: "sm", variant: "ghost", children: [_jsx(ArrowLeft, { className: "mr-2 h-4 w-4" }), "Back"] }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-900", children: testSuite.name }), _jsxs("p", { className: "text-sm text-gray-600", children: ["ID: ", testSuite.id] })] })] }), _jsxs(Button, { onClick: () => setShowScheduleModal(true), children: [_jsx(Play, { className: "mr-2 h-4 w-4" }), "Run Tests"] })] }), testSuite.description && (_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsx("p", { className: "text-gray-700", children: testSuite.description }) }) })), _jsxs("div", { className: "grid gap-6 md:grid-cols-3", children: [_jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(List, { className: "h-10 w-10 text-blue-600" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Test Cases" }), _jsx("p", { className: "text-2xl font-bold text-gray-900", children: cases?.data.length || 0 })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Play, { className: "h-10 w-10 text-green-600" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Total Runs" }), _jsx("p", { className: "text-2xl font-bold text-gray-900", children: runs?.data.length || 0 })] })] }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "p-6", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx(Clock, { className: "h-10 w-10 text-purple-600" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Created" }), _jsx("p", { className: "text-sm font-medium text-gray-900", children: formatDate(testSuite.createdAt) })] })] }) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Test Cases" }) }), _jsx(CardContent, { children: cases && cases.data.length > 0 ? (_jsx("div", { className: "space-y-4", children: cases.data.map((testCase) => (_jsxs("div", { className: "border-b border-gray-200 pb-4 last:border-0", children: [_jsx("h4", { className: "font-medium text-gray-900", children: testCase.name }), testCase.description && (_jsx("p", { className: "mt-1 text-sm text-gray-600", children: testCase.description })), testCase.expectedOutcome && (_jsxs("div", { className: "mt-2", children: [_jsx("p", { className: "text-xs font-medium text-gray-700", children: "Expected Outcome:" }), _jsx("p", { className: "text-sm text-gray-600", children: testCase.expectedOutcome })] })), testCase.tags.length > 0 && (_jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: testCase.tags.map((tag) => (_jsx(Badge, { variant: "default", className: "text-xs", children: tag }, tag))) })), testCase.timeout && (_jsxs("p", { className: "mt-2 text-xs text-gray-500", children: ["Timeout: ", testCase.timeout, "ms"] }))] }, testCase.id))) })) : (_jsx("div", { className: "py-8 text-center text-gray-500", children: "No test cases found" })) })] }), showScheduleModal && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Schedule Test Run" }) }), _jsx(CardContent, { children: _jsxs("form", { onSubmit: async (e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const deviceId = formData.get('device');
                                    if (deviceId) {
                                        await api.createTestRun({ testSuiteId: id, deviceId });
                                        setShowScheduleModal(false);
                                        window.location.href = '/test-runs';
                                    }
                                }, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Device" }), _jsxs("select", { name: "device", required: true, className: "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm", children: [_jsx("option", { value: "", children: "Select a device..." }), devices?.data
                                                        .filter((d) => d.status === 'AVAILABLE')
                                                        .map((device) => (_jsxs("option", { value: device.id, children: [device.platform === 'IOS' ? '🍎' : '🤖', " ", device.name, " (", device.osVersion, ")"] }, device.id)))] })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { type: "button", variant: "secondary", onClick: () => setShowScheduleModal(false), children: "Cancel" }), _jsx(Button, { type: "submit", children: "Start Test Run" })] })] }) })] }) }))] }));
}
