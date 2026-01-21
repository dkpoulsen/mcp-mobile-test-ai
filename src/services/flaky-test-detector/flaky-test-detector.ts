/**
 * Flaky Test Detector Service
 * Detects tests with inconsistent pass/fail patterns and manages quarantine
 */

import type {
  FlakyTestDetectorConfig,
  FlakinessAnalysis,
  FailurePattern,
  QuarantineRecommendation,
  PromotionEligibility,
  TestExecutionResult,
  BatchDetectionInput,
  BatchDetectionResult,
  FlakyTestStatistics,
  FlakyTestEvent,
} from './types.js';
import type { PrismaClient } from '@prisma/client';
import type { TestResult as DbTestResult } from '@prisma/client';
import { createModuleLogger } from '../../utils/logger.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<FlakyTestDetectorConfig> = {
  minRunsForAnalysis: 5,
  flakinessThreshold: 0.4,
  patternAnalysisWindow: 10,
  quarantineFailureThreshold: 3,
  promotionPassThreshold: 5,
  historyDays: 30,
  autoQuarantine: false,
  autoPromote: true,
  defaultTeam: undefined,
};

/**
 * Flaky test detector service
 */
export class FlakyTestDetector {
  private readonly logger: Logger;
  private readonly config: Required<FlakyTestDetectorConfig>;

  constructor(
    private prisma: PrismaClient,
    config: FlakyTestDetectorConfig = {}
  ) {
    this.logger = createModuleLogger('services:flaky-test-detector');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger.info('Flaky test detector initialized', {
      flakinessThreshold: this.config.flakinessThreshold,
      autoQuarantine: this.config.autoQuarantine,
      autoPromote: this.config.autoPromote,
    });
  }

  /**
   * Analyze a single test case for flakiness
   */
  async analyzeTest(testCaseId: string): Promise<FlakinessAnalysis | null> {
    this.logger.debug(`Analyzing test case for flakiness: ${testCaseId}`);

    // Fetch test results
    const results = await this.getTestResults(testCaseId);

    if (results.length < this.config.minRunsForAnalysis) {
      this.logger.debug(`Not enough runs for analysis: ${results.length} < ${this.config.minRunsForAnalysis}`);
      return null;
    }

    // Perform analysis
    const analysis = this.performFlakinessAnalysis(results);

    this.logger.info(`Flakiness analysis complete for test: ${testCaseId}`, {
      isFlaky: analysis.isFlaky,
      flakinessScore: analysis.flakinessScore,
      passRate: analysis.passRate,
    });

    return analysis;
  }

  /**
   * Analyze multiple test cases in batch
   */
  async analyzeBatch(input: BatchDetectionInput): Promise<BatchDetectionResult> {
    this.logger.info(`Starting batch flakiness analysis: ${input.testCaseIds.length} tests`);

    const results = new Map<string, FlakinessAnalysis>();
    const quarantineRecommendations: QuarantineRecommendation[] = [];
    const promotionEligible: string[] = [];

    for (const testCaseId of input.testCaseIds) {
      const analysis = await this.analyzeTest(testCaseId);
      if (analysis) {
        results.set(testCaseId, analysis);

        // Check for quarantine recommendation
        const quarantine = this.shouldQuarantine(analysis);
        if (quarantine.shouldQuarantine) {
          quarantineRecommendations.push({
            ...quarantine,
            testCaseId,
          } as QuarantineRecommendation & { testCaseId: string });
        }

        // Check for promotion eligibility
        const existingQuarantine = await this.prisma.testQuarantine.findUnique({
          where: { testCaseId },
        });

        if (existingQuarantine && existingQuarantine.status === 'ACTIVE') {
          const eligibility = await this.checkPromotionEligibility(testCaseId);
          if (eligibility.isEligible) {
            promotionEligible.push(testCaseId);
          }
        }
      }
    }

    const summary = {
      totalAnalyzed: results.size,
      flakyDetected: Array.from(results.values()).filter((r) => r.isFlaky).length,
      quarantineRecommended: quarantineRecommendations.length,
      promotionEligible: promotionEligible.length,
    };

    this.logger.info('Batch flakiness analysis complete', summary);

    return { results, quarantineRecommendations, promotionEligible, summary };
  }

