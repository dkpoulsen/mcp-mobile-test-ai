/**
 * Action Executor Types
 *
 * Defines types for executing mobile actions including tap, swipe, scroll,
 * input text, and gestures with support for waits and screenshot capture.
 */

/**
 * Supported mobile action types
 */
export enum ActionType {
  /** Tap/click on an element */
  TAP = 'tap',

  /** Long press on an element */
  LONG_PRESS = 'long_press',

  /** Swipe/drag gesture */
  SWIPE = 'swipe',

  /** Scroll the screen */
  SCROLL = 'scroll',

  /** Input text into an element */
  INPUT = 'input',

  /** Clear text from an element */
  CLEAR = 'clear',

  /** Select element from dropdown/picker */
  SELECT = 'select',

  /** Toggle checkbox/switch */
  TOGGLE = 'toggle',

  /** Navigate back */
  GO_BACK = 'go_back',

  /** Hide keyboard */
  HIDE_KEYBOARD = 'hide_keyboard',

  /** Wait/sleep */
  WAIT = 'wait',

  /** Screenshot capture */
  SCREENSHOT = 'screenshot',

  /** Multi-touch gesture */
  GESTURE = 'gesture',

  /** Pinch zoom */
  PINCH = 'pinch',

  /** Custom action */
  CUSTOM = 'custom',
}

/**
 * Swipe direction for scroll and swipe actions
 */
export enum SwipeDirection {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
}

/**
 * Element selector for action target
 */
export interface ActionSelector {
  /** Selector type (id, xpath, accessibility_id, css, etc.) */
  type?: string;

  /** Selector value */
  value: string;

  /** Optional fallback strategies */
  fallbacks?: ActionSelector[];
}

/**
 * Point coordinates for gestures
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Rectangle/bounds for an element
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Swipe/gesture configuration
 */
export interface SwipeConfig {
  /** Start position (if not using element) */
  start?: Point;

  /** End position (if not using element) */
  end?: Point;

  /** Direction of swipe */
  direction?: SwipeDirection;

  /** Duration in milliseconds */
  duration?: number;

  /** Number of steps for smoothness */
  steps?: number;

  /** Offset from element edge (for element-based swipes) */
  offset?: Point;
}

/**
 * Tap configuration
 */
export interface TapConfig {
  /** Tap duration in milliseconds (for long press) */
  duration?: number;

  /** Number of times to tap */
  count?: number;

  /** Offset from element center */
  offset?: Point;

  /** Finger to use for tap (multi-touch) */
  finger?: number;
}

/**
 * Input configuration
 */
export interface InputConfig {
  /** Text to input */
  text: string;

  /** Clear field before input */
  clearFirst?: boolean;

  /** Submit after input (press Enter) */
  submit?: boolean;

  /** Input speed (characters per second) */
  speed?: number;

  /** Key codes to send (for special keys) */
  keys?: string;
}

/**
 * Wait configuration
 */
export interface WaitConfig {
  /** Duration to wait in milliseconds */
  duration?: number;

  /** Wait for element to be present */
  waitForElement?: ActionSelector;

  /** Wait for element to be visible */
  waitForVisible?: ActionSelector;

  /** Wait for element to be clickable */
  waitForClickable?: ActionSelector;

  /** Wait condition callback */
  condition?: string; // JavaScript expression

  /** Maximum wait time */
  timeout?: number;

  /** Polling interval */
  interval?: number;
}

/**
 * Screenshot configuration
 */
export interface ScreenshotConfig {
  /** Screenshot path/name */
  path?: string;

  /** Capture full page (scrollable) */
  fullPage?: boolean;

  /** Screenshot format */
  format?: 'png' | 'jpg' | 'webp';

  /** Screenshot quality (for lossy formats) */
  quality?: number;

  /** Whether to include timestamp in filename */
  timestamp?: boolean;
}

/**
 * Gesture step for multi-touch gestures
 */
