/**
 * Type definitions for the Test Matrix system
 *
 * The Test Matrix system automatically generates test variants across
 * browsers, devices, and viewport sizes from a single test definition.
 */

/**
 * Browser types supported by the test matrix
 */
export type BrowserType = 'chromium' | 'firefox' | 'webkit' | 'edge' | 'chrome';

/**
 * Device categories for test matrix
 */
export type DeviceCategory = 'desktop' | 'tablet' | 'mobile' | 'custom';

/**
 * Orientation for viewport/device
 */
export type ViewportOrientation = 'portrait' | 'landscape';

/**
 * Preset device configurations
 */
export interface PresetDevice {
  /** Device identifier */
  name: string;
  /** Device category */
  category: DeviceCategory;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
  /** User agent string (optional) */
  userAgent?: string;
  /** Device pixel ratio */
    deviceScaleFactor?: number;
  /** Whether this device has touch support */
    hasTouch?: boolean;
  /** Mobile browser flag */
    isMobile?: boolean;
}

/**
 * Viewport configuration
 */
export interface ViewportConfig {
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
  /** Device scale factor (pixel ratio) */
  deviceScaleFactor?: number;
  /** Whether the viewport has touch support */
  hasTouch?: boolean;
  /** Whether this is a mobile viewport */
  isMobile?: boolean;
  /** Screen orientation */
  orientation?: ViewportOrientation;
}

/**
 * Browser-specific configuration
 */
export interface BrowserConfig {
  /** Browser type */
  browser: BrowserType;
  /** Browser launch options */
  launchOptions?: {
    /** Headless mode */
    headless?: boolean;
    /** Slow down each operation by milliseconds */
    slowMo?: number;
    /** Specific browser channel */
    channel?: 'chrome' | 'msedge' | 'beta' | 'dev' | 'canary' | 'nightly';
    /** Additional arguments */
    args?: string[];
    /** Proxy settings */
    proxy?: {
      server: string;
      username?: string;
      password?: string;
      bypass?: string;
    };
  };
  /** Context options */
  contextOptions?: {
    /** Accept language */
    locale?: string;
    /** Timezone ID */
    timezoneId?: string;
    /** Permissions to grant */
    permissions?: string[];
    /** Color scheme */
    colorScheme?: 'light' | 'dark' | 'no-preference';
    /** Reduced motion */
    reducedMotion?: 'no-preference' | 'prefer-reduced';
  };
  /** Browser-specific timeout multipliers */
  timeoutMultiplier?: number;
}

/**
 * Browser-specific quirks and workarounds
 */
export interface BrowserQuirks {
  /** Whether to wait for network idle before actions */
  waitForNetworkIdle?: boolean;
  /** Additional wait time after page load (ms) */
  pageLoadWait?: number;
  /** Whether to use native events vs synthetic */
  useNativeEvents?: boolean;
  /** Selector prefixes to avoid */
  avoidSelectors?: string[];
  /** Specific selector strategies to prefer */
  preferSelectors?: ('css' | 'xpath' | 'text' | 'aria')[];
  /** Whether to disable animations */
  disableAnimations?: boolean;
  /** Custom CSS to inject */
  injectedCSS?: string;
}

/**
 * Matrix dimensions configuration
 */
export interface MatrixDimensions {
  /** Browsers to test against */
  browsers?: BrowserConfig[];
  /** Viewports to test */
  viewports?: ViewportConfig[];
  /** Preset devices to test */
  devices?: PresetDevice[];
  /** Custom device configurations */
  customDevices?: Array<{
    name: string;
    viewport: ViewportConfig;
    userAgent?: string;
  }>;
}

/**
 * Test definition for matrix generation
 */
