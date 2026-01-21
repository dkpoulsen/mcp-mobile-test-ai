/**
 * Coverage Explorer Service
 *
 * Main service for AI-driven exploration that discovers untested app flows
 * and suggests additional test cases
 */

import type { ActionDriver } from '../action-executor/index.js';
import type { ActionExecutor } from '../action-executor/index.js';
import type {
  ExplorationConfig,
  ExplorationResult,
  ExplorationProgress,
  ScreenState,
  DiscoveredElement,
  ExplorationEdge,
  NavigationGraph,
} from './types.js';
import {
  ExplorationStrategy,
  ExplorationStatus,
  CoverageExplorerError,
  CoverageExplorerErrorType,
} from './types.js';
import { ElementDiscoveryService, createElementDiscoveryService } from './element-discovery.js';
import { createExplorationStrategy, type IExplorationStrategy } from './exploration-strategies.js';
import { CoverageAnalyzer, createCoverageAnalyzer } from './coverage-analyzer.js';
import { createModuleLogger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

const logger = createModuleLogger('coverage-explorer');

/**
 * Default exploration configuration
 */
const DEFAULT_CONFIG: Required<ExplorationConfig> = {
  maxDepth: 10,
  maxActions: 100,
  maxDuration: 300000, // 5 minutes
  strategy: ExplorationStrategy.SMART,
  captureScreenshots: true,
  screenshotDirectory: './exploration-screenshots',
  capturePageSource: true,
  actionDelay: 500,
  maxRetries: 2,
  skipSelectors: [],
  prioritizeSelectors: [],
  useAI: false,
  stopOnNoNewElements: true,
  maxStaleScreens: 3,
  exploreForms: true,
  testDataConfig: {
    generateRandomEmails: true,
    generateRandomPhones: true,
    generateRandomNames: true,
    generateRandomText: true,
  },
};

/**
 * Coverage Explorer Service class
 */
export class CoverageExplorer {
  private driver: ActionDriver;
  private actionExecutor: ActionExecutor;
  private config: Required<ExplorationConfig>;
  private elementDiscovery: ElementDiscoveryService;
  private coverageAnalyzer: CoverageAnalyzer;
  private explorationStrategy: IExplorationStrategy;

  // Session state
  private sessionId: string | null = null;
  private status: ExplorationStatus = ExplorationStatus.INITIALIZING;
  private startTime: number | null = null;
  private screens = new Map<string, ScreenState>();
  private edges = new Map<string, ExplorationEdge>();
  private actionHistory: Array<{
    action: any;
    result: any;
    screenId: string;
    timestamp: Date;
  }> = [];
  private visitedElements = new Set<string>();
  private currentScreenId: string | null = null;
  private staleScreenCount = 0;
  private lastNewElementCount = 0;

  // Progress callbacks
  private progressCallbacks: Array<(progress: ExplorationProgress) => void> = [];

  constructor(driver: ActionDriver, actionExecutor: ActionExecutor, config?: ExplorationConfig) {
    this.driver = driver;
    this.actionExecutor = actionExecutor;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.elementDiscovery = createElementDiscoveryService(this.driver, {
      timeout: 10000,
    });

    this.coverageAnalyzer = createCoverageAnalyzer();
    this.explorationStrategy = createExplorationStrategy(
      this.config.strategy,
      { maxDepth: this.config.maxDepth }
    );

    logger.info('Coverage Explorer initialized', {
      strategy: this.config.strategy,
      maxDepth: this.config.maxDepth,
      maxActions: this.config.maxActions,
    });
  }

  /**
   * Start exploration session
   */
  async startExploration(): Promise<string> {
    if (this.status === ExplorationStatus.EXPLORING) {
      throw new CoverageExplorerError(
        CoverageExplorerErrorType.INVALID_CONFIG,
        'Exploration already in progress'
      );
    }

    // Reset state
    this.sessionId = randomUUID();
    this.status = ExplorationStatus.INITIALIZING;
    this.startTime = Date.now();
    this.screens.clear();
    this.edges.clear();
    this.actionHistory = [];
    this.visitedElements.clear();
    this.staleScreenCount = 0;
    this.lastNewElementCount = 0;
    this.explorationStrategy.reset();

    logger.info('Starting exploration session', { sessionId: this.sessionId });

    try {
      // Discover initial screen
      this.status = ExplorationStatus.EXPLORING;
      const initialScreen = await this.discoverCurrentScreen('initial');
      this.currentScreenId = initialScreen.id;
      this.screens.set(initialScreen.id, initialScreen);

      this.emitProgress();

      // Run exploration loop
      await this.explorationLoop();

      // Generate results
      this.status = ExplorationStatus.COMPLETED;
      this.emitProgress();

      logger.info('Exploration session completed', {
        sessionId: this.sessionId,
        screens: this.screens.size,
        actions: this.actionHistory.length,
      });

      return this.sessionId;
    } catch (error) {
      this.status = ExplorationStatus.ERROR;
      logger.error('Exploration session failed', {
        sessionId: this.sessionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Main exploration loop
   */
  private async explorationLoop(): Promise<void> {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    while (this.shouldContinueExploration()) {
      // Check timeout
      const elapsed = Date.now() - (this.startTime || 0);
      if (elapsed >= this.config.maxDuration) {
        logger.info('Exploration timeout reached', { elapsed });
        break;
      }

      // Get current screen
      const currentScreen = this.screens.get(this.currentScreenId!);
      if (!currentScreen) {
        logger.warn('Current screen not found', { screenId: this.currentScreenId });
        break;
      }

      // Get next action from strategy
      const nextAction = this.explorationStrategy.getNextAction(
        currentScreen,
        this.screens,
        this.edges,
        this.visitedElements
      );

      if (!nextAction) {
        logger.info('No more actions to execute');
        break;
      }

      // Execute action
      try {
        const result = await this.executeAction(nextAction);

        // Mark element as visited
        if (nextAction.selector) {
          this.visitedElements.add(nextAction.selector.value);
          this.explorationStrategy.markElementVisited(nextAction.selector.value);
        }

        consecutiveErrors = 0;

        // Check for new screen
        const newScreen = await this.detectScreenChange(currentScreen);
        if (newScreen) {
          await this.handleNewScreen(newScreen, currentScreen, nextAction, result);
        } else {
          // Same screen, update visit count
          currentScreen.visitCount++;
          currentScreen.lastVisited = new Date();
        }

        this.emitProgress();

        // Action delay
        if (this.config.actionDelay > 0) {
          await this.driver.sleep(this.config.actionDelay);
        }
      } catch (error) {
        consecutiveErrors++;
        logger.warn('Action execution failed', {
          action: nextAction.type,
          error,
          consecutiveErrors,
        });

        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.error('Too many consecutive errors, stopping exploration');
          this.status = ExplorationStatus.ERROR;
          break;
        }
      }

      // Check action limit
      if (this.actionHistory.length >= this.config.maxActions) {
        logger.info('Max actions reached');
        break;
      }
    }
  }

  /**
   * Execute an exploration action
   */
  private async executeAction(action: any): Promise<any> {
    logger.debug('Executing exploration action', {
      type: action.type,
      selector: action.selector?.value,
    });

    const result = await this.actionExecutor.executeAction(action);

    // Record in history
    this.actionHistory.push({
      action,
      result,
      screenId: this.currentScreenId!,
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Detect if screen has changed after action
   */
  private async detectScreenChange(previousScreen: ScreenState): Promise<ScreenState | null> {
    try {
      const newElements = await this.elementDiscovery.discoverElements('temp');
      const newHash = this.elementDiscovery.generateScreenHash(newElements);

      if (newHash !== previousScreen.hash) {
        // Screen has changed
        const newScreen = await this.discoverCurrentScreen(`screen_${Date.now()}`);

        // Check if this screen was seen before
        for (const [, screen] of this.screens) {
          if (screen.hash === newHash) {
            // Returning to known screen
            screen.visitCount++;
            screen.lastVisited = new Date();
            this.currentScreenId = screen.id;

            // Record edge
            const lastAction = this.actionHistory[this.actionHistory.length - 1];
            if (lastAction) {
              await this.recordEdge(previousScreen.id, screen.id, lastAction);
            }

            return null; // Not a new screen
          }
        }

        return newScreen;
      }
    } catch (error) {
      logger.debug('Screen change detection failed', { error });
    }

    return null;
  }

  /**
   * Handle discovery of a new screen
   */
  private async handleNewScreen(
    newScreen: ScreenState,
    fromScreen: ScreenState,
    _action: any,
    _result: any
  ): Promise<void> {
    logger.info('New screen discovered', {
      screenId: newScreen.id,
      name: newScreen.name,
      depth: newScreen.depth,
    });

    this.screens.set(newScreen.id, newScreen);
    this.currentScreenId = newScreen.id;

    // Update parent-child relationships
    newScreen.parentScreenId = fromScreen.id;
    fromScreen.childScreenIds.push(newScreen.id);

    // Record edge
    const lastAction = this.actionHistory[this.actionHistory.length - 1];
    if (lastAction) {
      await this.recordEdge(fromScreen.id, newScreen.id, lastAction);
    }

    // Check for new elements
    const newElementCount = newScreen.elements.length;
    if (newElementCount > this.lastNewElementCount) {
      this.staleScreenCount = 0;
      this.lastNewElementCount = newElementCount;
    } else {
      this.staleScreenCount++;
    }
  }

  /**
   * Record exploration edge between screens
   */
  private async recordEdge(
    fromScreenId: string,
    toScreenId: string,
    actionResult: any
  ): Promise<void> {
    const edgeId = `edge_${fromScreenId}_to_${toScreenId}`;

    let edge = this.edges.get(edgeId);
    if (!edge) {
      edge = {
        id: edgeId,
        fromScreenId,
        toScreenId,
        action: actionResult.action,
        result: actionResult.result,
        traversalCount: 0,
        isNewScreen: true,
        firstTraversed: new Date(),
        lastTraversed: new Date(),
      };
      this.edges.set(edgeId, edge);
    }

    edge.traversalCount++;
    edge.lastTraversed = new Date();
  }

  /**
   * Discover current screen state
   */
  private async discoverCurrentScreen(screenId: string): Promise<ScreenState> {
    logger.debug('Discovering current screen', { screenId });

    // Discover elements
    const elements = await this.elementDiscovery.discoverElements(screenId);

    // Capture screenshot if enabled
    let screenshot;
    if (this.config.captureScreenshots) {
      try {
        const timestamp = Date.now();
        const path = `${this.config.screenshotDirectory}/${screenId}_${timestamp}.png`;
        await this.driver.screenshot(path);
        screenshot = {
          path,
          timestamp: new Date(),
        };
      } catch (error) {
        logger.debug('Screenshot capture failed', { error });
      }
    }

    // Capture page source if enabled
    let pageSource;
    if (this.config.capturePageSource) {
      try {
        pageSource = await this.driver.getPageSource();
      } catch (error) {
        logger.debug('Page source capture failed', { error });
      }
    }

    // Infer screen name from elements
    const name = this.inferScreenName(elements);

    // Calculate depth
    const parentScreen = this.currentScreenId ? this.screens.get(this.currentScreenId) : null;
    const depth = parentScreen ? parentScreen.depth + 1 : 0;

    // Generate screen hash
    const hash = this.elementDiscovery.generateScreenHash(elements);

    return {
      id: screenId,
      name,
      elements,
      screenshot,
      pageSource,
      depth,
      visitCount: 1,
      parentScreenId: parentScreen?.id,
      incomingAction: this.actionHistory.length > 0
        ? this.actionHistory[this.actionHistory.length - 1]?.action
        : undefined,
      childScreenIds: [],
      firstVisited: new Date(),
      lastVisited: new Date(),
      fullyExplored: elements.length === 0,
      hash,
    };
  }

  /**
   * Infer screen name from elements
   */
  private inferScreenName(elements: DiscoveredElement[]): string | undefined {
    // Look for title-like elements
    for (const element of elements) {
      if (element.elementType === 'text' || element.text) {
        const text = element.text?.trim();
        if (text && text.length > 2 && text.length < 30 && !text.includes(':')) {
          // Likely a title
          const firstChar = text[0];
          if (firstChar && firstChar === firstChar.toUpperCase()) {
            return text;
          }
        }
      }
    }

    // Look for accessibility labels
    for (const element of elements) {
      if (element.accessibilityLabel && element.accessibilityLabel.length > 2) {
        return element.accessibilityLabel;
      }
    }

    return undefined;
  }

  /**
   * Check if exploration should continue
   */
  private shouldContinueExploration(): boolean {
    if (this.status !== ExplorationStatus.EXPLORING) {
      return false;
    }

    // Check if we should stop due to no new elements
    if (this.config.stopOnNoNewElements && this.staleScreenCount >= this.config.maxStaleScreens) {
      logger.info('Stopping exploration: no new elements found', {
        staleCount: this.staleScreenCount,
      });
      return false;
    }

    return true;
  }

  /**
   * Emit progress update
   */
  private emitProgress(): void {
    const progress: ExplorationProgress = {
      sessionId: this.sessionId!,
      status: this.status,
      currentScreenId: this.currentScreenId!,
      screensDiscovered: this.screens.size,
      elementsDiscovered: this.elementDiscovery.getAllDiscoveredElements().length,
      actionsExecuted: this.actionHistory.length,
      edgesDiscovered: this.edges.size,
      currentDepth: this.screens.get(this.currentScreenId ?? '')?.depth ?? 0,
      elapsedTime: Date.now() - (this.startTime ?? 0),
      progressPercent: Math.min(
        100,
        Math.round((this.actionHistory.length / this.config.maxActions) * 100)
      ),
      recentActivity: this.getRecentActivity(),
      currentAction: this.actionHistory.length > 0
        ? this.actionHistory[this.actionHistory.length - 1]?.action
        : undefined,
    };

    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        logger.warn('Progress callback failed', { error });
      }
    }
  }

  /**
   * Get recent activity messages
   */
  private getRecentActivity(): string[] {
    const activities: string[] = [];
    const recentActions = this.actionHistory.slice(-5);

    for (const { action, result } of recentActions) {
      const status = result.success ? '✓' : '✗';
      activities.push(`${status} ${action.type}: ${action.description || action.selector?.value || ''}`);
    }

    return activities;
  }

  /**
   * Get exploration results
   */
  getResults(): ExplorationResult {
    if (!this.sessionId) {
      throw new CoverageExplorerError(
        CoverageExplorerErrorType.SESSION_NOT_FOUND,
        'No exploration session found'
      );
    }

    const screens = Array.from(this.screens.values());
    const elements = this.elementDiscovery.getAllDiscoveredElements();
    const edges = Array.from(this.edges.values());

    // Generate statistics
    const statistics = this.generateStatistics(screens, elements, edges);

    // Generate test suggestions and coverage gaps
    const result: ExplorationResult = {
      sessionId: this.sessionId,
      config: this.config,
      status: this.status,
      screens,
      elements,
      edges,
      actionHistory: this.actionHistory,
      statistics,
      suggestions: [],
      coverageGaps: [],
      startedAt: new Date(this.startTime!),
      endedAt: new Date(),
      duration: Date.now() - (this.startTime || 0),
    };

    // Run coverage analysis
    const analysis = this.coverageAnalyzer.analyzeCoverage(result);
    result.suggestions = analysis.suggestions;
    result.coverageGaps = analysis.gaps;

    return result;
  }

  /**
   * Generate exploration statistics
   */
  private generateStatistics(
    screens: ScreenState[],
    elements: DiscoveredElement[],
    edges: ExplorationEdge[]
  ): any {
    const totalScreens = screens.length;
    const totalElements = elements.length;
    const totalEdges = edges.length;

    const successfulActions = this.actionHistory.filter(a => a.result.success).length;
    const failedActions = this.actionHistory.filter(a => !a.result.success).length;

    const fullyExploredScreens = screens.filter(s => s.fullyExplored).length;
    const partiallyExploredScreens = screens.filter(s => !s.fullyExplored && s.visitCount > 0).length;
    const unexploredScreens = 0; // All discovered screens have been visited

    const maxDepthReached = Math.max(0, ...screens.map(s => s.depth));
    const averageDepth = screens.length > 0
      ? screens.reduce((sum, s) => sum + s.depth, 0) / screens.length
      : 0;

    const mostVisitedScreen = screens.reduce((max, screen) =>
      screen.visitCount > (max?.visitCount || 0) ? screen : max,
      null as ScreenState | null
    );

    // Element type distribution
    const elementTypeDistribution: Record<string, number> = {};
    for (const element of elements) {
      elementTypeDistribution[element.elementType] =
        (elementTypeDistribution[element.elementType] || 0) + 1;
    }

    // Interaction distribution
    const interactionDistribution: Record<string, number> = {};
    for (const screen of screens) {
      for (const element of screen.elements) {
        for (const interaction of element.interactionTypes) {
          interactionDistribution[interaction] =
            (interactionDistribution[interaction] || 0) + 1;
        }
      }
    }

    return {
      totalScreens,
      totalElements,
      totalEdges,
      totalActions: this.actionHistory.length,
      successfulActions,
      failedActions,
      fullyExploredScreens,
      partiallyExploredScreens,
      unexploredScreens,
      maxDepthReached,
      averageDepth: Math.round(averageDepth * 100) / 100,
      mostVisitedScreen: mostVisitedScreen
        ? {
            screenId: mostVisitedScreen.id,
            name: mostVisitedScreen.name,
            visitCount: mostVisitedScreen.visitCount,
          }
        : null,
      elementTypeDistribution,
      interactionDistribution,
    };
  }

  /**
   * Get navigation graph
   */
  getNavigationGraph(): NavigationGraph {
    return {
      nodes: Array.from(this.screens.values()).map(s => ({
        id: s.id,
        name: s.name,
        visitCount: s.visitCount,
        depth: s.depth,
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        id: e.id,
        from: e.fromScreenId,
        to: e.toScreenId,
        label: e.action.description,
        traversalCount: e.traversalCount,
      })),
      entryPoint: Array.from(this.screens.values()).find(s => s.depth === 0)?.id || '',
      exitPoints: Array.from(this.screens.values())
        .filter(s => s.childScreenIds.length === 0)
        .map(s => s.id),
    };
  }

  /**
   * Register progress callback
   */
  onProgress(callback: (progress: ExplorationProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Stop exploration
   */
  stopExploration(): void {
    logger.info('Stopping exploration', { sessionId: this.sessionId });
    this.status = ExplorationStatus.STOPPED;
    this.emitProgress();
  }

  /**
   * Get current status
   */
  getStatus(): ExplorationStatus {
    return this.status;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

/**
 * Create a new coverage explorer
 */
export function createCoverageExplorer(
  driver: ActionDriver,
  actionExecutor: ActionExecutor,
  config?: ExplorationConfig
): CoverageExplorer {
  return new CoverageExplorer(driver, actionExecutor, config);
}
