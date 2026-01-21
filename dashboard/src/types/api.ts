// API Types matching the backend models

export type Platform = 'IOS' | 'ANDROID';
export type DeviceStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'MAINTENANCE';
export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type ResultStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';
export type ArtifactType = 'LOG' | 'SCREENSHOT' | 'VIDEO' | 'HAR' | 'TRACE' | 'OTHER';

export interface Device {
  id: string;
  platform: Platform;
  name: string;
  osVersion: string;
  isEmulator: boolean;
  screenWidth?: number;
  screenHeight?: number;
  status: DeviceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  testSuiteId: string;
  name: string;
  description: string;
  expectedOutcome: string;
  timeout?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  id: string;
  testRunId: string;
  testCaseId: string;
  status: ResultStatus;
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  testCase?: Pick<TestCase, 'id' | 'name' | 'description'>;
}

export interface Artifact {
  id: string;
  testRunId: string;
  type: ArtifactType;
  path: string;
  size?: string;
  mimeType?: string;
  metadata?: unknown;
  createdAt: string;
}

export interface TestRun {
  id: string;
  testSuiteId: string;
  deviceId: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  totalDuration?: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  testSuite?: Pick<TestSuite, 'id' | 'name' | 'description'>;
  device?: Pick<Device, 'id' | 'name' | 'platform' | 'osVersion' | 'isEmulator'>;
  testResults?: TestResult[];
  artifacts?: Artifact[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    skip: number;
    take: number;
    total: number;
    totalPages: number;
  };
}

export interface TestRunSummary {
  total: number;
  byStatus: {
    completed: number;
    failed: number;
    pending: number;
    running: number;
    cancelled: number;
  };
  aggregate: {
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    passRate: number;
  };
}

export interface HistoricalData {
  date: string;
  total: number;
  passed: number;
  failed: number;
}

export interface ApiResponse<T> {
  data: T;
}
