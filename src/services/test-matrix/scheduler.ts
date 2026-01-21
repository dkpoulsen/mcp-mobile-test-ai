/**
 * Matrix scheduler for test variant execution
 *
 * Schedules and manages execution of test variants across the matrix.
 */

import type {
  TestDefinition,
  TestVariant,
  MatrixSchedule,
  MatrixOptions,
  MatrixResult,
  BrowserType,
  DeviceCategory,
  MatrixDimensions,
} from './types.js';
import type { PresetDevice } from './preset-devices.js';
import { generateVariants, filterVariantsByTags, getVariantStatistics } from './variant-generator.js';

/**
 * Scheduler state for an active matrix
 */
interface SchedulerState {
  matrixId: string;
  testDefinition: TestDefinition;
  variants: TestVariant[];
  options: MatrixOptions;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  results: Map<string, VariantResultInternal>;
  currentIndex: number;
}

/**
 * Variant result for internal tracking
 */
export interface VariantResult {
  variantId: string;
  displayName: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'timeout';
  error?: string;
  stackTrace?: string;
  duration: number;
  retryCount: number;
  artifacts: string[];
}

interface VariantResultInternal extends VariantResult {}

/**
 * Active schedules
 */
const activeSchedules = new Map<string, SchedulerState>();

/**
 * Generate unique matrix ID
 */
function generateMatrixId(testId: string): string {
  return `matrix-${testId}-${Date.now()}`;
}

/**
 * Create a matrix schedule from a test definition
 */
export function createMatrixSchedule(
  testDefinition: TestDefinition,
  dimensions: {
    browsers?: BrowserType[];
    devices?: string[];
    viewports?: Array<{ width: number; height: number }>;
  } = {},
  options: MatrixOptions = {}
): MatrixSchedule {
  // Build matrix dimensions from simplified input
  const presetDevices = dimensions.devices ?? [];
  const devicesWithViewport: PresetDevice[] = presetDevices
    .map((name) => {
      const device = presetDevices.find((d) => d === name);
      if (!device) return undefined;
      // Convert string to device lookup - use preset device library
      return { name, category: 'desktop' as const, viewport: { width: 1920, height: 1080 } };
    })
    .filter((d): d is PresetDevice => d !== undefined);

  const matrixDimensions: MatrixDimensions = {
    browsers: dimensions.browsers?.map((b) => ({ browser: b })),
    devices: presetDevices.map((d) => ({
      name: d,
      category: 'desktop' as const,
      viewport: { width: 1920, height: 1080 },
    })),
    viewports: dimensions.viewports,
  };

  // Generate all variants
  let variants = generateVariants(testDefinition, matrixDimensions);

  // Filter by tags if specified
  if (options.includeTags || options.excludeTags) {
    variants = filterVariantsByTags(
      variants,
      options.includeTags ?? [],
      options.excludeTags ?? []
    );
  }

  // Apply custom priority function if provided
  if (options.priorityFn) {
    variants.sort((a, b) => options.priorityFn!(b) - options.priorityFn!(a));
  }

  // Create execution batches based on maxParallel
  const maxParallel = options.maxParallel ?? 1;
  const batches: TestVariant[][] = [];

  for (let i = 0; i < variants.length; i += maxParallel) {
    batches.push(variants.slice(i, i + maxParallel));
  }

  // Calculate total estimated duration
  const stats = getVariantStatistics(variants);
  const estimatedDuration = options.maxParallel
    ? Math.ceil(stats.totalEstimatedDuration / options.maxParallel)
    : stats.totalEstimatedDuration;

  const matrixId = generateMatrixId(testDefinition.id);

  return {
    id: matrixId,
    testDefinition,
    variants,
    batches,
    estimatedDuration,
    options,
  };
}

/**
 * Initialize a matrix execution
 */
export function initializeMatrix(schedule: MatrixSchedule): string {
  const state: SchedulerState = {
    matrixId: schedule.id,
    testDefinition: schedule.testDefinition,
    variants: schedule.variants,
    options: schedule.options,
    status: 'pending',
    results: new Map(),
    currentIndex: 0,
  };

  // Initialize results for all variants
  for (const variant of schedule.variants) {
    state.results.set(variant.id, {
      variantId: variant.id,
      displayName: variant.displayName,
      status: 'pending',
      duration: 0,
      retryCount: 0,
      artifacts: [],
    });
  }

  activeSchedules.set(schedule.id, state);
  return schedule.id;
}

