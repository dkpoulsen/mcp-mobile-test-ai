/**
 * Auto-Merge Logic
 *
 * Determines when to automatically merge dependency updates
 * based on test results, update severity, and other factors.
 */

import type {
  TestResults,
  PackageDependency,
  WorkflowRun,
  AutoMergeDecision,
} from './types.js';
import {
  UpdateSeverity,
  DependencyUpdaterConfig,
} from './types.js';
import { getPullRequest, getWorkflowRuns, mergePullRequest, addComment } from './github-client.js';

/**
 * Auto-merge criteria
 */
interface AutoMergeCriteria {
  /** Whether tests must pass */
  requireTestsPass: boolean;
  /** Whether to allow auto-merge for major updates */
  allowMajor: boolean;
  /** Whether to allow auto-merge for updates with security fixes */
  allowSecurityFixes: boolean;
  /** Maximum number of tests allowed to fail */
  maxFailedTests: number;
  /** Whether to require CI workflow completion */
  requireCICompletion: boolean;
  /** Confidence threshold (0-1) for auto-merge */
  confidenceThreshold: number;
}

/**
 * Default auto-merge criteria
 */
const DEFAULT_CRITERIA: AutoMergeCriteria = {
  requireTestsPass: true,
  allowMajor: false,
  allowSecurityFixes: true,
  maxFailedTests: 0,
  requireCICompletion: false,
  confidenceThreshold: 0.8,
};

/**
 * Make an auto-merge decision based on test results and update info
 */
export function makeAutoMergeDecision(
  dependencies: PackageDependency[],
  testResults: TestResults,
  criteria: Partial<AutoMergeCriteria> = {}
): AutoMergeDecision {
  const mergedCriteria = { ...DEFAULT_CRITERIA, ...criteria };

  // Check if tests pass (if required)
  if (mergedCriteria.requireTestsPass && !testResults.passed) {
    return {
      shouldMerge: false,
      reason: `Tests failed: ${testResults.failedTests} test(s) failed`,
      confidence: 0,
    };
  }

  // Check if too many tests failed
  if (testResults.failedTests > mergedCriteria.maxFailedTests) {
    return {
      shouldMerge: false,
      reason: `Too many failed tests: ${testResults.failedTests} > ${mergedCriteria.maxFailedTests}`,
      confidence: 0,
    };
  }

  // Check for major updates (if not allowed)
  const hasMajorUpdate = dependencies.some((d) => d.severity === UpdateSeverity.MAJOR);
  if (hasMajorUpdate && !mergedCriteria.allowMajor) {
    return {
      shouldMerge: false,
      reason: 'Major version updates require manual review',
      confidence: 0.2,
    };
  }

  // Calculate base confidence
  let confidence = 0.5;

  // Increase confidence for patch updates
  const allPatch = dependencies.every((d) => d.severity === UpdateSeverity.PATCH);
  if (allPatch) {
    confidence += 0.3;
  }

  // Increase confidence for minor updates
  const allMinor = dependencies.every((d) => d.severity === UpdateSeverity.MINOR);
  if (allMinor) {
    confidence += 0.2;
  }

  // Increase confidence for passing tests
  if (testResults.passed) {
    confidence += 0.2;
  }

  // Increase confidence for security fixes
  const hasSecurityFixes = dependencies.some((d) =>
    d.vulnerabilities && d.vulnerabilities.length > 0
  );
  if (hasSecurityFixes && mergedCriteria.allowSecurityFixes) {
    confidence += 0.1;
  }

  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);

  // Final decision based on confidence threshold
  const shouldMerge = confidence >= mergedCriteria.confidenceThreshold;

  return {
    shouldMerge,
    reason: shouldMerge
      ? 'All criteria met for auto-merge'
      : `Confidence ${confidence.toFixed(2)} below threshold ${mergedCriteria.confidenceThreshold}`,
    confidence,
  };
}

/**
 * Make auto-merge decision based on CI workflow runs
 */
export async function makeAutoMergeDecisionFromCI(
  prNumber: number,
  dependencies: PackageDependency[],
  config: DependencyUpdaterConfig,
  criteria: Partial<AutoMergeCriteria> = {}
): Promise<AutoMergeDecision> {
  const mergedCriteria = { ...DEFAULT_CRITERIA, ...criteria };

  // Get PR info to find the branch
  const pr = await getPullRequest(prNumber, config);

  if (!pr) {
    return {
      shouldMerge: false,
      reason: 'Pull request not found',
      confidence: 0,
    };
  }

  // Wait for workflow runs to complete if required
  let workflowRuns: WorkflowRun[] = [];
  if (mergedCriteria.requireCICompletion) {
    workflowRuns = await getWorkflowRuns(pr.head.ref, config);

    const incompleteRuns = workflowRuns.filter((r) => r.status !== 'completed');
    if (incompleteRuns.length > 0) {
      return {
        shouldMerge: false,
        reason: `${incompleteRuns.length} workflow run(s) still in progress`,
        confidence: 0.1,
      };
    }
  } else {
    workflowRuns = await getWorkflowRuns(pr.head.ref, config);
  }

  // Check if all workflows passed
  const failedRuns = workflowRuns.filter((r) => r.conclusion === 'failure');
  const successfulRuns = workflowRuns.filter((r) => r.conclusion === 'success');

  if (failedRuns.length > 0) {
    return {
      shouldMerge: false,
      reason: `${failedRuns.length} workflow run(s) failed`,
      confidence: 0,
    };
  }

  // Create synthetic test results from CI runs
  const syntheticTestResults: TestResults = {
    passed: failedRuns.length === 0 && successfulRuns.length > 0,
    totalTests: workflowRuns.length,
    failedTests: failedRuns.length,
    skippedTests: workflowRuns.filter((r) => r.conclusion === 'skipped').length,
    duration: 0,
    tests: workflowRuns.map((r) => ({
      name: r.name,
      status: r.conclusion === 'success' ? 'passed' : 'failed',
      duration: 0,
    })),
  };

  return makeAutoMergeDecision(dependencies, syntheticTestResults, criteria);
}

