/**
 * Flaky Test Manager Types
 * Types for the flaky test management service that coordinates detection and notifications
 */

import type { FlakyTestDetectorConfig } from '../flaky-test-detector/types.js';
import type { NotificationServiceConfig } from '../notification/types.js';

/**
 * Configuration for the flaky test manager
 */
export interface FlakyTestManagerConfig {
  /**
   * Flaky test detector configuration
   */
  detector?: FlakyTestDetectorConfig;

  /**
   * Notification service configuration
   */
  notifications?: NotificationServiceConfig;

  /**
   * Whether to enable automatic detection
   */
  autoDetectEnabled?: boolean;

  /**
   * Interval for automatic detection (ms)
   */
  autoDetectInterval?: number;

  /**
   * Whether to enable notifications
   */
  notificationsEnabled?: boolean;

  /**
   * Team to assign flaky tests to by default
   */
  defaultTeam?: string;
}

/**
 * Result of a detection run
 */
export interface DetectionRunResult {
  /**
   * Number of tests analyzed
   */
  analyzedCount: number;

  /**
   * Number of flaky tests detected
   */
  flakyDetected: number;

  /**
   * Number of tests quarantined
   */
  quarantined: number;

  /**
   * Number of tests promoted
   */
  promoted: number;

  /**
   * Events that were generated
   */
  events: Array<{
    type: 'detected' | 'quarantined' | 'promoted' | 'stabilizing';
    testCaseId: string;
    testCaseName: string;
    testSuiteName: string;
  }>;

  /**
   * Timestamp of the run
   */
  timestamp: Date;
}

/**
 * Summary report for flaky tests
 */
export interface FlakyTestSummaryReport {
  /**
   * Report title
   */
  title: string;

  /**
   * Summary statistics
   */
  summary: {
    totalFlaky: number;
    totalQuarantined: number;
    totalStabilizing: number;
    avgFlakinessScore: number;
  };

  /**
   * Most flaky tests
   */
  mostFlaky: Array<{
    testCaseId: string;
    testSuiteName: string;
    testCaseName: string;
    flakinessScore: number;
    recentPattern: string;
    assignedTeam?: string;
  }>;

  /**
   * Recently quarantined
   */
  recentlyQuarantined: Array<{
    testCaseId: string;
    testSuiteName: string;
    testCaseName: string;
    reason: string;
    quarantinedAt: Date;
  }>;

  /**
   * Tests ready for promotion
   */
  readyForPromotion: Array<{
    testCaseId: string;
    testSuiteName: string;
    testCaseName: string;
    consecutivePasses: number;
    requiredPasses: number;
  }>;

  /**
   * Timestamp
   */
  timestamp: Date;
}
