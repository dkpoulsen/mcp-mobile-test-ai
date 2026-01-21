/**
 * Coverage Explorer Types
 *
 * Defines types for AI-driven exploration mode that automatically discovers
 * untested app flows and suggests additional test cases.
 */

import type { MobileAction, ActionResult, ActionSelector } from '../action-executor/index.js';

/**
 * Exploration strategy type
 */
export enum ExplorationStrategy {
  /** Breadth-first exploration - explore all siblings before going deeper */
  BFS = 'bfs',

  /** Depth-first exploration - go as deep as possible before backtracking */
  DFS = 'dfs',

  /** Random exploration - pick random unexplored actions */
  RANDOM = 'random',

  /** Smart exploration - use AI to prioritize interesting paths */
  SMART = 'smart',

  /** Coverage-guided - prioritize paths with low coverage */
  COVERAGE_GUIDED = 'coverage_guided',
}

/**
 * Element interaction type
 */
export enum InteractionType {
  /** Click/tap interaction */
  TAP = 'tap',

  /** Text input interaction */
  INPUT = 'input',

  /** Scroll interaction */
  SCROLL = 'scroll',

  /** Swipe interaction */
  SWIPE = 'swipe',

  /** Toggle interaction */
  TOGGLE = 'toggle',

  /** Select interaction */
  SELECT = 'select',

  /** Long press interaction */
  LONG_PRESS = 'long_press',

  /** Navigation interaction */
  NAVIGATION = 'navigation',
}

/**
 * Discovered UI element
 */
export interface DiscoveredElement {
  /** Unique identifier for this element */
  id: string;

  /** Element selector */
  selector: ActionSelector;

  /** Element type (button, input, text, etc.) */
  elementType: string;

  /** Text content of the element */
  text?: string;

  /** Accessibility label/ID */
  accessibilityLabel?: string;

  /** Element bounds/position */
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };

  /** Whether element is visible */
  visible: boolean;

  /** Whether element is enabled */
  enabled: boolean;

  /** Whether element is clickable */
  clickable: boolean;

  /** Supported interaction types */
  interactionTypes: InteractionType[];

  /** Parent screen ID */
  screenId: string;

  /** Confidence score for discovery (0-1) */
  confidence: number;

  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Screen/state representation
 */
export interface ScreenState {
  /** Unique screen identifier */
  id: string;

  /** Screen name/title (if available) */
  name?: string;

  /** Elements discovered on this screen */
  elements: DiscoveredElement[];

  /** Screenshot of the screen */
  screenshot?: {
    path: string;
    timestamp: Date;
  };

  /** Page source for analysis */
  pageSource?: string;

  /** Depth from start screen */
  depth: number;

  /** How many times this screen was visited */
  visitCount: number;

  /** Parent screen that led to this screen */
  parentScreenId?: string;

  /** Action that led to this screen */
  incomingAction?: MobileAction;

  /** Child screens reachable from this screen */
  childScreenIds: string[];

  /** Timestamp of first visit */
  firstVisited: Date;

  /** Timestamp of last visit */
  lastVisited: Date;

  /** Whether screen has been fully explored */
  fullyExplored: boolean;

  /** Screen hash for duplicate detection */
  hash: string;
}

/**
 * Exploration edge (transition between screens)
 */
export interface ExplorationEdge {
  /** Unique edge identifier */
  id: string;

  /** Source screen ID */
  fromScreenId: string;

  /** Target screen ID */
  toScreenId: string;

  /** Action that caused the transition */
  action: MobileAction;

  /** Result of executing the action */
  result?: ActionResult;

  /** How many times this edge was traversed */
  traversalCount: number;

  /** Whether this edge leads to a new screen */
  isNewScreen: boolean;

  /** Timestamp of first traversal */
  firstTraversed: Date;

  /** Timestamp of last traversal */
  lastTraversed: Date;
}

/**
 * Exploration session configuration
 */
export interface ExplorationConfig {
  /** Maximum exploration depth */
  maxDepth?: number;

  /** Maximum number of actions to execute */
  maxActions?: number;

