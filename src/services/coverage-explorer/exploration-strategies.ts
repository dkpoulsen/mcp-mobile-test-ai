/**
 * Exploration Strategies
 *
 * Implements different exploration strategies for discovering app flows
 */

import type { MobileAction } from '../action-executor/index.js';
import type {
  ScreenState,
  DiscoveredElement,
  ExplorationEdge,
} from './types.js';
import { ExplorationStrategy, InteractionType } from './types.js';

/**
 * Base exploration strategy interface
 */
export interface IExplorationStrategy {
  /** Get the next action to execute based on current state */
  getNextAction(
    currentScreen: ScreenState,
    exploredScreens: Map<string, ScreenState>,
    exploredEdges: Map<string, ExplorationEdge>,
    visitedElements: Set<string>
  ): MobileAction | null;

  /** Mark an element as visited */
  markElementVisited(elementId: string): void;

  /** Reset strategy state */
  reset(): void;
}

/**
 * Queue item for BFS/DFS strategies
 */
interface QueueItem {
  screenId: string;
  elementIndex: number;
  depth: number;
}

/**
 * Breadth-First Exploration Strategy
 * Explores all elements on current screen before moving deeper
 */
export class BFSExplorationStrategy implements IExplorationStrategy {
  private queue: QueueItem[] = [];
  private visitedElements = new Set<string>();
  private visitedScreens = new Set<string>();

  constructor(private maxDepth: number = 10) {}

  getNextAction(
    currentScreen: ScreenState,
    exploredScreens: Map<string, ScreenState>,
    _exploredEdges: Map<string, ExplorationEdge>,
    visitedElements: Set<string>
  ): MobileAction | null {
    // Add current screen to queue if not already visited
    if (!this.visitedScreens.has(currentScreen.id)) {
      this.visitedScreens.add(currentScreen.id);
      this.queue.push({
        screenId: currentScreen.id,
        elementIndex: 0,
        depth: currentScreen.depth,
      });
    }

    // Find next unexplored element
    while (this.queue.length > 0) {
      const item = this.queue[0];
      if (!item) break;

      // Check depth limit
      if (item.depth >= this.maxDepth) {
        this.queue.shift();
        continue;
      }

      const screen = exploredScreens.get(item.screenId);
      if (!screen) {
        this.queue.shift();
        continue;
      }

      // Find next unvisited element on this screen
      while (item.elementIndex < screen.elements.length) {
        const element = screen.elements[item.elementIndex];
        if (!element) break;

        if (!this.visitedElements.has(element.id) && !visitedElements.has(element.id)) {
          // Create action for this element
          const action = this.createActionForElement(element);
          item.elementIndex++;
          return action;
        }

        item.elementIndex++;
      }

      // All elements on this screen explored, add child screens to queue
      for (const childScreenId of screen.childScreenIds) {
        if (!this.visitedScreens.has(childScreenId)) {
          const childScreen = exploredScreens.get(childScreenId);
          if (childScreen) {
            this.queue.push({
              screenId: childScreenId,
              elementIndex: 0,
              depth: childScreen.depth,
            });
            this.visitedScreens.add(childScreenId);
          }
        }
      }

      // Remove current screen from queue
      this.queue.shift();
    }

    return null;
  }

  createActionForElement(element: DiscoveredElement): MobileAction {
    const interaction = element.interactionTypes[0] || InteractionType.TAP;

    const action: MobileAction = {
      id: `explore_${element.id}`,
      type: interaction,
      selector: element.selector,
      description: `Explore ${element.elementType}: ${element.text || element.id}`,
    };

    // Add input config for input fields
    if (interaction === InteractionType.INPUT) {
      action.type = 'input';
      action.inputConfig = {
        text: this.generateTestData(element),
        clearFirst: true,
      };
    }

    return action;
  }

  generateTestData(element: DiscoveredElement): string {
    const elementType = element.elementType;
    const attributes = element.attributes || {};

    if (elementType === 'input') {
      const inputType = String(attributes.type ?? 'text');

      switch (inputType) {
        case 'email':
          return 'test@example.com';
        case 'password':
          return 'TestPassword123!';
        case 'tel':
        case 'phone':
          return '1234567890';
        case 'number':
          return '42';
        case 'date':
          return '2024-01-15';
        default: {
          const name = String(attributes.name ?? '');
          if (name.toLowerCase().includes('email')) {
            return 'test@example.com';
          }
          if (name.toLowerCase().includes('password')) {
            return 'TestPassword123!';
          }
          if (name.toLowerCase().includes('phone')) {
            return '1234567890';
          }
          return 'Test Input';
        }
      }
    }

    return 'Test';
  }

