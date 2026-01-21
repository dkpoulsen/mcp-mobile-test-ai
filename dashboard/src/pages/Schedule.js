import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/Card';
import { CenteredSpinner } from '@/components/Spinner';
import { Badge } from '@/components/Badge';
import { Play, Clock, CheckCircle2, XCircle } from 'lucide-react';
export function Schedule() {
    const [selectedSuite, setSelectedSuite] = useState('');
    const [selectedDevice, setSelectedDevice] = useState('');
    const queryClient = useQueryClient();
    const { data: suites, isLoading: suitesLoading } = useQuery({
        queryKey: ['suites'],
        queryFn: () => api.getTestSuites(),
    });
    const { data: devices } = useQuery({
        queryKey: ['devices'],
        queryFn: () => api.getDevices(),
        refetchInterval: 5000,
    });
    const { data: runs } = useQuery({
        queryKey: ['runs', 'pending'],
        queryFn: () => api.getTestRuns({ take: 20, skip: 0, status: 'PENDING' }),
        refetchInterval: 5000,
    });
    const createMutation = useMutation({
        mutationFn: (data) => api.createTestRun(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['runs'] });
            queryClient.invalidateQueries({ queryKey: ['devices'] });
            queryClient.invalidateQueries({ queryKey: ['summary'] });
            setSelectedSuite('');
            setSelectedDevice('');
        },
    });
    const handleSchedule = () => {
        if (selectedSuite && selectedDevice) {
            createMutation.mutate({ testSuiteId: selectedSuite, deviceId: selectedDevice });
        }
    };
    if (suitesLoading) {
        return _jsx(CenteredSpinner, {});
    }
    const availableDevices = devices?.data.filter((d) => d.status === 'AVAILABLE') || [];
    const busyDevices = devices?.data.filter((d) => d.status === 'BUSY') || [];
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-900", children: "Schedule Test Runs" }), _jsx("p", { className: "text-gray-600", children: "Configure and execute test runs on your devices" })] }) }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Play, { className: "h-5 w-5" }), "Quick Run"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Test Suite" }), _jsxs("select", { value: selectedSuite, onChange: (e) => setSelectedSuite(e.target.value), className: "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm", children: [_jsx("option", { value: "", children: "Select a test suite..." }), suites?.data.map((suite) => (_jsx("option", { value: suite.id, children: suite.name }, suite.id)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Device" }), _jsxs("select", { value: selectedDevice, onChange: (e) => setSelectedDevice(e.target.value), className: "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm", children: [_jsx("option", { value: "", children: "Select a device..." }), availableDevices.map((device) => (_jsxs("option", { value: device.id, children: [device.platform === 'IOS' ? '🍎' : '🤖', " ", device.name, " (", device.osVersion, ")"] }, device.id)))] })] }), _jsx(Button, { onClick: handleSchedule, disabled: !selectedSuite || !selectedDevice || createMutation.isPending, className: "w-full", children: createMutation.isPending ? 'Scheduling...' : 'Start Test Run' })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Device Status" }) }), _jsx(CardContent, { children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsxs("h4", { className: "flex items-center gap-2 text-sm font-medium text-gray-700", children: [_jsx(CheckCircle2, { className: "h-4 w-4 text-green-600" }), "Available (", availableDevices.length, ")"] }), _jsx("div", { className: "mt-2 space-y-2", children: availableDevices.length === 0 ? (_jsx("p", { className: "text-sm text-gray-500", children: "No devices available" })) : (availableDevices.map((device) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2", children: [_jsxs("span", { className: "text-sm", children: [device.platform === 'IOS' ? '🍎' : '🤖', " ", device.name] }), _jsx(Badge, { variant: "status", status: device.status, className: "text-xs", children: device.status })] }, device.id)))) })] }), _jsxs("div", { children: [_jsxs("h4", { className: "flex items-center gap-2 text-sm font-medium text-gray-700", children: [_jsx(XCircle, { className: "h-4 w-4 text-red-600" }), "Busy (", busyDevices.length, ")"] }), _jsx("div", { className: "mt-2 space-y-2", children: busyDevices.length === 0 ? (_jsx("p", { className: "text-sm text-gray-500", children: "No devices busy" })) : (busyDevices.map((device) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2", children: [_jsxs("span", { className: "text-sm", children: [device.platform === 'IOS' ? '🍎' : '🤖', " ", device.name] }), _jsx(Badge, { variant: "status", status: device.status, className: "text-xs", children: device.status })] }, device.id)))) })] })] }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Clock, { className: "h-5 w-5" }), "Pending & Running Tests"] }) }), _jsx(CardContent, { children: runs && runs.data.length > 0 ? (_jsx("div", { className: "space-y-3", children: runs.data.map((run) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border border-gray-200 px-4 py-3", children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-medium text-gray-900", children: run.testSuite?.name }), _jsxs("p", { className: "text-sm text-gray-600", children: [run.device?.platform === 'IOS' ? '🍎' : '🤖', " ", run.device?.name, " \u2022 ID:", ' ', run.id.slice(0, 8)] })] }), _jsx(Badge, { variant: "status", status: run.status, children: run.status })] }, run.id))) })) : (_jsx("div", { className: "py-8 text-center text-gray-500", children: "No pending or running tests" })) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "All Devices" }) }), _jsx(CardContent, { children: devices && devices.data.length > 0 ? (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-gray-200", children: [_jsx("th", { className: "pb-3 text-left text-sm font-medium text-gray-600", children: "Platform" }), _jsx("th", { className: "pb-3 text-left text-sm font-medium text-gray-600", children: "Name" }), _jsx("th", { className: "pb-3 text-left text-sm font-medium text-gray-600", children: "OS Version" }), _jsx("th", { className: "pb-3 text-left text-sm font-medium text-gray-600", children: "Type" }), _jsx("th", { className: "pb-3 text-left text-sm font-medium text-gray-600", children: "Status" })] }) }), _jsx("tbody", { children: devices.data.map((device) => (_jsxs("tr", { className: "border-b border-gray-100", children: [_jsx("td", { className: "py-3 text-sm", children: device.platform === 'IOS' ? '🍎 iOS' : '🤖 Android' }), _jsx("td", { className: "py-3 text-sm font-medium", children: device.name }), _jsx("td", { className: "py-3 text-sm text-gray-600", children: device.osVersion }), _jsx("td", { className: "py-3 text-sm text-gray-600", children: device.isEmulator ? 'Emulator' : 'Real Device' }), _jsx("td", { className: "py-3", children: _jsx(Badge, { variant: "status", status: device.status, children: device.status }) })] }, device.id))) })] }) })) : (_jsx("div", { className: "py-8 text-center text-gray-500", children: "No devices found" })) })] })] }));
}
