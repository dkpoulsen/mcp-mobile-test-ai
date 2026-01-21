/**
 * Test runner engine - executes test cases with parallel execution support
 * Handles test isolation, comprehensive result capture, and artifact management
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import { Prisma } from '@prisma/client';
import { DeviceSessionManager, getGlobalSessionManager } from './session-manager.js';
import {
  createPerformanceMonitor,
  type PerformanceMonitor,
} from '../performance-monitor/index.js';
import type {
  TestExecutionContext,
  TestExecutionResult,
  TestArtifact,
  TestRunnerConfig,
  TestRunnerStats,
  TestRunnerEvent,
  TestRunnerEventHandler,
  TestExecutionOptions,
  TestCase,
} from './types.js';
import { TestRunnerEventType as EventType, TestIsolationStrategy } from './types.js';
import { getSmartRetryStrategy, type SmartRetryStrategy } from '../smart-retry/index.js';

const logger = createModuleLogger('test-runner');

/**
 * Extended test runner config with smart retry options
 */
interface ExtendedTestRunnerConfig extends TestRunnerConfig {
  /** Enable smart retry with strategy learning */
  enableSmartRetry?: boolean;
  /** Smart retry config overrides */
  smartRetryConfig?: {
    enabled?: boolean;
    maxRetries?: number;
    enableLearning?: boolean;
  };
}

/**
 * Default test runner configuration
 */
const DEFAULT_CONFIG: TestRunnerConfig = {
  maxParallel: 3,
  testTimeout: 60000, // 60 seconds
  maxRetries: 2,
  retryDelay: 1000,
  captureScreenshotOnFailure: true,
  captureVideo: false,
  captureLogs: true,
  artifactBaseDir: 'artifacts',
  maxSessions: 10,
  sessionIdleTimeout: 300000, // 5 minutes
};

/**
 * Test runner engine class
 */
export class TestRunnerEngine {
  /** Configuration */
  private config: ExtendedTestRunnerConfig;

  /** Session manager */
  private sessionManager: DeviceSessionManager;

  /** Smart retry strategy service */
  private smartRetry: SmartRetryStrategy | null = null;

  /** Event handlers */
  private eventHandlers: Set<TestRunnerEventHandler> = new Set();

  /** Active test executions by test run ID */
  private activeExecutions: Map<string, Set<string>> = new Map();

  /** Test run statistics by test run ID */
  private runStats: Map<string, Partial<TestRunnerStats>> = new Map();

  /** Active performance monitors by test run ID */
  private performanceMonitors: Map<string, PerformanceMonitor> = new Map();

  constructor(config?: Partial<ExtendedTestRunnerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize smart retry if enabled
    if (this.config.enableSmartRetry ?? false) {
      this.smartRetry = getSmartRetryStrategy(this.config.smartRetryConfig);
      logger.info('Smart retry strategy enabled for test runner');
    }

    this.sessionManager = getGlobalSessionManager({
      maxSessions: this.config.maxSessions,
      sessionIdleTimeout: this.config.sessionIdleTimeout,
    });

    logger.info(
      {
        maxParallel: this.config.maxParallel,
        testTimeout: this.config.testTimeout,
        maxRetries: this.config.maxRetries,
      },
      'Test runner engine initialized'
    );
  }