  /**
   * Detect and create/update flaky test records
   */
  async detectFlakyTests(testSuiteId?: string): Promise<FlakyTestEvent[]> {
    this.logger.info(`Detecting flaky tests${testSuiteId ? ` for suite: ${testSuiteId}` : ''}`);

    const events: FlakyTestEvent[] = [];

    // Get test cases to analyze
    const where = testSuiteId ? { testSuiteId } : {};
    const testCases = await this.prisma.testCase.findMany({
      where,
      include: { testSuite: true },
    });

    for (const testCase of testCases) {
      const analysis = await this.analyzeTest(testCase.id);

      if (!analysis || !analysis.isFlaky) {
        // If test was previously flaky but is now stable, handle it
        const existingFlaky = await this.prisma.flakyTest.findUnique({
          where: { testCaseId: testCase.id },
        });

        if (existingFlaky && analysis && analysis.flakinessScore < this.config.flakinessThreshold) {
          // Test has stabilized
          await this.handleStabilizedTest(testCase.id, existingFlaky);
          events.push({
            type: 'promoted',
            testCaseId: testCase.id,
            testSuiteId: testCase.testSuiteId,
            testCaseName: testCase.name,
            testSuiteName: testCase.testSuite.name,
            analysis,
            timestamp: new Date(),
          });
        }
        continue;
      }

      // Create or update flaky test record
      const existingFlaky = await this.prisma.flakyTest.findUnique({
        where: { testCaseId: testCase.id },
      });

      const recentPattern = this.getRecentPattern(analysis.recentPattern);
      const failurePattern = this.encodeFailurePatterns(analysis.failurePatterns);

      if (existingFlaky) {
        // Update existing record
        await this.prisma.flakyTest.update({
          where: { id: existingFlaky.id },
          data: {
            flakinessScore: analysis.flakinessScore,
            totalRuns: analysis.totalRuns,
            passCount: analysis.passCount,
            failCount: analysis.failCount,
            recentPattern,
            failurePattern,
            suggestedFixes: analysis.suggestedFixes,
            lastAnalyzedAt: new Date(),
            status: this.determineFlakyStatus(analysis, existingFlaky),
          },
        });

        // Check if should quarantine
        if (this.config.autoQuarantine && !existingFlaky.quarantineId && analysis.shouldQuarantine) {
          const quarantine = await this.quarantineTest(testCase.id, analysis);
          if (quarantine) {
            events.push({
              type: 'quarantined',
              testCaseId: testCase.id,
              testSuiteId: testCase.testSuiteId,
              testCaseName: testCase.name,
              testSuiteName: testCase.testSuite.name,
              analysis,
              assignedTeam: quarantine.assignedTeam,
              timestamp: new Date(),
            });
          }
        } else {
          events.push({
            type: 'detected',
            testCaseId: testCase.id,
            testSuiteId: testCase.testSuiteId,
            testCaseName: testCase.name,
            testSuiteName: testCase.testSuite.name,
            analysis,
            timestamp: new Date(),
          });
        }

        // Create history entry
        await this.prisma.flakyTestHistory.create({
          data: {
            flakyTestId: existingFlaky.id,
            testCaseId: testCase.id,
            flakinessScore: analysis.flakinessScore,
            totalRuns: analysis.totalRuns,
            passCount: analysis.passCount,
            failCount: analysis.failCount,
            recentPattern,
            status: existingFlaky.status,
            analysisType: 'reanalyzed',
          },
        });
      } else {
        // Create new flaky test record
        const newFlaky = await this.prisma.flakyTest.create({
          data: {
            testCaseId: testCase.id,
            testSuiteId: testCase.testSuiteId,
            flakinessScore: analysis.flakinessScore,
            totalRuns: analysis.totalRuns,
            passCount: analysis.passCount,
            failCount: analysis.failCount,
            recentPattern,
            failurePattern,
            suggestedFixes: analysis.suggestedFixes,
            failureThreshold: this.config.quarantineFailureThreshold,
            passThreshold: this.config.promotionPassThreshold,
            lastAnalyzedAt: new Date(),
            status: 'DETECTED',
            assignedTeam: this.config.defaultTeam,
          },
        });

        events.push({
          type: 'detected',
          testCaseId: testCase.id,
          testSuiteId: testCase.testSuiteId,
          testCaseName: testCase.name,
          testSuiteName: testCase.testSuite.name,
          analysis,
          assignedTeam: this.config.defaultTeam,
          timestamp: new Date(),
        });

        // Auto-quarantine if enabled
        if (this.config.autoQuarantine && analysis.shouldQuarantine) {
          await this.quarantineTest(testCase.id, analysis);
        }
      }
    }

    return events;
  }

