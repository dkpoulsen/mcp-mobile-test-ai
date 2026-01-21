import { clsx } from 'clsx';
export function cn(...inputs) {
    return clsx(inputs);
}
export function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}
export function formatDate(date) {
    return new Date(date).toLocaleString();
}
export function getStatusColor(status) {
    const colors = {
        PENDING: 'bg-yellow-100 text-yellow-800',
        RUNNING: 'bg-blue-100 text-blue-800',
        COMPLETED: 'bg-green-100 text-green-800',
        FAILED: 'bg-red-100 text-red-800',
        CANCELLED: 'bg-gray-100 text-gray-800',
        PASSED: 'bg-green-100 text-green-800',
        SKIPPED: 'bg-gray-100 text-gray-800',
        TIMEOUT: 'bg-orange-100 text-orange-800',
        AVAILABLE: 'bg-green-100 text-green-800',
        BUSY: 'bg-yellow-100 text-yellow-800',
        OFFLINE: 'bg-gray-100 text-gray-800',
        MAINTENANCE: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
}
export function getPlatformIcon(platform) {
    return platform === 'IOS' ? '🍎' : '🤖';
}