  /**
   * Execute a test suite on a specific device
   * Main entry point for test execution
   */
  async executeTestSuite(
    testRunId: string,
    deviceId: string,
    options?: TestExecutionOptions
  ): Promise<TestRunnerStats> {
    const prisma = getPrismaClient();
    const startTime = Date.now();

    logger.info(
      {
        testRunId,
        deviceId,
        options,
      },
      'Starting test suite execution'
    );

    // Initialize stats for this run
    this.runStats.set(testRunId, {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      timeoutTests: 0,
      totalRetries: 0,
      avgDuration: 0,
      totalDuration: 0,
    });

    // Initialize active executions tracking
    this.activeExecutions.set(testRunId, new Set());

    try {
      // Get test run details
      const testRun = await prisma.testRun.findUnique({
        where: { id: testRunId },
        include: {
          testSuite: {
            include: {
              testCases: true,
            },
          },
          device: true,
        },
      });

      if (!testRun) {
        throw new Error(`Test run not found: ${testRunId}`);
      }

      const testCases = testRun.testSuite.testCases;
      const totalTests = testCases.length;

      this.updateStats(testRunId, { totalTests });

      logger.info(
        {
          testRunId,
          totalTests,
          suiteName: testRun.testSuite.name,
        },
        'Test cases loaded for execution'
      );

      // Update test run status to RUNNING
      await prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // Start performance monitoring
      const perfMonitor = createPerformanceMonitor(
        testRunId,
        testRun.testSuiteId,
        {
          enabled: true,
          samplingInterval: 2000, // Sample every 2 seconds
          collectCpu: true,
          collectMemory: true,
          collectBattery: false,
          collectNetwork: true,
          persistMetrics: true,
        },
        deviceId
      );
      this.performanceMonitors.set(testRunId, perfMonitor);
      await perfMonitor.start();

      // Execute test cases with controlled parallelism
      await this.executeTestCasesParallel(
        testRunId,
        deviceId,
        testCases as TestCase[],
        options
      );

      // Stop performance monitoring and get summary
      const perfSummary = await perfMonitor.stop();
      await perfMonitor.persistMetrics(perfSummary ?? undefined);

      // Log performance summary
      if (perfSummary) {
        logger.info(
          {
            testRunId,
            perfSummary: {
              avgCpuUsage: perfSummary.avgCpuUsage.toFixed(2),
              peakCpuUsage: perfSummary.peakCpuUsage.toFixed(2),
              avgMemoryUsage: perfSummary.avgMemoryUsage.toFixed(2),
              peakMemoryUsage: perfSummary.peakMemoryUsage.toFixed(2),
              warningCount: perfSummary.warningCount,
              criticalCount: perfSummary.criticalCount,
              regressions: perfSummary.regressions.length,
            },
          },
          'Performance monitoring summary'
        );
      }

      // Calculate final stats
      const stats = this.runStats.get(testRunId) as TestRunnerStats;
      const totalDuration = Date.now() - startTime;

      stats.totalDuration = totalDuration;
      stats.avgDuration = totalTests > 0 ? totalDuration / totalTests : 0;

      const sessionStats = this.sessionManager.getSessionStats();
      stats.activeSessions = sessionStats.active;
      stats.availableSessions = sessionStats.available;

      // Update test run in database
      await prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: stats.failedTests === 0 ? 'COMPLETED' : 'FAILED',
          completedAt: new Date(),
          totalDuration,
          passedCount: stats.passedTests,
          failedCount: stats.failedTests,
          skippedCount: stats.skippedTests,
        },
      });

      logger.info(
        {
          testRunId,
          stats,
        },
        'Test suite execution completed'
      );

      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          testRunId,
          error: errorMessage,
        },
        'Test suite execution failed'
      );

      // Update test run as failed
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

      throw error;
    } finally {
      // Stop performance monitoring if still running
      const monitor = this.performanceMonitors.get(testRunId);
      if (monitor?.isRunning()) {
        await monitor.stop().catch((err) => {
          logger.error({ error: err, testRunId }, 'Failed to stop performance monitor');
        });
      }
      this.performanceMonitors.delete(testRunId);

      // Cleanup tracking
      this.activeExecutions.delete(testRunId);
      this.runStats.delete(testRunId);

      // Release device session
      await this.sessionManager.releaseSession(deviceId).catch((err) => {
        logger.error({ error: err, deviceId }, 'Failed to release device session');
      });
    }
  }

  /**
   * Execute test cases with parallel execution support
   */
  private async executeTestCasesParallel(
    testRunId: string,
    deviceId: string,
    testCases: TestCase[],
    options?: TestExecutionOptions
  ): Promise<void> {
    const concurrency = options?.isolationStrategy === TestIsolationStrategy.FULL_ISOLATION
      ? 1
      : this.config.maxParallel;

    logger.info(
      {
        testRunId,
        deviceId,
        concurrency,
        totalTests: testCases.length,
      },
      'Starting parallel test execution'
    );

    // Process tests in batches with controlled concurrency
    for (let i = 0; i < testCases.length; i += concurrency) {
      const batch = testCases.slice(i, i + concurrency);

      logger.debug(
        {
          testRunId,
          batchStart: i,
          batchSize: batch.length,
        },
        'Executing test batch'
      );

      // Execute batch in parallel
      await Promise.allSettled(
        batch.map((testCase) => this.executeTestCaseWithRetry(testRunId, deviceId, testCase, options))
      );
    }
  }

  /**
   * Execute a single test case with retry logic
   */
  private async executeTestCaseWithRetry(
    testRunId: string,
    deviceId: string,
    testCase: TestCase,
    options?: TestExecutionOptions,
    retryAttempt: number = 0
  ): Promise<TestExecutionResult> {
    const maxRetries = options?.timeout ? 0 : this.config.maxRetries;
    const timeout = options?.timeout ?? testCase.timeout ?? this.config.testTimeout;

    try {
      return await this.executeWithTimeout(
        this.executeTestCase(testRunId, deviceId, testCase, options, retryAttempt),
        timeout,
        testCase
      );
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const isTimeout = errorObj.message.includes('timeout');

      // Use smart retry if enabled and this is an appropriate failure
      if (this.smartRetry && retryAttempt < maxRetries && !isTimeout) {
        const analysis = await this.smartRetry.analyzeFailure(testCase.id, errorObj);

        if (analysis.shouldRetry && analysis.retryPlan) {
          this.updateStats(testRunId, { totalRetries: (this.runStats.get(testRunId)?.totalRetries ?? 0) + 1 });

          logger.info(
            {
              testRunId,
              testCaseId: testCase.id,
              testCaseName: testCase.name,
              failureCategory: analysis.failurePattern.category,
              retryAttempts: analysis.retryPlan.attempts.length,
            },
            'Executing smart retry plan'
          );

          this.emitEvent({
            type: EventType.TEST_RETRY,
            testRunId,
            testCaseId: testCase.id,
            deviceId,
            timestamp: new Date(),
            data: {
              retryAttempt: retryAttempt + 1,
              maxRetries,
              error: errorObj.message,
              smartRetry: true,
              failureCategory: analysis.failurePattern.category,
              retryPlan: analysis.retryPlan,
            },
          });

          // Execute the smart retry plan
          const retryResult = await this.smartRetry.executeRetryPlan(
            testCase.id,
            testRunId,
            analysis.retryPlan,
            async (attempt) => {
              // Use custom timeout if specified in retry plan
              const attemptTimeout = attempt.timeoutMs ?? timeout;
              return await this.executeWithTimeout(
                this.executeTestCase(testRunId, deviceId, testCase, options, retryAttempt + attempt.attemptNumber + 1),
                attemptTimeout,
                testCase
              );
            }
          );

          if (retryResult.success) {
            return await this.executeTestCase(testRunId, deviceId, testCase, options, retryAttempt + retryResult.finalAttempt + 1);
          }
        }
      }

      // Fall back to standard retry logic
      if (retryAttempt < maxRetries && !isTimeout) {
        this.updateStats(testRunId, { totalRetries: (this.runStats.get(testRunId)?.totalRetries ?? 0) + 1 });

        this.emitEvent({
          type: EventType.TEST_RETRY,
          testRunId,
          testCaseId: testCase.id,
          deviceId,
          timestamp: new Date(),
          data: {
            retryAttempt: retryAttempt + 1,
            maxRetries,
            error: errorObj.message,
            smartRetry: false,
          },
        });

        logger.info(
          {
            testRunId,
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            retryAttempt: retryAttempt + 1,
            maxRetries,
          },
          'Retrying test case (standard retry)'
        );

        // Wait before retry
        await this.delay(this.config.retryDelay);

        return this.executeTestCaseWithRetry(testRunId, deviceId, testCase, options, retryAttempt + 1);
      }

      // Final attempt failed, record failure
      throw error;
    }
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(
    testRunId: string,
    deviceId: string,
    testCase: TestCase,
    _options?: TestExecutionOptions,
    retryAttempt: number = 0
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();
    const resultId = randomUUID();

    // Track active execution
    this.activeExecutions.get(testRunId)?.add(testCase.id);

    logger.info(
      {
        testRunId,
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        retryAttempt,
      },
      'Executing test case'
    );

    this.emitEvent({
      type: EventType.TEST_STARTED,
      testRunId,
      testCaseId: testCase.id,
      deviceId,
      timestamp: new Date(),
      data: { retryAttempt },
    });

    const prisma = getPrismaClient();

    // Create initial test result record
    const testResult = await prisma.testResult.create({
      data: {
        testRunId,
        testCaseId: testCase.id,
        status: 'FAILED', // Default to failed, will update on success
        duration: 0,
      },
    });

    const artifacts: TestArtifact[] = [];

    try {
      // Acquire device session
      const session = await this.sessionManager.acquireSession(deviceId, testRunId);

      // Create execution context
      const context: TestExecutionContext = {
        testRunId,
        testCase,
        device: {
          deviceId,
          platform: session.metadata.platform as 'ios' | 'android',
          isEmulator: session.metadata.isEmulator as boolean,
          name: session.metadata.deviceName as string,
          osVersion: session.metadata.osVersion as string,
        },
        sessionId: session.sessionId,
        timeout: testCase.timeout ?? this.config.testTimeout,
        retryAttempt,
        maxRetries: this.config.maxRetries,
      };

      // Capture logs if enabled
      if (this.config.captureLogs) {
        const logArtifact = await this.captureArtifact(context, {
          type: 'LOG',
          path: '',
          timestamp: new Date(),
        });
        artifacts.push(logArtifact);
      }

      // Execute the actual test logic
      // In a real implementation, this would call Appium/MCP services
      const executionResult = await this.executeTestLogic(context);

      // Calculate duration
      const duration = Date.now() - startTime;

      // Determine test status
      const status = executionResult.passed ? 'PASSED' : 'FAILED';

      // Update test result in database
      await prisma.testResult.update({
        where: { id: testResult.id },
        data: {
          status,
          duration,
          errorMessage: executionResult.errorMessage,
          stackTrace: executionResult.stackTrace,
          metadata: executionResult.metadata
            ? (executionResult.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      // Capture screenshot on failure if enabled
      if (status === 'FAILED' && this.config.captureScreenshotOnFailure) {
        const screenshotArtifact = await this.captureArtifact(context, {
          type: 'SCREENSHOT',
          path: '',
          timestamp: new Date(),
        });
        artifacts.push(screenshotArtifact);
      }

      // Save artifacts to database
      await this.saveArtifacts(testRunId, artifacts);

      // Update stats
      if (status === 'PASSED') {
        this.updateStats(testRunId, { passedTests: (this.runStats.get(testRunId)?.passedTests ?? 0) + 1 });
      } else {
        this.updateStats(testRunId, { failedTests: (this.runStats.get(testRunId)?.failedTests ?? 0) + 1 });
      }

      // Release session
      await this.sessionManager.releaseSession(deviceId);

      const result: TestExecutionResult = {
        id: resultId,
        testCaseId: testCase.id,
        testRunId,
        status,
        errorMessage: executionResult.errorMessage,
        stackTrace: executionResult.stackTrace,
        duration,
        timestamp: new Date(),
        artifacts,
      };

      logger.info(
        {
          testRunId,
          testCaseId: testCase.id,
          status,
          duration,
        },
        'Test case execution completed'
      );

      this.emitEvent({
        type: status === 'PASSED' ? EventType.TEST_COMPLETED : EventType.TEST_FAILED,
        testRunId,
        testCaseId: testCase.id,
        deviceId,
        timestamp: new Date(),
        data: { status, duration, artifacts: artifacts.length },
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stackTrace = error instanceof Error ? error.stack : undefined;
      const duration = Date.now() - startTime;

      // Update test result as failed
      await prisma.testResult.update({
        where: { id: testResult.id },
        data: {
          status: 'FAILED',
          duration,
          errorMessage,
          stackTrace,
        },
      });

      // Capture screenshot on failure if enabled
      try {
        const session = this.sessionManager.getSessionByDevice(deviceId);
        if (session && this.config.captureScreenshotOnFailure) {
          const context: TestExecutionContext = {
            testRunId,
            testCase,
            device: {
              deviceId,
              platform: session.metadata.platform as 'ios' | 'android',
              isEmulator: session.metadata.isEmulator as boolean,
              name: session.metadata.deviceName as string,
              osVersion: session.metadata.osVersion as string,
            },
            sessionId: session.sessionId,
            timeout: this.config.testTimeout,
            retryAttempt,
            maxRetries: this.config.maxRetries,
          };

          const screenshotArtifact = await this.captureArtifact(context, {
            type: 'SCREENSHOT',
            path: '',
            timestamp: new Date(),
          });
          artifacts.push(screenshotArtifact);
          await this.saveArtifacts(testRunId, artifacts);
        }
      } catch (artifactError) {
        logger.error({ error: artifactError }, 'Failed to capture screenshot on failure');
      }

      // Update stats
      this.updateStats(testRunId, { failedTests: (this.runStats.get(testRunId)?.failedTests ?? 0) + 1 });

      // Release session
      await this.sessionManager.releaseSession(deviceId, error instanceof Error ? error : undefined);

      logger.error(
        {
          testRunId,
          testCaseId: testCase.id,
          error: errorMessage,
          duration,
        },
        'Test case execution failed'
      );

      this.emitEvent({
        type: EventType.TEST_FAILED,
        testRunId,
        testCaseId: testCase.id,
        deviceId,
        timestamp: new Date(),
        data: { error: errorMessage, duration },
      });

      throw error;
    } finally {
      // Remove from active executions
      this.activeExecutions.get(testRunId)?.delete(testCase.id);
    }
  }

  /**
   * Execute the actual test logic
   * This is a placeholder that would integrate with Appium/MCP services
   */
  private async executeTestLogic(
    context: TestExecutionContext
  ): Promise<{ passed: boolean; errorMessage?: string; stackTrace?: string; metadata?: Record<string, unknown> }> {
    // Placeholder implementation
    // In production, this would:
    // 1. Connect to the device via Appium
    // 2. Parse the test case description and expected outcome
    // 3. Use LLM/MCP to generate test steps
    // 4. Execute the steps on the device
    // 5. Capture screenshots, videos, logs
    // 6. Verify expected outcomes
    // 7. Return results

    logger.debug(
      {
        testRunId: context.testRunId,
        testCaseId: context.testCase.id,
        devicePlatform: context.device.platform,
      },
      'Executing test logic (placeholder)'
    );

    // Simulate test execution
    await this.delay(100 + Math.random() * 200);

    // For demonstration, randomly pass or fail based on test name
    // In production, this would be based on actual test results
    const isFailingTest = context.testCase.name.toLowerCase().includes('fail') ||
                         context.testCase.name.toLowerCase().includes('error');

    if (isFailingTest) {
      return {
        passed: false,
        errorMessage: `Test assertion failed: ${context.testCase.expectedOutcome}`,
        stackTrace: `Error: Test assertion failed\n    at TestRunner.executeTestLogic (${__filename}:42:15)\n    at async executeTestCase (${__filename}:120:10)`,
        metadata: {
          executionType: 'placeholder',
        },
      };
    }

    return {
      passed: true,
      metadata: {
        executionType: 'placeholder',
      },
    };
  }

  /**
   * Capture an artifact (screenshot, video, log, etc.)
   */
  private async captureArtifact(
    context: TestExecutionContext,
    artifact: TestArtifact
  ): Promise<TestArtifact> {
    // Ensure artifact directory exists
    const artifactDir = join(
      this.config.artifactBaseDir,
      context.testRunId,
      context.testCase.id
    );

    if (!existsSync(artifactDir)) {
      await mkdir(artifactDir, { recursive: true });
    }

    const timestamp = Date.now();
    let path: string;
    let mimeType: string | undefined;

    switch (artifact.type) {
      case 'SCREENSHOT':
        path = join(artifactDir, `screenshot-${timestamp}.png`);
        mimeType = 'image/png';
        // In production, capture actual screenshot from device
        // For placeholder, create a dummy file
        await writeFile(path, Buffer.from('placeholder-screenshot'));
        break;

      case 'VIDEO':
        path = join(artifactDir, `video-${timestamp}.mp4`);
        mimeType = 'video/mp4';
        await writeFile(path, Buffer.from('placeholder-video'));
        break;

      case 'LOG':
        path = join(artifactDir, `log-${timestamp}.log`);
        mimeType = 'text/plain';
        await writeFile(path, JSON.stringify({
          testRunId: context.testRunId,
          testCaseId: context.testCase.id,
          timestamp: new Date().toISOString(),
          messages: [
            '[INFO] Test execution started',
            '[INFO] Device: ' + context.device.name,
            '[INFO] Platform: ' + context.device.platform,
            '[INFO] Test execution completed',
          ],
        }, null, 2));
        break;

      default:
        path = join(artifactDir, `artifact-${timestamp}.bin`);
        await writeFile(path, Buffer.from('placeholder-artifact'));
    }

    return {
      type: artifact.type,
      path,
      mimeType,
      timestamp: new Date(),
      size: Buffer.from('placeholder').length,
      metadata: artifact.metadata,
    };
  }

  /**
   * Save artifacts to database
   */
  private async saveArtifacts(testRunId: string, artifacts: TestArtifact[]): Promise<void> {
    if (artifacts.length === 0) {
      return;
    }

    const prisma = getPrismaClient();

    for (const artifact of artifacts) {
      try {
        await prisma.artifact.create({
          data: {
            testRunId,
            type: artifact.type as any,
            path: artifact.path,
            size: artifact.size ? BigInt(artifact.size) : undefined,
            mimeType: artifact.mimeType,
            metadata: artifact.metadata as any,
          },
        });
      } catch (error) {
        logger.error(
          {
            testRunId,
            artifactType: artifact.type,
            artifactPath: artifact.path,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to save artifact to database'
        );
      }
    }
  }

  /**
   * Execute a function with a timeout
   */
  private async executeWithTimeout<T>(
    fn: Promise<T>,
    timeout: number,
    testCase: TestCase
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Test timeout after ${timeout}ms: ${testCase.name}`));
      }, timeout);
    });

    try {
      return await Promise.race([fn, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Update statistics for a test run
   */
  private updateStats(testRunId: string, updates: Partial<TestRunnerStats>): void {
    const current = this.runStats.get(testRunId) || {};
    this.runStats.set(testRunId, { ...current, ...updates });
  }

  /**
   * Get statistics for a test run
   */
  getStats(testRunId: string): TestRunnerStats | undefined {
    return this.runStats.get(testRunId) as TestRunnerStats | undefined;
  }

  /**
   * Get all active test runs
   */
  getActiveTestRuns(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Check if a test run is currently active
   */
  isTestRunActive(testRunId: string): boolean {
    return this.activeExecutions.has(testRunId);
  }

  /**
   * Register an event handler
   */
  on(eventHandler: TestRunnerEventHandler): void {
    this.eventHandlers.add(eventHandler);
  }

  /**
   * Unregister an event handler
   */
  off(eventHandler: TestRunnerEventHandler): void {
    this.eventHandlers.delete(eventHandler);
  }

  /**
   * Emit an event to all registered handlers
   */
  private emitEvent(event: TestRunnerEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void Promise.resolve(handler(event));
      } catch (error) {
        logger.error({ error }, 'Error in event handler');
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the session manager
   */
  getSessionManager(): DeviceSessionManager {
    return this.sessionManager;
  }

  /**
   * Cancel an active test run
   */
  async cancelTestRun(testRunId: string): Promise<void> {
    if (!this.activeExecutions.has(testRunId)) {
      logger.warn({ testRunId }, 'Test run not active, cannot cancel');
      return;
    }

    logger.info({ testRunId }, 'Cancelling test run');

    // Clear active executions
    this.activeExecutions.delete(testRunId);

    // Update test run status in database
    const prisma = getPrismaClient();
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    }).catch((err) => {
      logger.error({ error: err, testRunId }, 'Failed to update test run status to cancelled');
    });
  }

  /**
   * Get test runner configuration
   */
  getConfig(): TestRunnerConfig {
    return { ...this.config };
  }

  /**
   * Update test runner configuration
   */
  updateConfig(updates: Partial<TestRunnerConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, 'Test runner configuration updated');
  }

  /**
   * Get performance monitor for a test run
   */
  getPerformanceMonitor(testRunId: string): PerformanceMonitor | undefined {
    return this.performanceMonitors.get(testRunId);
  }
}

/**
 * Global test runner instance
 */
let globalTestRunner: TestRunnerEngine | null = null;

/**
 * Get the global test runner instance
 */
export function getGlobalTestRunner(config?: Partial<TestRunnerConfig>): TestRunnerEngine {
  if (!globalTestRunner) {
    globalTestRunner = new TestRunnerEngine(config);
  }
  return globalTestRunner;
}

/**
 * Reset the global test runner (useful for testing)
 */
export async function resetGlobalTestRunner(): Promise<void> {
  if (globalTestRunner) {
    await globalTestRunner.getSessionManager().destroy();
    globalTestRunner = null;
  }
}
