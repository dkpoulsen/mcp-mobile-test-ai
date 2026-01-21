/**
 * Repository layer exports
 */

export { DeviceRepository } from './device.repository.js';
export type {
  DeviceWithRuns,
  CreateDeviceInput,
  UpdateDeviceInput,
  DeviceQueryInput,
} from './device.repository.js';

export { TestSuiteRepository } from './test-suite.repository.js';
export type {
  TestSuiteWithRelations,
  CreateTestSuiteInput,
  UpdateTestSuiteInput,
} from './test-suite.repository.js';

export { TestCaseRepository } from './test-case.repository.js';
export type {
  TestCaseWithSuite,
  TestCaseWithResults,
  CreateTestCaseInput,
  UpdateTestCaseInput,
  TestCaseQueryInput,
} from './test-case.repository.js';

export { TestRunRepository } from './test-run.repository.js';
export type {
  TestRunWithRelations,
  CreateTestRunInput,
  UpdateTestRunInput,
  TestRunQueryInput,
  TestRunSummary,
} from './test-run.repository.js';

export { TestResultRepository } from './test-result.repository.js';
export type {
  TestResultWithRelations,
  CreateTestResultInput,
  UpdateTestResultInput,
  TestResultQueryInput,
  TestResultStats,
} from './test-result.repository.js';

export { ArtifactRepository } from './artifact.repository.js';
export type {
  ArtifactWithRun,
  CreateArtifactInput,
  ArtifactQueryInput,
} from './artifact.repository.js';

export { FlakyTestRepository } from './flaky-test.repository.js';
export type {
  FlakyTestWithRelations,
  TestQuarantineWithRelations,
  CreateFlakyTestInput,
  CreateQuarantineInput,
  FlakyTestQuery,
  QuarantineQuery,
  FlakyTestRepoStats,
} from './flaky-test.repository.js';