/**
 * Start matrix execution
 */
export function startMatrix(matrixId: string): boolean {
  const state = activeSchedules.get(matrixId);
  if (!state) return false;

  state.status = 'running';
  state.startedAt = new Date();
  return true;
}

/**
 * Get next variant to execute
 */
export function getNextVariant(matrixId: string): TestVariant | null {
  const state = activeSchedules.get(matrixId);
  if (!state || state.status !== 'running') return null;

  // Check if shuffle is enabled
  const variants = state.options.shuffle
    ? [...state.variants].sort(() => Math.random() - 0.5)
    : state.variants;

  // Find next pending variant
  for (let i = state.currentIndex; i < variants.length; i++) {
    const variant = variants[i];
    const result = state.results.get(variant.id);

    if (result?.status === 'pending') {
      state.currentIndex = i;
      // Mark as running
      state.results.set(variant.id, {
        ...result,
        status: 'running',
      });
      return variant;
    }
  }

  return null;
}

/**
 * Record variant result
 */
export function recordVariantResult(
  matrixId: string,
  variantId: string,
  result: Partial<VariantResult>
): boolean {
  const state = activeSchedules.get(matrixId);
  if (!state) return false;

  const existing = state.results.get(variantId);
  if (!existing) return false;

  state.results.set(variantId, {
    ...existing,
    ...result,
    status: result.status ?? existing.status,
  });

  return true;
}

/**
 * Complete variant execution
 */
export function completeVariant(
  matrixId: string,
  variantId: string,
  passed: boolean,
  duration: number,
  error?: string,
  stackTrace?: string,
  artifacts: string[] = []
): boolean {
  return recordVariantResult(matrixId, variantId, {
    status: passed ? 'passed' : 'failed',
    duration,
    error,
    stackTrace,
    artifacts,
  });
}

/**
 * Retry a failed variant
 */
export function retryVariant(matrixId: string, variantId: string): boolean {
  const state = activeSchedules.get(matrixId);
  if (!state) return false;

  const result = state.results.get(variantId);
  if (!result) return false;

  const maxRetries = state.options.retries ?? 0;
  if (result.retryCount >= maxRetries) return false;

  state.results.set(variantId, {
    ...result,
    status: 'pending',
    retryCount: result.retryCount + 1,
  });

  return true;
}

/**
 * Complete matrix execution
 */
export function completeMatrix(matrixId: string): MatrixResult | null {
  const state = activeSchedules.get(matrixId);
  if (!state) return null;

  state.status = 'completed';
  state.completedAt = new Date();

  // Calculate summary statistics
  let passedVariants = 0;
  let failedVariants = 0;
  let skippedVariants = 0;

  const resultsArray = Array.from(state.results.values());
  for (const result of resultsArray) {
    if (result.status === 'passed') passedVariants++;
    else if (result.status === 'failed') failedVariants++;
    else if (result.status === 'skipped') skippedVariants++;
  }

  const executionTime = state.completedAt.getTime() - (state.startedAt?.getTime() ?? 0);

  return {
    matrixId: state.matrixId,
    testDefinition: state.testDefinition,
    totalVariants: state.variants.length,
    completedVariants: passedVariants + failedVariants + skippedVariants,
    passedVariants,
    failedVariants,
    skippedVariants,
    variantResults: state.results,
    executionTime,
    startedAt: state.startedAt ?? new Date(),
    completedAt: state.completedAt,
  };
}

/**
 * Get current matrix status
 */
export function getMatrixStatus(matrixId: string): {
  status: string;
  completed: number;
  total: number;
  passed: number;
  failed: number;
  pending: number;
} | null {
  const state = activeSchedules.get(matrixId);
  if (!state) return null;

  let passed = 0;
  let failed = 0;
  let pending = 0;

  const resultsArray = Array.from(state.results.values());
  for (const result of resultsArray) {
    if (result.status === 'passed' || result.status === 'completed') passed++;
    else if (result.status === 'failed') failed++;
    else if (result.status === 'pending') pending++;
  }

  return {
    status: state.status,
    completed: passed + failed,
    total: state.variants.length,
    passed,
    failed,
    pending,
  };
}

