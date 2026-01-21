/**
 * Accessibility Testing Types
 *
 * Defines types for automated accessibility testing on iOS and Android platforms.
 * Detects missing labels, low contrast, and focus issues.
 */

/**
 * Accessibility violation severity levels
 */
export enum AccessibilitySeverity {
  /** Critical violation that blocks users */
  CRITICAL = 'critical',

  /** Serious violation that significantly impacts users */
  SERIOUS = 'serious',

  /** Moderate violation that impacts some users */
  MODERATE = 'moderate',

  /** Minor violation with limited impact */
  MINOR = 'minor',
}

/**
 * Types of accessibility violations
 */
export enum AccessibilityViolationType {
  /** Missing accessibility label on interactive element */
  MISSING_LABEL = 'missing_label',

  /** Element has no descriptive text */
  MISSING_DESCRIPTION = 'missing_description',

  /** Contrast ratio is too low for readability */
  LOW_CONTRAST = 'low_contrast',

  /** Element cannot receive focus but should be interactive */
  NO_FOCUS = 'no_focus',

  /** Focus order is illogical */
  INVALID_FOCUS_ORDER = 'invalid_focus_order',

  /** Focus indicator is not visible */
  NO_FOCUS_INDICATOR = 'no_focus_indicator',

  /** Touch target size is too small */
  SMALL_TOUCH_TARGET = 'small_touch_target',

  /** Duplicate accessibility identifiers */
  DUPLICATE_IDENTIFIER = 'duplicate_identifier',

  /** Image missing alt text or accessibility label */
  MISSING_ALT_TEXT = 'missing_alt_text',

  /** Editable field missing label or hint */
  UNLABELED_FIELD = 'unlabeled_field',

  /** Element not accessible to screen reader */
  SCREEN_READER_INACCESSIBLE = 'screen_reader_inaccessible',

  /** Dynamic content lacks announcement */
  NO_ANNOUNCEMENT = 'no_announcement',
}

/**
 * Platform-specific accessibility violation
 */
export interface AccessibilityViolation {
  /** Unique violation identifier */
  id: string;

  /** Type of violation */
  type: AccessibilityViolationType;

  /** Severity level */
  severity: AccessibilitySeverity;

  /** Element that violates accessibility guidelines */
  element: {
    /** Element identifier (id, xpath, accessibility id) */
    identifier: string;

    /** Element type (button, text, image, etc.) */
    elementType: string;

    /** Element's bounding rectangle */
    bounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };

    /** Element's text content if available */
    text?: string;

    /** Element's accessibility label if available */
    accessibilityLabel?: string;

    /** Element's accessibility hint if available */
    accessibilityHint?: string;

    /** Element's trait/role */
    trait?: string;
  };

  /** Human-readable description of the violation */
  message: string;

  /** WCAG success criteria reference */
  wcagCriteria?: string;

  /** Recommendation for fixing the violation */
  recommendation: string;

  /** Platform (ios or android) */
  platform: 'ios' | 'android';
}

/**
 * Contrast measurement result
 */
export interface ContrastResult {
  /** Background color (hex) */
  backgroundColor: string;

  /** Foreground color (hex) */
  foregroundColor: string;

  /** Calculated contrast ratio */
  contrastRatio: number;

  /** Whether contrast meets WCAG AA standard */
  meetsAA: boolean;

  /** Whether contrast meets WCAG AAA standard */
  meetsAAA: boolean;

  /** Minimum required ratio for WCAG AA */
  requiredAARatio: number;

  /** Minimum required ratio for WCAG AAA */
  requiredAAARatio: number;
}

/**
 * Focus analysis result
 */
export interface FocusResult {
  /** Elements that can receive focus */
  focusableElements: Array<{
    identifier: string;
    elementType: string;
    focusOrder: number;
  }>;

  /** Whether focus order is logical */
  isLogicalOrder: boolean;

  /** Focus issues detected */
  issues: Array<{
    type: 'no_focus' | 'invalid_order' | 'no_indicator';
    element: string;
    description: string;
  }>;
}

/**
 * Touch target analysis result
 */
export interface TouchTargetResult {
  /** Elements analyzed */
  elements: Array<{
    identifier: string;
    width: number;
    height: number;
    meetsMinimum: boolean;
  }>;

  /** Minimum touch target size (iOS: 44x44pt, Android: 48x48dp) */
  minimumSize: {
    width: number;
    height: number;
  };

  /** Number of elements that don't meet minimum */
  belowMinimumCount: number;
}

/**
 * Complete accessibility scan result
 */
export interface AccessibilityScanResult {
  /** Scan identifier */
  id: string;