export interface GestureStep {
  /** Action for this step (press, wait, moveTo, release) */
  action: 'press' | 'wait' | 'moveTo' | 'release';

  /** Duration in milliseconds */
  duration?: number;

  /** Target position */
  position?: Point;

  /** Target element */
  element?: ActionSelector;
}

/**
 * Pinch configuration
 */
export interface PinchConfig {
  /** Percentage to zoom (positive = zoom in, negative = zoom out) */
  percent: number;

  /** Speed of pinch (1-100) */
  speed?: number;

  /** Center point for pinch */
  center?: Point;
}

/**
 * Main action configuration
 */
export interface MobileAction {
  /** Unique action identifier */
  id?: string;

  /** Action type */
  type: ActionType | string;

  /** Target element selector (if applicable) */
  selector?: ActionSelector;

  /** Tap configuration */
  tapConfig?: TapConfig;

  /** Swipe configuration */
  swipeConfig?: SwipeConfig;

  /** Input configuration */
  inputConfig?: InputConfig;

  /** Wait configuration */
  waitConfig?: WaitConfig;

  /** Screenshot configuration */
  screenshotConfig?: ScreenshotConfig;

  /** Gesture steps for multi-touch */
  gestureSteps?: GestureStep[];

  /** Pinch configuration */
  pinchConfig?: PinchConfig;

  /** Description of the action */
  description?: string;

  /** Action timeout */
  timeout?: number;

  /** Number of retries */
  retries?: number;

  /** Skip this action */
  skip?: boolean;

  /** Custom action data/script */
  customData?: Record<string, unknown>;
}

/**
 * Screenshot metadata
 */
export interface ScreenshotMetadata {
  /** When the screenshot was taken (before/after action) */
  phase: 'before' | 'after';

  /** Action that triggered the screenshot */
  action: MobileAction;

  /** Screenshot file path */
  path: string;

  /** Timestamp */
  timestamp: Date;

  /** Screenshot buffer */
  buffer?: Buffer;
}

/**
 * Action execution result
 */
export interface ActionResult {
  /** Action that was executed */
  action: MobileAction;

  /** Whether execution was successful */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Execution duration in milliseconds */
  duration: number;

  /** Number of retries attempted */
  retries: number;

  /** Screenshots captured during execution */
  screenshots: ScreenshotMetadata[];

  /** Additional data returned by the action */
  data?: Record<string, unknown>;

  /** Element info (if applicable) */
  elementInfo?: {
    found: boolean;
    selector: ActionSelector;
    bounds?: Rect;
  };
}

/**
 * Batch execution options
 */
export interface BatchExecutionOptions {
  /** Stop on first error */
  stopOnError?: boolean;

  /** Continue executing even if actions fail */
  continueOnError?: boolean;

  /** Delay between actions */
  actionDelay?: number;

  /** Screenshot configuration for all actions */
  screenshotConfig?: {
    captureBefore?: boolean;
    captureAfter?: boolean;
    onFailure?: boolean;
    directory?: string;
  };

  /** Maximum parallel actions */
  parallelism?: number;
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  /** All action results */
  results: ActionResult[];

  /** Successful actions */
  successful: ActionResult[];

  /** Failed actions */
  failed: ActionResult[];

  /** Total count */
  total: number;

  /** Success count */
  successCount: number;

  /** Failure count */
  failureCount: number;

  /** Total duration */
  totalDuration: number;
}

/**
 * Executor configuration
 */
export interface ActionExecutorConfig {
  /** Implicit wait timeout in milliseconds */
  implicitWaitTimeout?: number;

  /** Explicit wait timeout in milliseconds */
  explicitWaitTimeout?: number;

  /** Default action timeout */
  defaultActionTimeout?: number;

  /** Default retries */
  defaultRetries?: number;

  /** Retry delay in milliseconds */
  retryDelay?: number;

  /** Screenshot on error */
  screenshotOnError?: boolean;

  /** Screenshot before action */
  screenshotBeforeAction?: boolean;