  /** Maximum duration in milliseconds */
  maxDuration?: number;

  /** Exploration strategy */
  strategy?: ExplorationStrategy;

  /** Whether to take screenshots during exploration */
  captureScreenshots?: boolean;

  /** Screenshot directory */
  screenshotDirectory?: string;

  /** Whether to capture page source */
  capturePageSource?: boolean;

  /** Delay between actions (ms) */
  actionDelay?: number;

  /** Maximum retries for failed actions */
  maxRetries?: number;

  /** Elements to skip during exploration */
  skipSelectors?: ActionSelector[];

  /** Selectors to prioritize */
  prioritizeSelectors?: ActionSelector[];

  /** Whether to use AI for smart decisions */
  useAI?: boolean;

  /** Whether to stop when no new elements found */
  stopOnNoNewElements?: boolean;

  /** Maximum consecutive screens without new elements */
  maxStaleScreens?: number;

  /** Whether to explore forms with random data */
  exploreForms?: boolean;

  /** Test data generator config */
  testDataConfig?: {
    generateRandomEmails?: boolean;
    generateRandomPhones?: boolean;
    generateRandomNames?: boolean;
    generateRandomText?: boolean;
  };
}

/**
 * Exploration progress update
 */
export interface ExplorationProgress {
  /** Session ID */
  sessionId: string;

  /** Current status */
  status: ExplorationStatus;

  /** Current screen ID */
  currentScreenId: string;

  /** Number of screens discovered */
  screensDiscovered: number;

  /** Number of elements discovered */
  elementsDiscovered: number;

  /** Number of actions executed */
  actionsExecuted: number;

  /** Number of edges discovered */
  edgesDiscovered: number;

  /** Current depth */
  currentDepth: number;

  /** Elapsed time in milliseconds */
  elapsedTime: number;

  /** Percentage complete (estimated) */
  progressPercent: number;

  /** Recent activity */
  recentActivity: string[];

  /** Current action being executed (if any) */
  currentAction?: MobileAction;
}

/**
 * Exploration status
 */
export enum ExplorationStatus {
  /** Session is initializing */
  INITIALIZING = 'initializing',

  /** Currently exploring */
  EXPLORING = 'exploring',

  /** Paused */
  PAUSED = 'paused',

  /** Completed successfully */
  COMPLETED = 'completed',

  /** Stopped due to error */
  ERROR = 'error',

  /** Stopped by user */
  STOPPED = 'stopped',

  /** Timed out */
  TIMEOUT = 'timeout',
}

/**
 * Exploration session result
 */
export interface ExplorationResult {
  /** Session ID */
  sessionId: string;

  /** Session configuration */
  config: ExplorationConfig;

  /** Final status */
  status: ExplorationStatus;

  /** All discovered screens */
  screens: ScreenState[];

  /** All discovered elements (unique) */
  elements: DiscoveredElement[];

  /** All discovered edges */
  edges: ExplorationEdge[];

  /** Actions executed during exploration */
  actionHistory: Array<{
    action: MobileAction;
    result: ActionResult;
    screenId: string;
    timestamp: Date;
  }>;

  /** Exploration statistics */
  statistics: ExplorationStatistics;

  /** Test case suggestions based on exploration */
  suggestions: TestCaseSuggestion[];

  /** Coverage gaps identified */
  coverageGaps: CoverageGap[];

  /** Start timestamp */
  startedAt: Date;

  /** End timestamp */
  endedAt: Date;

  /** Duration in milliseconds */
  duration: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Exploration statistics
 */
export interface ExplorationStatistics {
  /** Total screens discovered */
  totalScreens: number;

  /** Total unique elements discovered */
  totalElements: number;

  /** Total unique edges discovered */
  totalEdges: number;

  /** Total actions executed */
  totalActions: number;

  /** Successful actions */
  successfulActions: number;

  /** Failed actions */
  failedActions: number;

  /** Screens fully explored */
  fullyExploredScreens: number;

  /** Partially explored screens */
  partiallyExploredScreens: number;