/**
 * Execute auto-merge if conditions are met
 */
export async function executeAutoMerge(
  prNumber: number,
  dependencies: PackageDependency[],
  testResults: TestResults,
  config: DependencyUpdaterConfig,
  criteria?: Partial<AutoMergeCriteria>
): Promise<boolean> {
  const decision = makeAutoMergeDecision(dependencies, testResults, criteria);

  if (!decision.shouldMerge) {
    // Add a comment explaining why auto-merge was skipped
    await addComment(
      prNumber,
      `## Auto-Merge Decision\n\n**Decision:** Not auto-merged\n\n**Reason:** ${decision.reason}\n\n**Confidence:** ${(decision.confidence! * 100).toFixed(0)}%`,
      config
    );
    return false;
  }

  try {
    await mergePullRequest(prNumber, {
      method: 'merge',
      commitTitle: `Auto-merge: ${dependencies.map((d) => d.name).join(', ')}`,
      commitMessage: `Auto-merged dependency updates after successful test validation.`,
    }, config);

    // Add success comment
    await addComment(
      prNumber,
      `## Auto-Merge Decision\n\n**Decision:** Auto-merged ✅\n\n**Reason:** ${decision.reason}\n\n**Confidence:** ${(decision.confidence! * 100).toFixed(0)}%`,
      config
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a dependency update is safe for auto-merge
 */
export function isSafeForAutoMerge(
  dependency: PackageDependency,
  config: DependencyUpdaterConfig
): boolean {
  // Don't auto-merge major updates unless configured
  if (dependency.severity === UpdateSeverity.MAJOR && !config.includeMajor) {
    return false;
  }

  // Auto-merge security fixes
  if (dependency.vulnerabilities && dependency.vulnerabilities.length > 0) {
    return true;
  }

  // Auto-merge patch updates
  if (dependency.severity === UpdateSeverity.PATCH && config.includePatch) {
    return true;
  }

  // Minor updates require explicit configuration
  if (dependency.severity === UpdateSeverity.MINOR) {
    return config.includeMinor;
  }

  return false;
}

/**
 * Calculate merge confidence score
 */
export function calculateMergeConfidence(
  dependencies: PackageDependency[],
  testResults: TestResults,
  ciRuns?: WorkflowRun[]
): number {
  let confidence = 0;

  // Base confidence from test results (up to 0.5)
  if (testResults.totalTests > 0) {
    const passRate = (testResults.totalTests - testResults.failedTests) / testResults.totalTests;
    confidence += passRate * 0.5;
  }

  // CI workflow results (up to 0.3)
  if (ciRuns && ciRuns.length > 0) {
    const successRate = ciRuns.filter((r) => r.conclusion === 'success').length / ciRuns.length;
    confidence += successRate * 0.3;
  }

  // Update severity bonus (up to 0.2)
  const allPatch = dependencies.every((d) => d.severity === UpdateSeverity.PATCH);
  if (allPatch) {
    confidence += 0.2;
  } else {
    const hasMinor = dependencies.some((d) => d.severity === UpdateSeverity.MINOR);
    const hasMajor = dependencies.some((d) => d.severity === UpdateSeverity.MAJOR);
    if (!hasMajor) {
      confidence += 0.1;
    } else if (hasMinor && !hasMajor) {
      confidence += 0.05;
    }
  }

  return Math.min(confidence, 1.0);
}

/**
 * Generate auto-merge explanation comment
 */
export function generateAutoMergeExplanation(
  decision: AutoMergeDecision,
  dependencies: PackageDependency[],
  testResults: TestResults
): string {
  const lines = [
    '## Auto-Merge Analysis',
    '',
    `**Decision:** ${decision.shouldMerge ? '✅ Auto-merge approved' : '❌ Manual review required'}`,
    '',
    `**Reason:** ${decision.reason}`,
    '',
    `**Confidence:** ${(decision.confidence! * 100).toFixed(0)}%`,
    '',
    '### Details',
    '',
    '**Dependencies:**',
    ...dependencies.map((d) => `- ${d.name} (${d.currentVersion} → ${d.latestVersion}, ${d.severity})`),
    '',
    '**Test Results:**',
    `- Total: ${testResults.totalTests}`,
    `- Passed: ${testResults.totalTests - testResults.failedTests - testResults.skippedTests}`,
    `- Failed: ${testResults.failedTests}`,
    `- Skipped: ${testResults.skippedTests}`,
    '',
    '---',
    '',
    '*This analysis was performed automatically by the dependency updater.*',
  ];

  return lines.join('\n');
}
