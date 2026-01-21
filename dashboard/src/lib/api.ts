import type {
  Device,
  TestSuite,
  TestCase,
  TestRun,
  TestResult,
  Artifact,
  PaginatedResponse,
  ApiResponse,
  TestRunSummary,
  HistoricalData,
} from '@/types/api';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
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

  return response.json() as Promise<T>;
}

// Devices
export const api = {
  // Test Runs
  getTestRuns: (params?: { skip?: number; take?: number; testSuiteId?: string; deviceId?: string; status?: string }) =>
    fetchJson<PaginatedResponse<TestRun>>(`${API_BASE}/test-runs?${new URLSearchParams(params as Record<string, string> || {}).toString()}`),

  getTestRun: (id: string) =>
    fetchJson<ApiResponse<TestRun>>(`${API_BASE}/test-runs/${id}`),

  createTestRun: (data: { testSuiteId: string; deviceId: string; metadata?: unknown }) =>
    fetchJson<ApiResponse<TestRun>>(`${API_BASE}/test-runs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startTestRun: (id: string) =>
    fetchJson<ApiResponse<TestRun>>(`${API_BASE}/test-runs/${id}/start`, {
      method: 'POST',
    }),

  cancelTestRun: (id: string) =>
    fetchJson<ApiResponse<TestRun>>(`${API_BASE}/test-runs/${id}/cancel`, {
      method: 'POST',
    }),

  deleteTestRun: (id: string) =>
    fetch(`${API_BASE}/test-runs/${id}`, { method: 'DELETE' }),

  getTestRunResults: (id: string, params?: { skip?: number; take?: number }) =>
    fetchJson<PaginatedResponse<TestResult>>(`${API_BASE}/test-runs/${id}/results?${new URLSearchParams(params as Record<string, string> || {}).toString()}`),

  getTestRunArtifacts: (id: string) =>
    fetchJson<ApiResponse<Artifact[]>>(`${API_BASE}/test-runs/${id}/artifacts`),

  getTestRunSummary: (params?: { testSuiteId?: string; deviceId?: string; status?: string }) =>
    fetchJson<ApiResponse<TestRunSummary>>(`${API_BASE}/test-runs/summary?${new URLSearchParams(params as Record<string, string> || {}).toString()}`),

  getHistoricalData: (params?: { days?: number; testSuiteId?: string; deviceId?: string }) =>
    fetchJson<ApiResponse<HistoricalData[]>>(`${API_BASE}/test-runs/historical?${new URLSearchParams(params as Record<string, string> || {}).toString()}`),

  // Test Suites
  getTestSuites: () =>
    fetchJson<PaginatedResponse<TestSuite>>(`${API_BASE}/test-suites`),

  getTestSuite: (id: string) =>
    fetchJson<ApiResponse<TestSuite>>(`${API_BASE}/test-suites/${id}`),

  // Test Cases
  getTestCases: (params?: { testSuiteId?: string }) =>
    fetchJson<PaginatedResponse<TestCase>>(`${API_BASE}/test-cases?${new URLSearchParams(params as Record<string, string> || {}).toString()}`),

  // Devices
  getDevices: () =>
    fetchJson<PaginatedResponse<Device>>(`${API_BASE}/devices`),

  // Health
  getHealth: () =>
    fetchJson<{ status: string }>('/health'),
};

export default api;
