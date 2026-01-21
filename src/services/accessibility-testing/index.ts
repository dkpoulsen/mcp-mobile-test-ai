/**
 * Accessibility Testing Service - Index
 *
 * Exports all accessibility testing functionality including:
 * - iOS accessibility scanning (VoiceOver, labels, contrast)
 * - Android accessibility scanning (TalkBack, content descriptions, contrast)
 * - Touch target size validation
 * - Focus order analysis
 * - Accessibility violation reporting
 */

// Types
export {
  AccessibilitySeverity,
  AccessibilityViolationType,
  AccessibilityErrorType,
  type AccessibilityViolation,
  type ContrastResult,
  type FocusResult,
  type TouchTargetResult,
  type AccessibilityScanResult,
  type AccessibilityScanConfig,
  type AccessibilityTreeNode,
  type AccessibilityDriver,
  AccessibilityError,
} from './types.js';

// Main Accessibility Tester
export {
  AccessibilityTester,
  createAccessibilityTester,
  getAccessibilityTester,
  resetAccessibilityTester,
} from './accessibility-tester.js';

// iOS Scanner
export {
  IOSA11yScanner,
  createIOSA11yScanner,
} from './ios-a11y-scanner.js';

// Android Scanner
export {
  AndroidA11yScanner,
  createAndroidA11yScanner,
} from './android-a11y-scanner.js';

// Contrast Analyzer
export {
  ContrastAnalyzer,
  createContrastAnalyzer,
  getContrastAnalyzer,
  resetContrastAnalyzer,
} from './contrast-analyzer.js';

// Convenience imports
import { createAccessibilityTester } from './accessibility-tester.js';
import type {
  AccessibilityDriver,
  AccessibilityScanConfig,
  AccessibilityScanResult,
  AccessibilityViolation,
} from './types.js';

/**
 * Run a quick accessibility scan
 */
export async function quickScan(
  driver: AccessibilityDriver,
  config?: AccessibilityScanConfig
): Promise<AccessibilityScanResult> {
  const tester = createAccessibilityTester(driver, config);
  return tester.scan();
}

/**
 * Run accessibility scan and return only critical and serious violations
 */
export async function scanCriticalIssues(
  driver: AccessibilityDriver,
  config?: AccessibilityScanConfig
): Promise<AccessibilityViolation[]> {
  const result = await quickScan(driver, config);
  return result.violations.filter(
    (v) => v.severity === 'critical' || v.severity === 'serious'
  );
}