  markElementVisited(elementId: string): void {
    this.visitedElements.add(elementId);
  }

  reset(): void {
    this.queue = [];
    this.visitedElements.clear();
    this.visitedScreens.clear();
  }
}

/**
 * Depth-First Exploration Strategy
 * Goes as deep as possible before backtracking
 */
export class DFSExplorationStrategy implements IExplorationStrategy {
  private stack: QueueItem[] = [];
  private visitedElements = new Set<string>();
  private visitedScreens = new Set<string>();
  private currentElementIndex = 0;

  constructor(private maxDepth: number = 10) {}

  getNextAction(
    currentScreen: ScreenState,
    exploredScreens: Map<string, ScreenState>,
    _exploredEdges: Map<string, ExplorationEdge>,
    visitedElements: Set<string>
  ): MobileAction | null {
    // Initialize or update current screen tracking
    if (!this.visitedScreens.has(currentScreen.id)) {
      this.visitedScreens.add(currentScreen.id);
      this.stack.push({
        screenId: currentScreen.id,
        elementIndex: 0,
        depth: currentScreen.depth,
      });
      this.currentElementIndex = 0;
    }

    // Try to find an unvisited element on current path
    while (this.stack.length > 0) {
      const currentItem = this.stack[this.stack.length - 1];
      if (!currentItem) break;

      // Check depth limit
      if (currentItem.depth >= this.maxDepth) {
        this.stack.pop();
        this.currentElementIndex = 0;
        continue;
      }

      const screen = exploredScreens.get(currentItem.screenId);
      if (!screen) {
        this.stack.pop();
        this.currentElementIndex = 0;
        continue;
      }

      // Find next unvisited element
      while (this.currentElementIndex < screen.elements.length) {
        const element = screen.elements[this.currentElementIndex];
        if (!element) break;

        if (!this.visitedElements.has(element.id) && !visitedElements.has(element.id)) {
          const action = this.createActionForElement(element);
          this.currentElementIndex++;
          return action;
        }

        this.currentElementIndex++;
      }

      // All elements explored, try to go deeper via child screens
      let foundChild = false;
      for (const childScreenId of screen.childScreenIds) {
        if (!this.visitedScreens.has(childScreenId)) {
          const childScreen = exploredScreens.get(childScreenId);
          if (childScreen && childScreen.depth <= this.maxDepth) {
            this.stack.push({
              screenId: childScreenId,
              elementIndex: 0,
              depth: childScreen.depth,
            });
            this.visitedScreens.add(childScreenId);
            this.currentElementIndex = 0;
            foundChild = true;
            break;
          }
        }
      }

      // No more unexplored children, backtrack
      if (!foundChild) {
        this.stack.pop();
        this.currentElementIndex = 0;
      }
    }

    return null;
  }

  createActionForElement(element: DiscoveredElement): MobileAction {
    const interaction = element.interactionTypes[0] || InteractionType.TAP;

    const action: MobileAction = {
      id: `explore_${element.id}`,
      type: interaction,
      selector: element.selector,
      description: `Explore ${element.elementType}: ${element.text || element.id}`,
    };

    if (interaction === InteractionType.INPUT) {
      action.type = 'input';
      action.inputConfig = {
        text: this.generateTestData(element),
        clearFirst: true,
      };
    }

    return action;
  }

  generateTestData(element: DiscoveredElement): string {
    const elementType = element.elementType;
    const attributes = element.attributes || {};

    if (elementType === 'input') {
      const inputType = String(attributes.type ?? 'text');

      switch (inputType) {
        case 'email':
          return 'test@example.com';
        case 'password':
          return 'TestPassword123!';
        case 'tel':
        case 'phone':
          return '1234567890';
        case 'number':
          return '42';
        default: {
          const name = String(attributes.name ?? '');
          if (name.toLowerCase().includes('email')) {
            return 'test@example.com';
          }
          if (name.toLowerCase().includes('password')) {
            return 'TestPassword123!';
          }
          return 'Test Input';
        }
      }
    }

    return 'Test';
  }

  markElementVisited(elementId: string): void {
    this.visitedElements.add(elementId);
  }

  reset(): void {
    this.stack = [];
    this.visitedElements.clear();
    this.visitedScreens.clear();
    this.currentElementIndex = 0;
  }
}