  /** Unexplored screens */
  unexploredScreens: number;

  /** Maximum depth reached */
  maxDepthReached: number;

  /** Average depth of screens */
  averageDepth: number;

  /** Most visited screen */
  mostVisitedScreen: {
    screenId: string;
    name?: string;
    visitCount: number;
  } | null;

  /** Element type distribution */
  elementTypeDistribution: Record<string, number>;

  /** Interaction type distribution */
  interactionDistribution: Record<InteractionType, number>;
}

/**
 * Test case suggestion
 */
export interface TestCaseSuggestion {
  /** Suggestion ID */
  id: string;

  /** Suggestion title */
  title: string;

  /** Suggestion description */
  description: string;

  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** Suggested test steps */
  steps: Array<{
    description: string;
    action?: MobileAction;
    expectedOutcome?: string;
  }>;

  /** Reasoning for this suggestion */
  reasoning: string;

  /** Related screen IDs */
  screenIds: string[];

  /** Related element IDs */
  elementIds: string[];

  /** Suggested test case type */
  testType: 'happy_path' | 'edge_case' | 'error_handling' | 'integration' | 'regression';

  /** Estimated complexity */
  complexity: 'simple' | 'moderate' | 'complex';

  /** Whether test case is automatable */
  automatable: boolean;

  /** Tags for categorization */
  tags: string[];
}

/**
 * Coverage gap
 */
export interface CoverageGap {
  /** Gap ID */
  id: string;

  /** Gap type */
  gapType: 'unexplored_screen' | 'untested_element' | 'missing_flow' | 'edge_case' | 'error_scenario';

  /** Gap description */
  description: string;

  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /** Affected screen IDs */
  screenIds: string[];

  /** Affected element IDs */
  elementIds: string[];

  /** Suggested actions to address the gap */
  suggestions: string[];

  /** Whether this gap was addressed */
  addressed: boolean;
}

/**
 * Element discovery options
 */
export interface ElementDiscoveryOptions {
  /** Maximum elements to discover on a screen */
  maxElements?: number;

  /** Selector strategies to use */
  selectorStrategies?: Array<'id' | 'xpath' | 'accessibility' | 'css' | 'text'>;

  /** Whether to infer element types */
  inferTypes?: boolean;

  /** Whether to detect element relationships */
  detectRelationships?: boolean;

  /** Timeout for element discovery */
  timeout?: number;
}

/**
 * Navigation graph for visualizing explored paths
 */
export interface NavigationGraph {
  /** Nodes (screens) */
  nodes: Array<{
    id: string;
    name?: string;
    visitCount: number;
    depth: number;
  }>;

  /** Edges (transitions) */
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
    traversalCount: number;
  }>;

  /** Entry point screen */
  entryPoint: string;

  /** Exit points (screens with no outgoing edges) */
  exitPoints: string[];
}

/**
 * Coverage explorer error types
 */
export enum CoverageExplorerErrorType {
  /** Driver not available */
  DRIVER_NOT_AVAILABLE = 'DRIVER_NOT_AVAILABLE',

  /** Element discovery failed */
  ELEMENT_DISCOVERY_FAILED = 'ELEMENT_DISCOVERY_FAILED',

  /** Exploration timeout */
  EXPLORATION_TIMEOUT = 'EXPLORATION_TIMEOUT',

  /** Invalid configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',

  /** Session not found */
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  /** AI analysis failed */
  AI_ANALYSIS_FAILED = 'AI_ANALYSIS_FAILED',

  /** Screenshot capture failed */
  SCREENSHOT_FAILED = 'SCREENSHOT_FAILED',

  /** Page source capture failed */
  PAGE_SOURCE_FAILED = 'PAGE_SOURCE_FAILED',
}

/**
 * Coverage explorer error class
 */
export class CoverageExplorerError extends Error {
  constructor(
    public type: CoverageExplorerErrorType,
    message: string,
    public cause?: Error
  ) {
    super(`[CoverageExplorer] ${type}: ${message}`);
    this.name = 'CoverageExplorerError';
  }
}