  /**
   * Quarantine a flaky test
   */
  async quarantineTest(testCaseId: string, analysis: FlakinessAnalysis): Promise<FlakyTestEvent | null> {
    this.logger.info(`Quarantining test: ${testCaseId}`);

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { testSuite: true },
    });

    if (!testCase) {
      this.logger.warn(`Test case not found for quarantine: ${testCaseId}`);
      return null;
    }

    // Check if already quarantined
    const existingQuarantine = await this.prisma.testQuarantine.findUnique({
      where: { testCaseId },
    });

    if (existingQuarantine) {
      this.logger.debug(`Test already quarantined: ${testCaseId}`);
      return null;
    }

    // Create quarantine record
    const quarantine = await this.prisma.testQuarantine.create({
      data: {
        testCaseId,
        testSuiteId: testCase.testSuiteId,
        status: 'ACTIVE',
        reason: analysis.reason,
        category: 'FLAKY',
        detectionMethod: 'automatic',
        failurePattern: this.encodeFailurePatterns(analysis.failurePatterns),
        suggestedFixes: analysis.suggestedFixes,
        requiredPasses: this.config.promotionPassThreshold,
        assignedTeam: this.config.defaultTeam,
      },
    });

    // Update flaky test record
    await this.prisma.flakyTest.update({
      where: { testCaseId },
      data: {
        status: 'QUARANTINED',
        quarantineId: quarantine.id,
      },
    });

    return {
      type: 'quarantined',
      testCaseId,
      testSuiteId: testCase.testSuiteId,
      testCaseName: testCase.name,
      testSuiteName: testCase.testSuite.name,
      analysis,
      assignedTeam: this.config.defaultTeam,
      timestamp: new Date(),
    };
  }

  /**
   * Check if a quarantined test is eligible for promotion
   */
  async checkPromotionEligibility(testCaseId: string): Promise<PromotionEligibility> {
    const quarantine = await this.prisma.testQuarantine.findUnique({
      where: { testCaseId },
    });

    if (!quarantine) {
      return {
        isEligible: false,
        consecutivePasses: 0,
        requiredPasses: this.config.promotionPassThreshold,
        reason: 'Test is not quarantined',
      };
    }

    if (quarantine.status !== 'ACTIVE') {
      return {
        isEligible: false,
        consecutivePasses: quarantine.consecutivePasses,
        requiredPasses: quarantine.requiredPasses,
        reason: `Quarantine status is ${quarantine.status}`,
      };
    }

    // Get recent test results
    const recentResults = await this.prisma.testResult.findMany({
      where: {
        testCaseId,
        createdAt: { gte: quarantine.updatedAt },
      },
      orderBy: { createdAt: 'desc' },
      take: quarantine.requiredPasses,
    });

    // Count consecutive passes from most recent
    let consecutivePasses = 0;
    for (const result of recentResults) {
      if (result.status === 'PASSED') {
        consecutivePasses++;
      } else {
        break;
      }
    }

    const isEligible = consecutivePasses >= quarantine.requiredPasses;

    return {
      isEligible,
      consecutivePasses,
      requiredPasses: quarantine.requiredPasses,
      reason: isEligible
        ? `Test has ${consecutivePasses} consecutive passes`
        : `Need ${quarantine.requiredPasses - consecutivePasses} more consecutive passes`,
    };
  }

  /**
   * Promote a stabilized test from quarantine
   */
  async promoteTest(testCaseId: string): Promise<boolean> {
    this.logger.info(`Promoting test from quarantine: ${testCaseId}`);

    const quarantine = await this.prisma.testQuarantine.findUnique({
      where: { testCaseId },
    });

    if (!quarantine) {
      this.logger.warn(`No quarantine found for test: ${testCaseId}`);
      return false;
    }

    // Update quarantine status
    await this.prisma.testQuarantine.update({
      where: { id: quarantine.id },
      data: {
        status: 'RESOLVED',
        reviewedAt: new Date(),
      },
    });

    // Update flaky test status
    const flakyTest = await this.prisma.flakyTest.findUnique({
      where: { testCaseId },
    });

    if (flakyTest) {
      await this.prisma.flakyTest.update({
        where: { id: flakyTest.id },
        data: {
          status: 'STABLE',
          quarantineId: null,
        },
      });

      // Create history entry
      await this.prisma.flakyTestHistory.create({
        data: {
          flakyTestId: flakyTest.id,
          testCaseId,
          flakinessScore: flakyTest.flakinessScore,
          totalRuns: flakyTest.totalRuns,
          passCount: flakyTest.passCount,
          failCount: flakyTest.failCount,
          recentPattern: flakyTest.recentPattern,
          status: 'STABLE',
          analysisType: 'promoted',
        },
      });
    }

    this.logger.info(`Successfully promoted test: ${testCaseId}`);
    return true;
  }

  /**
   * Get flaky test statistics
   */
  async getStatistics(testSuiteId?: string): Promise<FlakyTestStatistics> {
    const where = testSuiteId ? { testSuiteId } : {};

    const [totalFlaky, totalQuarantined, totalStabilizing, flakyTests] = await Promise.all([
      this.prisma.flakyTest.count({ where: { ...where, status: { in: ['DETECTED', 'MONITORING', 'QUARANTINED', 'STABILIZING'] } } }),
      this.prisma.testQuarantine.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.flakyTest.count({ where: { ...where, status: 'STABILIZING' } }),
      this.prisma.flakyTest.findMany({
        where,
        include: {
          testCase: { include: { testSuite: true } },
        },
        orderBy: { flakinessScore: 'desc' },
        take: 10,
      }),
    ]);

    const byScoreRange = {
      low: flakyTests.filter((t) => t.flakinessScore < 0.3).length,
      medium: flakyTests.filter((t) => t.flakinessScore >= 0.3 && t.flakinessScore < 0.6).length,
      high: flakyTests.filter((t) => t.flakinessScore >= 0.6 && t.flakinessScore < 0.8).length,
      critical: flakyTests.filter((t) => t.flakinessScore >= 0.8).length,
    };

    const mostFlaky = flakyTests.slice(0, 10).map((t) => ({
      testCaseId: t.testCaseId,
      testSuiteName: t.testSuite.name,
      testCaseName: t.testCase.name,
      flakinessScore: t.flakinessScore,
    }));

    return {
      totalFlaky,
      totalQuarantined,
      totalStabilizing,
      byScoreRange,
      mostFlaky,
    };
  }

  /**
   * Get test results for a test case
   */
  private async getTestResults(testCaseId: string): Promise<DbTestResult[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - this.config.historyDays);

    return this.prisma.testResult.findMany({
      where: {
        testCaseId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Perform flakiness analysis on test results
   */
  private performFlakinessAnalysis(results: DbTestResult[]): FlakinessAnalysis {
    const totalRuns = results.length;
    const passCount = results.filter((r) => r.status === 'PASSED').length;
    const failCount = results.filter((r) => r.status === 'FAILED' || r.status === 'TIMEOUT').length;
    const passRate = (passCount / totalRuns) * 100;

    // Get recent pattern
    const recentResults = results.slice(-this.config.patternAnalysisWindow);
    const recentPattern = recentResults.map((r) => (r.status === 'PASSED' ? 'P' : 'F')).join('');

    // Calculate flakiness score using multiple factors
    const flakinessScore = this.calculateFlakinessScore(results, recentPattern, passRate);

    // Detect failure patterns
    const failurePatterns = this.detectFailurePatterns(results, recentPattern, passRate);

    // Generate suggested fixes based on patterns
    const suggestedFixes = this.generateSuggestedFixes(failurePatterns);

    // Determine if should quarantine
    const shouldQuarantine = flakinessScore >= this.config.flakinessThreshold &&
      failCount >= this.config.quarantineFailureThreshold;

    // Determine confidence
    const confidence = this.determineConfidence(flakinessScore, totalRuns);

    // Generate reason
    const reason = this.generateReason(flakinessScore, passRate, failurePatterns);

    return {
      isFlaky: flakinessScore >= this.config.flakinessThreshold,
      flakinessScore,
      confidence,
      totalRuns,
      passCount,
      failCount,
      passRate,
      recentPattern,
      failurePatterns,
      suggestedFixes,
      shouldQuarantine,
      reason,
    };
  }

  /**
   * Calculate flakiness score (0-1)
   */
  private calculateFlakinessScore(results: DbTestResult[], recentPattern: string, passRate: number): number {
    let score = 0;

    // Factor 1: Pass rate deviation from 0% or 100%
    // Tests that always pass (100%) or always fail (0%) are NOT flaky
    // Tests around 50% pass rate are MOST flaky
    const passRateFactor = 1 - Math.abs(passRate - 50) / 50;
    score += passRateFactor * 0.4;

    // Factor 2: Pattern inconsistency
    // Count transitions between P and F
    let transitions = 0;
    for (let i = 1; i < recentPattern.length; i++) {
      if (recentPattern[i] !== recentPattern[i - 1]) transitions++;
    }
    const maxTransitions = recentPattern.length - 1;
    const transitionFactor = maxTransitions > 0 ? transitions / maxTransitions : 0;
    score += transitionFactor * 0.3;

    // Factor 3: Alternating pattern bonus (P-F-P-F is very flaky)
    const alternationCount = (recentPattern.match(/PF|FP/g) || []).length;
    const alternationFactor = Math.min(1, alternationCount / (recentPattern.length / 2));
    score += alternationFactor * 0.2;

    // Factor 4: Variance in pass rate over time (split into halves)
    const midPoint = Math.floor(results.length / 2);
    const firstHalfPassRate = results.slice(0, midPoint).filter((r) => r.status === 'PASSED').length / midPoint;
    const secondHalfPassRate = results.slice(midPoint).filter((r) => r.status === 'PASSED').length / (results.length - midPoint);
    const varianceFactor = Math.abs(firstHalfPassRate - secondHalfPassRate);
    score += varianceFactor * 0.1;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Detect failure patterns from results
   */
  private detectFailurePatterns(results: DbTestResult[], recentPattern: string, passRate: number): FailurePattern[] {
    const patterns: FailurePattern[] = [];

    // Check for intermittent pattern (mixed P and F)
    const hasPasses = recentPattern.includes('P');
    const hasFailures = recentPattern.includes('F');
    if (hasPasses && hasFailures) {
      patterns.push({
        type: 'intermittent',
        description: 'Test shows intermittent pass/fail behavior',
        confidence: 0.8,
        evidence: [`Pass rate: ${passRate.toFixed(1)}%`, `Recent pattern: ${recentPattern}`],
      });
    }

    // Check for timing issues (look for timeouts)
    const hasTimeouts = results.some((r) => r.status === 'TIMEOUT');
    if (hasTimeouts) {
      patterns.push({
        type: 'timing',
        description: 'Test has timeout failures suggesting timing dependencies',
        confidence: 0.7,
        evidence: ['Timeout failures detected in execution history'],
      });
    }

    // Check for environment-specific patterns
    // (This would require more context about test environments)
    const errorMessages = results
      .filter((r) => r.errorMessage)
      .map((r) => r.errorMessage!.toLowerCase());

    if (errorMessages.some((e) => e.includes('network') || e.includes('connection'))) {
      patterns.push({
        type: 'environment',
        description: 'Failures may be related to network/environment issues',
        confidence: 0.6,
        evidence: ['Network-related error messages detected'],
      });
    }

    if (errorMessages.some((e) => e.includes('race') || e.includes('concurrent'))) {
      patterns.push({
        type: 'race_condition',
        description: 'Possible race condition detected',
        confidence: 0.75,
        evidence: ['Race condition indicators in error messages'],
      });
    }

    if (errorMessages.some((e) => e.includes('null') || e.includes('undefined'))) {
      patterns.push({
        type: 'data',
        description: 'Data-related failures detected',
        confidence: 0.5,
        evidence: ['Null/undefined related error messages'],
      });
    }

    return patterns;
  }

  /**
   * Generate suggested fixes based on failure patterns
   */
  private generateSuggestedFixes(patterns: FailurePattern[]): string[] {
    const fixes = new Set<string>();

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'intermittent':
          fixes.add('Add explicit waits or retries for unstable operations');
          fixes.add('Increase test timeout duration');
          break;
        case 'timing':
          fixes.add('Review and adjust timeout values');
          fixes.add('Add explicit synchronization points');
          break;
        case 'race_condition':
          fixes.add('Add proper locking or sequencing for async operations');
          fixes.add('Use proper wait conditions instead of fixed delays');
          break;
        case 'environment':
          fixes.add('Mock external dependencies to reduce environment variability');
          fixes.add('Add retry logic for transient failures');
          break;
        case 'data':
          fixes.add('Ensure test data is properly initialized');
          fixes.add('Add null/undefined checks in test assertions');
          break;
      }
    }

    return Array.from(fixes);
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(flakinessScore: number, totalRuns: number): 'low' | 'medium' | 'high' | 'very_high' {
    if (totalRuns < 10) return 'low';
    if (flakinessScore < 0.3) return 'low';
    if (flakinessScore < 0.5) return 'medium';
    if (flakinessScore < 0.7) return 'high';
    return 'very_high';
  }

  /**
   * Generate reason for flaky assessment
   */
  private generateReason(flakinessScore: number, passRate: number, patterns: FailurePattern[]): string {
    const patternDesc = patterns.length > 0
      ? patterns.map((p) => p.description).join('; ')
      : 'Inconsistent test behavior detected';

    return `Flakiness score: ${flakinessScore.toFixed(2)} (pass rate: ${passRate.toFixed(1)}%). ${patternDesc}`;
  }

  /**
   * Check if test should be quarantined
   */
  private shouldQuarantine(analysis: FlakinessAnalysis): Omit<QuarantineRecommendation, 'category'> {
    return {
      shouldQuarantine: analysis.shouldQuarantine,
      reason: analysis.reason,
      suggestedFixes: analysis.suggestedFixes,
      priority: Math.round(analysis.flakinessScore * 10),
    };
  }

  /**
   * Handle a test that has stabilized
   */
  private async handleStabilizedTest(testCaseId: string, flakyTest: { id: string; quarantineId?: string | null }): Promise<void> {
    await this.prisma.flakyTest.update({
      where: { id: flakyTest.id },
      data: { status: 'STABLE' },
    });

    if (flakyTest.quarantineId) {
      await this.prisma.testQuarantine.update({
        where: { id: flakyTest.quarantineId },
        data: { status: 'RESOLVED', reviewedAt: new Date() },
      });
    }
  }

  /**
   * Determine flaky status based on analysis
   */
  private determineFlakyStatus(analysis: FlakinessAnalysis, existing: { status: string }): string {
    if (analysis.flakinessScore < this.config.flakinessThreshold * 0.5) {
      return 'STABILIZING';
    }
    if (existing.status === 'DETECTED' && analysis.flakinessScore > this.config.flakinessThreshold * 1.2) {
      return 'MONITORING';
    }
    return existing.status;
  }

  /**
   * Get recent pattern string
   */
  private getRecentPattern(pattern: string): string {
    return pattern.slice(-this.config.patternAnalysisWindow);
  }

  /**
   * Encode failure patterns for JSON storage
   */
  private encodeFailurePatterns(patterns: FailurePattern[]): unknown {
    return patterns.map((p) => ({
      type: p.type,
      description: p.description,
      confidence: p.confidence,
      evidence: p.evidence,
    }));
  }
}

/**
 * Singleton instance
 */
let detectorInstance: FlakyTestDetector | undefined;

/**
 * Get or create the detector instance
 */
export function getFlakyTestDetector(prisma: PrismaClient, config?: FlakyTestDetectorConfig): FlakyTestDetector {
  if (!detectorInstance) {
    detectorInstance = new FlakyTestDetector(prisma, config);
  }
  return detectorInstance;
}

/**
 * Reset the detector instance
 */
export function resetFlakyTestDetector(): void {
  detectorInstance = undefined;
}