/**
 * Random Exploration Strategy
 * Picks random unexplored elements
 */
export class RandomExplorationStrategy implements IExplorationStrategy {
  private visitedElements = new Set<string>();
  private randomSeed: number;

  constructor(randomSeed: number = Date.now()) {
    this.randomSeed = randomSeed;
  }

  getNextAction(
    _currentScreen: ScreenState,
    exploredScreens: Map<string, ScreenState>,
    _exploredEdges: Map<string, ExplorationEdge>,
    visitedElements: Set<string>
  ): MobileAction | null {
    // Collect all unvisited elements across all screens
    const unvisitedElements: Array<{ element: DiscoveredElement; screenId: string }> = [];

    for (const [screenId, screen] of exploredScreens) {
      for (const element of screen.elements) {
        if (!this.visitedElements.has(element.id) && !visitedElements.has(element.id)) {
          unvisitedElements.push({ element, screenId });
        }
      }
    }

    if (unvisitedElements.length === 0) {
      return null;
    }

    // Pick random element
    const randomIndex = this.seededRandom(unvisitedElements.length);
    const selectedItem = unvisitedElements[randomIndex] ?? unvisitedElements[0];
    const element = selectedItem?.element;

    if (!element) {
      return null;
    }

    return this.createActionForElement(element);
  }

  seededRandom(max: number): number {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return Math.floor((this.randomSeed / 233280) * max);
  }

  createActionForElement(element: DiscoveredElement): MobileAction {
    const interaction = element.interactionTypes[0] || InteractionType.TAP;

    const action: MobileAction = {
      id: `explore_${element.id}`,
      type: interaction,
      selector: element.selector,
      description: `Explore ${element.elementType}: ${element.text || element.id}`,
    };

    if (interaction === InteractionType.INPUT) {
      action.type = 'input';
      action.inputConfig = {
        text: this.generateTestData(element),
        clearFirst: true,
      };
    }

    return action;
  }

  generateTestData(element: DiscoveredElement): string {
    const elementType = element.elementType;
    const attributes = element.attributes || {};

    if (elementType === 'input') {
      const inputType = String(attributes.type ?? 'text');

      switch (inputType) {
        case 'email':
          return 'test@example.com';
        case 'password':
          return 'TestPassword123!';
        case 'tel':
        case 'phone':
          return '1234567890';
        case 'number':
          return '42';
        default: {
          const name = String(attributes.name ?? '');
          if (name.toLowerCase().includes('email')) {
            return 'test@example.com';
          }
          if (name.toLowerCase().includes('password')) {
            return 'TestPassword123!';
          }
          return 'Test Input';
        }
      }
    }

    return 'Test';
  }

  markElementVisited(elementId: string): void {
    this.visitedElements.add(elementId);
  }

  reset(): void {
    this.visitedElements.clear();
    this.randomSeed = Date.now();
  }
}

/**
 * Smart Exploration Strategy
 * Uses heuristics to prioritize interesting elements
 */
export class SmartExplorationStrategy implements IExplorationStrategy {
  private visitedElements = new Set<string>();
  private visitedScreens = new Set<string>();
  private priorityQueue: Array<{ element: DiscoveredElement; screenId: string; priority: number }> = [];
  private currentScreenId: string | null = null;

  constructor(private maxDepth: number = 10) {}

  getNextAction(
    currentScreen: ScreenState,
    exploredScreens: Map<string, ScreenState>,
    _exploredEdges: Map<string, ExplorationEdge>,
    visitedElements: Set<string>
  ): MobileAction | null {
    // Track current screen
    if (this.currentScreenId !== currentScreen.id) {
      this.currentScreenId = currentScreen.id;
      if (!this.visitedScreens.has(currentScreen.id)) {
        this.visitedScreens.add(currentScreen.id);
        this.prioritizeScreenElements(currentScreen);
      }
    }

    // Add elements from newly discovered screens
    for (const [screenId, screen] of exploredScreens) {
      if (!this.visitedScreens.has(screenId)) {
        this.visitedScreens.add(screenId);
        this.prioritizeScreenElements(screen);
      }
    }

    // Get highest priority unvisited element
    while (this.priorityQueue.length > 0) {
      // Sort by priority (descending)
      this.priorityQueue.sort((a, b) => b.priority - a.priority);
      const item = this.priorityQueue.shift();

      if (!item) continue;

      if (!this.visitedElements.has(item.element.id) && !visitedElements.has(item.element.id)) {
        return this.createActionForElement(item.element);
      }
    }

    return null;
  }