/**
 * Cancel matrix execution
 */
export function cancelMatrix(matrixId: string): boolean {
  const state = activeSchedules.get(matrixId);
  if (!state) return false;

  state.status = 'cancelled';

  // Mark all pending variants as skipped
  const entriesArray = Array.from(state.results.entries());
  for (const [variantId, result] of entriesArray) {
    if (result.status === 'pending' || result.status === 'running') {
      state.results.set(variantId, {
        ...result,
        status: 'skipped',
      });
    }
  }

  return true;
}

/**
 * Remove completed matrix from active schedules
 */
export function cleanupMatrix(matrixId: string): boolean {
  return activeSchedules.delete(matrixId);
}

/**
 * Get all active matrix IDs
 */
export function getActiveMatrixIds(): string[] {
  return Array.from(activeSchedules.keys());
}

/**
 * Check if matrix should continue on failure
 */
export function shouldContinueOnFailure(matrixId: string): boolean {
  const state = activeSchedules.get(matrixId);
  return state?.options.continueOnFailure ?? false;
}

/**
 * Execute a batch of variants in parallel
 */
export function executeBatch(
  matrixId: string,
  executor: (variant: TestVariant) => Promise<VariantResult>
): Promise<VariantResult[]> {
  const state = activeSchedules.get(matrixId);
  if (!state) {
    return Promise.reject(new Error('Matrix not found'));
  }

  const maxParallel = state.options.maxParallel ?? 1;
  const batch: TestVariant[] = [];

  // Collect next batch of variants
  for (let i = 0; i < maxParallel; i++) {
    const variant = getNextVariant(matrixId);
    if (!variant) break;
    batch.push(variant);
  }

  if (batch.length === 0) {
    return Promise.resolve([]);
  }

  // Execute batch in parallel
  return Promise.all(
    batch.map(async (variant) => {
      try {
        const result = await executor(variant);
        recordVariantResult(matrixId, variant.id, result);
        return result;
      } catch (error) {
        const failedResult: VariantResult = {
          variantId: variant.id,
          displayName: variant.displayName,
          status: 'failed',
          duration: 0,
          retryCount: 0,
          artifacts: [],
          error: error instanceof Error ? error.message : String(error),
        };
        recordVariantResult(matrixId, variant.id, failedResult);

        // Check if we should continue
        if (!shouldContinueOnFailure(matrixId)) {
          throw error;
        }
        return failedResult;
      }
    })
  );
}

/**
 * Execute entire matrix with callback
 */
export async function executeMatrix(
  schedule: MatrixSchedule,
  executor: (variant: TestVariant) => Promise<VariantResult>
): Promise<MatrixResult> {
  const matrixId = initializeMatrix(schedule);
  startMatrix(matrixId);

  try {
    // Execute all batches
    while (true) {
      const results = await executeBatch(matrixId, executor);
      if (results.length === 0) break;
    }
  } finally {
    // Always complete the matrix
    return completeMatrix(matrixId) ?? {
      matrixId,
      testDefinition: schedule.testDefinition,
      totalVariants: 0,
      completedVariants: 0,
      passedVariants: 0,
      failedVariants: 0,
      skippedVariants: 0,
      variantResults: new Map(),
      executionTime: 0,
      startedAt: new Date(),
    };
  }
}

/**
 * Export scheduler utilities
 */
export const MatrixScheduler = {
  createSchedule: createMatrixSchedule,
  initialize: initializeMatrix,
  start: startMatrix,
  getNextVariant,
  recordResult: recordVariantResult,
  completeVariant,
  retryVariant,
  complete: completeMatrix,
  getStatus: getMatrixStatus,
  cancel: cancelMatrix,
  cleanup: cleanupMatrix,
  getActiveIds: getActiveMatrixIds,
  shouldContinueOnFailure,
  executeBatch,
  execute: executeMatrix,
};
