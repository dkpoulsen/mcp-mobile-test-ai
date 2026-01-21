/**
 * Type definitions for the test runner engine
 */

import type { TestCase as PrismaTestCase } from '@prisma/client';

/**
 * TestCase interface for test runner
 * Re-exports Prisma TestCase for convenience
 */
export type TestCase = PrismaTestCase;

/**
 * Device assignment for a test execution
 */
export interface DeviceAssignment {
  /** Device ID from database */
  deviceId: string;
  /** Device platform */
  platform: 'ios' | 'android';
  /** Whether this is an emulator/simulator or physical device */
  isEmulator: boolean;
  /** Device name */
  name: string;
  /** OS version */
  osVersion: string;
}

/**
 * Test execution context for a single test case
 */
export interface TestExecutionContext {
  /** Test run ID */
  testRunId: string;
  /** Test case being executed */
  testCase: TestCase;
  /** Assigned device */
  device: DeviceAssignment;
  /** Session ID for the device connection */
  sessionId?: string;
  /** Test execution timeout in milliseconds */
  timeout: number;
  /** Retry attempt number */
  retryAttempt: number;
  /** Maximum retries allowed */
  maxRetries: number;
}

/**
 * Test execution result with artifacts
 */
export interface TestExecutionResult {
  /** Test result ID */
  id: string;
  /** Test case ID */
  testCaseId: string;
  /** Test run ID */
  testRunId: string;
  /** Execution status */
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TIMEOUT';
  /** Error message if failed */
  errorMessage?: string;
  /** Stack trace if failed */
  stackTrace?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Timestamp of execution */
  timestamp: Date;
  /** Captured artifacts */
  artifacts: TestArtifact[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Test artifact captured during execution
 */
export interface TestArtifact {
  /** Artifact type */
  type: 'LOG' | 'SCREENSHOT' | 'VIDEO' | 'HAR' | 'TRACE' | 'OTHER';
  /** File path or URL */
  path: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Timestamp when captured */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Test runner configuration
 */
export interface TestRunnerConfig {
  /** Maximum number of parallel test executions */
  maxParallel: number;
  /** Default test timeout in milliseconds */
  testTimeout: number;
  /** Maximum retry attempts for failed tests */
  maxRetries: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay: number;
  /** Whether to capture screenshots on failure */
  captureScreenshotOnFailure: boolean;
  /** Whether to capture video during execution */
  captureVideo: boolean;
  /** Whether to capture logs */
  captureLogs: boolean;
  /** Base directory for artifact storage */
  artifactBaseDir: string;
  /** Maximum number of test sessions to keep alive */
  maxSessions: number;
  /** Session idle timeout in milliseconds */
  sessionIdleTimeout: number;
}

/**
 * Device session management
 */
export interface DeviceSession {
  /** Session ID */
  sessionId: string;
  /** Device ID */
  deviceId: string;
  /** Session status */
  status: 'idle' | 'busy' | 'initializing' | 'terminating' | 'error';
  /** Test run ID currently using this session */
  currentTestRunId?: string;
  /** Test case ID currently being executed */
  currentTestCaseId?: string;
  /** Session creation time */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Number of tests executed in this session */
  testCount: number;
  /** Session-specific metadata */
  metadata: Record<string, unknown>;
}

/**
 * Parallel execution batch
 */
export interface TestExecutionBatch {
  /** Batch ID */
  batchId: string;
  /** Test cases in this batch */
  testCases: TestCase[];
  /** Device assignments for each test case */
  deviceAssignments: Map<string, DeviceAssignment>;
  /** Batch start time */
  startTime: Date;
  /** Batch status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Test runner statistics
 */
export interface TestRunnerStats {
  /** Total tests executed */
  totalTests: number;
  /** Tests passed */
  passedTests: number;
  /** Tests failed */
  failedTests: number;
  /** Tests skipped */
  skippedTests: number;
  /** Tests timed out */
  timeoutTests: number;
  /** Total retry attempts */
  totalRetries: number;
  /** Average test duration in milliseconds */
  avgDuration: number;
  /** Total execution duration in milliseconds */
  totalDuration: number;
  /** Active device sessions */
  activeSessions: number;
  /** Available device sessions */
  availableSessions: number;
}

/**
 * Test runner event types
 */
export enum TestRunnerEventType {
  /** Test execution started */
  TEST_STARTED = 'test.started',
  /** Test execution completed */
  TEST_COMPLETED = 'test.completed',
  /** Test execution failed */
  TEST_FAILED = 'test.failed',
  /** Test execution skipped */
  TEST_SKIPPED = 'test.skipped',
  /** Test execution timed out */
  TEST_TIMEOUT = 'test.timeout',
  /** Test retry attempt started */
  TEST_RETRY = 'test.retry',
  /** Device session created */
  SESSION_CREATED = 'session.created',
  /** Device session released */
  SESSION_RELEASED = 'session.released',
  /** Device session error */
  SESSION_ERROR = 'session.error',
  /** Batch execution started */
  BATCH_STARTED = 'batch.started',
  /** Batch execution completed */
  BATCH_COMPLETED = 'batch.completed',
}

/**
 * Test runner event payload
 */
export interface TestRunnerEvent {
  /** Event type */
  type: TestRunnerEventType;
  /** Test run ID */
  testRunId: string;
  /** Test case ID if applicable */
  testCaseId?: string;
  /** Device ID if applicable */
  deviceId?: string;
  /** Session ID if applicable */
  sessionId?: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data: Record<string, unknown>;
}

/**
 * Test runner event handler
 */
export type TestRunnerEventHandler = (event: TestRunnerEvent) => void | Promise<void>;

/**
 * Test isolation strategy
 */
export enum TestIsolationStrategy {
  /** Full isolation: create new session for each test */
  FULL_ISOLATION = 'full_isolation',
  /** Session reuse: reuse sessions across tests */
  SESSION_REUSE = 'session_reuse',
  /** Device isolation: isolate at device level only */
  DEVICE_ISOLATION = 'device_isolation',
}

/**
 * Test execution options
 */
export interface TestExecutionOptions {
  /** Test isolation strategy */
  isolationStrategy?: TestIsolationStrategy;
  /** Custom timeout for this execution */
  timeout?: number;
  /** Priority for queue placement */
  priority?: number;
  /** Tags for filtering/tracking */
  tags?: string[];
  /** Custom device preferences */
  devicePreferences?: {
    /** Preferred platform */
    platform?: 'ios' | 'android';
    /** Minimum OS version */
    minOsVersion?: string;
    /** Prefer emulator over physical device */
    preferEmulator?: boolean;
  };
}