  /** Platform that was scanned */
  platform: 'ios' | 'android';

  /** Device/app identifier */
  target: string;

  /** Timestamp when scan was performed */
  timestamp: Date;

  /** Total duration of scan in milliseconds */
  duration: number;

  /** All violations found */
  violations: AccessibilityViolation[];

  /** Violations grouped by severity */
  violationsBySeverity: {
    critical: AccessibilityViolation[];
    serious: AccessibilityViolation[];
    moderate: AccessibilityViolation[];
    minor: AccessibilityViolation[];
  };

  /** Violations grouped by type */
  violationsByType: Map<AccessibilityViolationType, AccessibilityViolation[]>;

  /** Contrast analysis results */
  contrastResults?: ContrastResult[];

  /** Focus analysis results */
  focusResults?: FocusResult;

  /** Touch target analysis results */
  touchTargetResults?: TouchTargetResult;

  /** Overall accessibility score (0-100) */
  score: number;

  /** Whether scan completed successfully */
  success: boolean;

  /** Error message if scan failed */
  error?: string;
}

/**
 * Accessibility scan configuration
 */
export interface AccessibilityScanConfig {
  /** Whether to check for missing labels */
  checkMissingLabels?: boolean;

  /** Whether to check contrast ratios */
  checkContrast?: boolean;

  /** Whether to check focus issues */
  checkFocus?: boolean;

  /** Whether to check touch target sizes */
  checkTouchTargets?: boolean;

  /** Whether to check for duplicate identifiers */
  checkDuplicateIds?: boolean;

  /** Minimum contrast ratio for WCAG AA (default: 4.5 for normal text) */
  minContrastAA?: number;

  /** Minimum contrast ratio for WCAG AAA (default: 7 for normal text) */
  minContrastAAA?: number;

  /** Minimum touch target size */
  minTouchTargetSize?: {
    width?: number;
    height?: number;
  };

  /** Elements to exclude from scan */
  excludeSelectors?: string[];

  /** Specific elements to include (if null, scan all) */
  includeSelectors?: string[];

  /** Maximum duration for scan in milliseconds */
  timeout?: number;
}

/**
 * Platform-specific accessibility tree node
 */
export interface AccessibilityTreeNode {
  /** Node identifier */
  id: string;

  /** Node type/role */
  role: string;

  /** Node label */
  label?: string;

  /** Node hint */
  hint?: string;

  /** Node value */
  value?: string;

  /** Whether node is accessible */
  accessible: boolean;

  /** Whether node is focusable */
  focusable: boolean;

  /** Whether node is enabled */
  enabled: boolean;

  /** Whether node is visible */
  visible: boolean;

  /** Node bounds */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Child nodes */
  children?: AccessibilityTreeNode[];

  /** Platform-specific attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Accessibility testing driver interface
 */
export interface AccessibilityDriver {
  /** Get current platform */
  getPlatform(): Promise<'ios' | 'android' | 'web'>;

  /** Get page source */
  getPageSource(): Promise<string>;

  /** Get accessibility tree */
  getAccessibilityTree(): Promise<AccessibilityTreeNode>;

  /** Execute JavaScript */
  executeScript(script: string, args: unknown[]): Promise<unknown>;

  /** Get element style (for contrast checking) */
  getElementStyle(elementId: string): Promise<{
    backgroundColor?: string;
    color?: string;
    fontSize?: string;
    fontWeight?: string;
  }>;

  /** Get element bounds */
  getElementBounds(elementId: string): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;

  /** Screenshot for visual analysis */
  screenshot(): Promise<Buffer>;
}

/**
 * Accessibility testing error types
 */
export enum AccessibilityErrorType {
  /** Driver not available */
  DRIVER_NOT_AVAILABLE = 'DRIVER_NOT_AVAILABLE',

  /** Invalid configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',

  /** Scan timeout */
  TIMEOUT = 'TIMEOUT',

  /** Platform not supported */
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED',

  /** Tree parsing failed */
  TREE_PARSE_FAILED = 'TREE_PARSE_FAILED',

  /** Contrast calculation failed */
  CONTRAST_FAILED = 'CONTRAST_FAILED',

  /** Focus analysis failed */
  FOCUS_ANALYSIS_FAILED = 'FOCUS_ANALYSIS_FAILED',

  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Accessibility testing error class
 */
export class AccessibilityError extends Error {
  constructor(
    public type: AccessibilityErrorType,
    message: string,
    public cause?: Error
  ) {
    super(`[AccessibilityTester] ${type}: ${message}`);
    this.name = 'AccessibilityError';
  }
}
