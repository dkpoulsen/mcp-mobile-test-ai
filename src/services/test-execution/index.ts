/**
 * Test execution service - main entry point for worker functionality
 */

export { processTestExecution, executeTestCase, resetTestRunner, getTestRunner } from './processor.js';
export {
  startTestWorker,
  stopTestWorker,
  getTestWorker,
  isWorkerRunning,
  getWorkerInfo,
} from './worker.js';

// Test runner engine exports
export {
  TestRunnerEngine,
  getGlobalTestRunner,
  resetGlobalTestRunner,
} from './test-runner.js';

// Session manager exports
export {
  DeviceSessionManager,
  getGlobalSessionManager,
  resetGlobalSessionManager,
} from './session-manager.js';

// Type exports
export type {
  TestExecutionContext,
  TestExecutionResult,
  TestArtifact,
  TestRunnerConfig,
  TestRunnerStats,
  TestRunnerEvent,
  TestRunnerEventHandler,
  TestExecutionOptions,
  DeviceAssignment,
  DeviceSession,
  TestExecutionBatch,
} from './types.js';

export { TestIsolationStrategy, TestRunnerEventType } from './types.js';