  /** Screenshot after action */
  screenshotAfterAction?: boolean;

  /** Screenshot directory */
  screenshotDirectory?: string;

  /** Animate actions (for visual debugging) */
  animateActions?: boolean;

  /** Animation duration */
  animationDuration?: number;
}

/**
 * Driver interface for action execution
 */
export interface ActionDriver {
  /** Find element by selector */
  findElement(selector: ActionSelector): Promise<ElementHandle | null>;

  /** Find multiple elements */
  findElements(selector: ActionSelector): Promise<ElementHandle[]>;

  /** Get current page source */
  getPageSource(): Promise<string>;

  /** Execute JavaScript on the device */
  executeScript(script: string, args: unknown[]): Promise<unknown>;

  /** Take screenshot */
  screenshot(path?: string): Promise<Buffer>;

  /** Get window size/rect */
  getWindowSize(): Promise<{ width: number; height: number }>;

  /** Get element bounds */
  getElementBounds(element: ElementHandle): Promise<Rect>;

  /** Tap on coordinates */
  tap(x: number, y: number): Promise<void>;

  /** Long press on coordinates */
  longPress(x: number, y: number, duration?: number): Promise<void>;

  /** Swipe from point to point */
  swipe(startX: number, startY: number, endX: number, endY: number, duration?: number): Promise<void>;

  /** Scroll in direction */
  scroll(direction: SwipeDirection, distance?: number): Promise<void>;

  /** Send keys to active element */
  sendKeys(keys: string): Promise<void>;

  /** Navigate back */
  goBack(): Promise<void>;

  /** Hide keyboard */
  hideKeyboard(): Promise<void>;

  /** Perform multi-touch gesture */
  performGesture(steps: GestureStep[]): Promise<void>;

  /** Get current platform */
  getPlatform(): Promise<'ios' | 'android' | 'web'>;

  /** Wait/sleep */
  sleep(ms: number): Promise<void>;
}

/**
 * Element handle interface
 */
export interface ElementHandle {
  /** Click the element */
  click(): Promise<void>;

  /** Long press the element */
  longPress(duration?: number): Promise<void>;

  /** Send keys to element */
  sendKeys(keys: string): Promise<void>;

  /** Clear text */
  clear(): Promise<void>;

  /** Get text content */
  getText(): Promise<string>;

  /** Get attribute value */
  getAttribute(name: string): Promise<string | null>;

  /** Check if visible */
  isVisible(): Promise<boolean>;

  /** Check if enabled */
  isEnabled(): Promise<boolean>;

  /** Check if selected */
  isSelected(): Promise<boolean>;

  /** Get element bounds */
  getBounds(): Promise<Rect>;

  /** Screenshot of element */
  screenshot(): Promise<Buffer>;

  /** Scroll into view */
  scrollIntoView(): Promise<void>;
}

/**
 * Action executor error types
 */
export enum ActionExecutorErrorType {
  /** Invalid action type */
  INVALID_ACTION = 'INVALID_ACTION',

  /** Element not found */
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',

  /** Action timeout */
  TIMEOUT = 'TIMEOUT',

  /** Invalid selector */
  INVALID_SELECTOR = 'INVALID_SELECTOR',

  /** Driver not available */
  DRIVER_NOT_AVAILABLE = 'DRIVER_NOT_AVAILABLE',

  /** Screenshot failed */
  SCREENSHOT_FAILED = 'SCREENSHOT_FAILED',

  /** Gesture failed */
  GESTURE_FAILED = 'GESTURE_FAILED',

  /** Input failed */
  INPUT_FAILED = 'INPUT_FAILED',

  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Action executor error class
 */
export class ActionExecutorError extends Error {
  constructor(
    public type: ActionExecutorErrorType,
    message: string,
    public action?: MobileAction,
    public cause?: Error
  ) {
    super(`[ActionExecutor] ${type}: ${message}${action ? ` (action: ${action.type})` : ''}`);
    this.name = 'ActionExecutorError';
  }
}