export interface TestDefinition {
  /** Unique test identifier */
  id: string;
  /** Test name/title */
  name: string;
  /** Test file path */
  testFile: string;
  /** Test function name */
  testFn: string;
  /** Test timeout in milliseconds */
  timeout?: number;
  /** Test tags for filtering */
  tags?: string[];
  /** Whether this test is enabled */
  enabled?: boolean;
  /** Test metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generated test variant
 */
export interface TestVariant {
  /** Unique variant identifier */
  id: string;
  /** Original test definition */
  testDefinition: TestDefinition;
  /** Browser configuration for this variant */
  browser: BrowserConfig;
  /** Viewport configuration for this variant */
  viewport: ViewportConfig;
  /** Device category */
  deviceCategory: DeviceCategory;
  /** Device name (if preset) or 'custom' */
  deviceName: string;
  /** Browser-specific quirks to apply */
  quirks: BrowserQuirks;
  /** Variant display name */
  displayName: string;
  /** Scheduling priority */
  priority: number;
  /** Estimated execution time */
  estimatedDuration?: number;
}

/**
 * Matrix configuration options
 */
export interface MatrixOptions {
  /** Maximum number of parallel executions */
  maxParallel?: number;
  /** Whether to shuffle execution order */
  shuffle?: boolean;
  /** Retry count for failed variants */
  retries?: number;
  /** Timeout multiplier per variant */
  timeoutMultiplier?: number;
  /** Whether to continue on failure */
  continueOnFailure?: boolean;
  /** Tags to filter which tests to matrix */
  includeTags?: string[];
  /** Tags to exclude from matrix */
  excludeTags?: string[];
  /** Priority function for ordering variants */
  priorityFn?: (variant: TestVariant) => number;
}

/**
 * Matrix execution schedule
 */
export interface MatrixSchedule {
  /** Schedule ID */
  id: string;
  /** Test definition being matrixed */
  testDefinition: TestDefinition;
  /** All generated variants */
  variants: TestVariant[];
  /** Execution batches */
  batches: TestVariant[][];
  /** Total estimated duration */
  estimatedDuration: number;
  /** Configuration options */
  options: MatrixOptions;
}

/**
 * Matrix execution result
 */
export interface MatrixResult {
  /** Matrix ID */
  matrixId: string;
  /** Test definition */
  testDefinition: TestDefinition;
  /** Total variants generated */
  totalVariants: number;
  /** Variants completed */
  completedVariants: number;
  /** Variants passed */
  passedVariants: number;
  /** Variants failed */
  failedVariants: number;
  /** Variants skipped */
  skippedVariants: number;
  /** Results per variant */
  variantResults: Map<string, VariantResult>;
  /** Overall execution time */
  executionTime: number;
  /** Timestamp when matrix started */
  startedAt: Date;
  /** Timestamp when matrix completed */
  completedAt?: Date;
}

/**
 * Result for a single variant
 */
export interface VariantResult {
  /** Variant ID */
  variantId: string;
  /** Variant display name */
  displayName: string;
  /** Execution status */
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'timeout';
  /** Error message if failed */
  error?: string;
  /** Stack trace if failed */
  stackTrace?: string;
  /** Execution time in milliseconds */
  duration: number;
  /** Retry count */
  retryCount: number;
  /** Artifacts collected */
  artifacts: string[];
}

/**
 * Matrix generation statistics
 */
export interface MatrixStats {
  /** Total tests matrixed */
  totalTests: number;
  /** Total variants generated */
  totalVariants: number;
  /** Variants per test (average) */
  avgVariantsPerTest: number;
  /** Browser distribution */
  browserDistribution: Map<BrowserType, number>;
  /** Device category distribution */
  deviceDistribution: Map<DeviceCategory, number>;
}

/**
 * Preset device library
 */
export interface PresetDeviceLibrary {
  /** Get device by name */
  get(name: string): PresetDevice | undefined;
  /** Get all devices */
  all(): PresetDevice[];
  /** Get devices by category */
  getByCategory(category: DeviceCategory): PresetDevice[];
  /** Add custom device */
  add(device: PresetDevice): void;
  /** Remove device */
  remove(name: string): void;
}
