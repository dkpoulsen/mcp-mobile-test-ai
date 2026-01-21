/**
 * Test execution processor - handles actual test execution logic
 * Integrates with the test runner engine for parallel execution
 */

import type { TestJob, TestJobResult } from '../../queues/types.js';
import { getPrismaClient } from '../../database/client.js';
import { createModuleLogger } from '../../utils/logger.js';
import { getGlobalTestRunner, TestRunnerEngine } from './test-runner.js';
import { resetGlobalSessionManager } from './session-manager.js';

const logger = createModuleLogger('test-processor');

/**
 * Process a test execution job
 * This is the main worker processor function that executes tests
 * using the test runner engine for parallel execution
 */
export async function processTestExecution(job: TestJob): Promise<TestJobResult> {
  const { testRunId, testSuiteId, deviceId } = job.data;

  logger.info(
    {
      jobId: job.id,
      testRunId,
      testSuiteId,
      deviceId,
    },
    'Starting test execution'
  );

  const startTime = Date.now();

  try {
    // Update job progress
    await job.updateProgress(10);

    // Verify test run exists
    const prisma = getPrismaClient();
    const testRun = await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        device: true,
      },
    });

    if (!testRun) {
      throw new Error(`Test run not found: ${testRunId}`);
    }

    // Verify device exists and is available
    const device = testRun.device || await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await job.updateProgress(20);

    // Get or create test runner engine
    const testRunner = getGlobalTestRunner({
      maxParallel: job.data.metadata?.maxParallel as number | undefined,
      testTimeout: job.data.timeout,
      maxRetries: job.data.metadata?.maxRetries as number | undefined,
    });

    // Set up event handler for progress updates
    testRunner.on((_event) => {
      // Progress tracking would be implemented here based on event data
      // For now, we don't use the event parameter
    });

    await job.updateProgress(30);

    // Execute the test suite using the test runner engine
    const stats = await testRunner.executeTestSuite(testRunId, deviceId, {
      isolationStrategy: job.data.metadata?.isolationStrategy as any,
      timeout: job.data.timeout,
      priority: job.data.priority,
      tags: job.data.metadata?.tags as string[] | undefined,
      devicePreferences: job.data.metadata?.devicePreferences as any,
    });

    await job.updateProgress(100);

    logger.info(
      {
        testRunId,
        stats,
      },
      'Test execution completed successfully'
    );

    return {
      success: true,
      testRunId,
      passedCount: stats.passedTests,
      failedCount: stats.failedTests,
      skippedCount: stats.skippedTests,
      totalDuration: stats.totalDuration,
      metadata: {
        timeoutTests: stats.timeoutTests,
        totalRetries: stats.totalRetries,
        avgDuration: stats.avgDuration,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      {
        testRunId,
        error: errorMessage,
      },
      'Test execution failed'
    );

    // Update test run as failed
    const prisma = getPrismaClient();
    await prisma.testRun
      .update({
        where: { id: testRunId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          metadata: {
            error: errorMessage,
          },
        },
      })
      .catch((err) => {
        logger.error({ error: err }, 'Failed to update test run status');
      });

    return {
      success: false,
      testRunId,
      passedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalDuration: Date.now() - startTime,
      errorMessage,
    };
  }
}

/**
 * Legacy function for backward compatibility
 * Execute a single test case
 * DEPRECATED: Use the test runner engine instead
 */
export async function executeTestCase(
  testRunId: string,
  testCase: { id: string; name: string; description?: string | null }
): Promise<{ status: 'PASSED' | 'FAILED' | 'SKIPPED'; errorMessage?: string }> {
  logger.warn(
    'executeTestCase is deprecated. Use test runner engine instead.'
  );

  const prisma = getPrismaClient();
  const startTime = Date.now();

  // Create test result record
  const testResult = await prisma.testResult.create({
    data: {
      testRunId,
      testCaseId: testCase.id,
      status: 'FAILED',
      duration: 0,
    },
  });

  try {
    // For backward compatibility, execute directly through database
    // Simulate test execution time
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    // For demo purposes, randomly pass or fail tests
    const passed = Math.random() > 0.2;

    const duration = Date.now() - startTime;

    if (passed) {
      await prisma.testResult.update({
        where: { id: testResult.id },
        data: {
          status: 'PASSED',
          duration,
        },
      });

      return { status: 'PASSED' };
    } else {
      const errorMessage = 'Test assertion failed: Element not found';
      await prisma.testResult.update({
        where: { id: testResult.id },
        data: {
          status: 'FAILED',
          errorMessage,
          duration,
        },
      });

      return { status: 'FAILED', errorMessage };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    await prisma.testResult.update({
      where: { id: testResult.id },
      data: {
        status: 'FAILED',
        errorMessage,
        duration,
      },
    });

    return { status: 'FAILED', errorMessage };
  }
}

/**
 * Reset the test runner engine
 * Useful for testing or reconfiguration
 */
export async function resetTestRunner(): Promise<void> {
  await resetGlobalSessionManager();
  await (await import('./test-runner.js')).resetGlobalTestRunner();
  logger.info('Test runner engine reset');
}

/**
 * Get the current test runner instance
 */
export async function getTestRunner(): Promise<TestRunnerEngine> {
  return getGlobalTestRunner();
}
