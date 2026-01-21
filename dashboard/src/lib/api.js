const API_BASE = '/api';
async function fetchJson(url, options) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
        ...options,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || 'API request failed');
    }
    return response.json();
}
// Devices
export const api = {
    // Test Runs
    getTestRuns: (params) => fetchJson(`${API_BASE}/test-runs?${new URLSearchParams(params || {}).toString()}`),
    getTestRun: (id) => fetchJson(`${API_BASE}/test-runs/${id}`),
    createTestRun: (data) => fetchJson(`${API_BASE}/test-runs`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    startTestRun: (id) => fetchJson(`${API_BASE}/test-runs/${id}/start`, {
        method: 'POST',
    }),
    cancelTestRun: (id) => fetchJson(`${API_BASE}/test-runs/${id}/cancel`, {
        method: 'POST',
    }),
    deleteTestRun: (id) => fetch(`${API_BASE}/test-runs/${id}`, { method: 'DELETE' }),
    getTestRunResults: (id, params) => fetchJson(`${API_BASE}/test-runs/${id}/results?${new URLSearchParams(params || {}).toString()}`),
    getTestRunArtifacts: (id) => fetchJson(`${API_BASE}/test-runs/${id}/artifacts`),
    getTestRunSummary: (params) => fetchJson(`${API_BASE}/test-runs/summary?${new URLSearchParams(params || {}).toString()}`),
    getHistoricalData: (params) => fetchJson(`${API_BASE}/test-runs/historical?${new URLSearchParams(params || {}).toString()}`),
    // Test Suites
    getTestSuites: () => fetchJson(`${API_BASE}/test-suites`),
    getTestSuite: (id) => fetchJson(`${API_BASE}/test-suites/${id}`),
    // Test Cases
    getTestCases: (params) => fetchJson(`${API_BASE}/test-cases?${new URLSearchParams(params || {}).toString()}`),
    // Devices
    getDevices: () => fetchJson(`${API_BASE}/devices`),
    // Health
    getHealth: () => fetchJson('/health'),
};
export default api;