  prioritizeScreenElements(screen: ScreenState): void {
    for (const element of screen.elements) {
      const priority = this.calculateElementPriority(element, screen);
      this.priorityQueue.push({
        element,
        screenId: screen.id,
        priority,
      });
    }
  }

  calculateElementPriority(element: DiscoveredElement, screen: ScreenState): number {
    let priority = 50; // Base priority

    // Prioritize buttons and links
    if (element.elementType === 'button') {
      priority += 30;
    } else if (element.elementType === 'link') {
      priority += 25;
    }

    // Prioritize rarely visited screens
    if (screen.visitCount === 1) {
      priority += 20;
    } else if (screen.visitCount === 2) {
      priority += 10;
    }

    // Prioritize elements with specific text patterns
    const text = (element.text || '').toLowerCase();
    const highPriorityPatterns = [
      'submit', 'save', 'continue', 'next', 'confirm', 'done', 'add',
      'create', 'delete', 'remove', 'update', 'edit', 'settings',
    ];
    const lowPriorityPatterns = [
      'cancel', 'back', 'close', 'dismiss', 'help', 'info',
    ];

    for (const pattern of highPriorityPatterns) {
      if (text.includes(pattern)) {
        priority += 15;
        break;
      }
    }

    for (const pattern of lowPriorityPatterns) {
      if (text.includes(pattern)) {
        priority -= 10;
        break;
      }
    }

    // Prioritize unvisited screens
    if (screen.depth < this.maxDepth && screen.childScreenIds.length === 0) {
      // Might lead to new screen
      priority += 10;
    }

    // Penalize elements on deeply visited screens
    if (screen.visitCount > 3) {
      priority -= screen.visitCount * 5;
    }

    return Math.max(0, Math.min(100, priority));
  }

  createActionForElement(element: DiscoveredElement): MobileAction {
    const interaction = element.interactionTypes[0] || InteractionType.TAP;

    const action: MobileAction = {
      id: `explore_${element.id}`,
      type: interaction,
      selector: element.selector,
      description: `Explore ${element.elementType}: ${element.text || element.id}`,
    };

    if (interaction === InteractionType.INPUT) {
      action.type = 'input';
      action.inputConfig = {
        text: this.generateTestData(element),
        clearFirst: true,
      };
    }

    return action;
  }

  generateTestData(element: DiscoveredElement): string {
    const elementType = element.elementType;
    const attributes = element.attributes || {};

    if (elementType === 'input') {
      const inputType = String(attributes.type ?? 'text');

      switch (inputType) {
        case 'email':
          return 'test@example.com';
        case 'password':
          return 'TestPassword123!';
        case 'tel':
        case 'phone':
          return '1234567890';
        case 'number':
          return '42';
        default: {
          const name = String(attributes.name ?? '');
          if (name.toLowerCase().includes('email')) {
            return 'test@example.com';
          }
          if (name.toLowerCase().includes('password')) {
            return 'TestPassword123!';
          }
          return 'Test Input';
        }
      }
    }

    return 'Test';
  }

  markElementVisited(elementId: string): void {
    this.visitedElements.add(elementId);
  }

  reset(): void {
    this.visitedElements.clear();
    this.visitedScreens.clear();
    this.priorityQueue = [];
    this.currentScreenId = null;
  }
}

/**
 * Factory function to create exploration strategy
 */
export function createExplorationStrategy(
  strategy: ExplorationStrategy,
  options?: { maxDepth?: number; randomSeed?: number }
): IExplorationStrategy {
  const maxDepth = options?.maxDepth ?? 10;

  switch (strategy) {
    case ExplorationStrategy.BFS:
      return new BFSExplorationStrategy(maxDepth);
    case ExplorationStrategy.DFS:
      return new DFSExplorationStrategy(maxDepth);
    case ExplorationStrategy.RANDOM:
      return new RandomExplorationStrategy(options?.randomSeed ?? Date.now());
    case ExplorationStrategy.SMART:
      return new SmartExplorationStrategy(maxDepth);
    case ExplorationStrategy.COVERAGE_GUIDED:
      // Coverage-guided is similar to smart but with different priorities
      return new SmartExplorationStrategy(maxDepth);
    default:
      return new BFSExplorationStrategy(maxDepth);
  }
}
