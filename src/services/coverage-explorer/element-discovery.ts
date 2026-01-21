/**
 * Element Discovery Service
 *
 * Discovers and catalogs UI elements during exploration
 */

import type { ActionDriver, ActionSelector } from '../action-executor/index.js';
import type {
  DiscoveredElement,
  ElementDiscoveryOptions,
} from './types.js';
import { InteractionType } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';
import { createHash } from 'crypto';

const logger = createModuleLogger('coverage-explorer:element-discovery');

/**
 * Default element discovery options
 */
const DEFAULT_DISCOVERY_OPTIONS: Required<ElementDiscoveryOptions> = {
  maxElements: 100,
  selectorStrategies: ['id', 'accessibility', 'xpath', 'css', 'text'],
  inferTypes: true,
  detectRelationships: true,
  timeout: 10000,
};

/**
 * Element Discovery Service class
 */
export class ElementDiscoveryService {
  private driver: ActionDriver;
  private options: Required<ElementDiscoveryOptions>;
  private elementCounter = 0;
  private discoveredElements = new Map<string, DiscoveredElement>();

  constructor(driver: ActionDriver, options?: ElementDiscoveryOptions) {
    this.driver = driver;
    this.options = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  }

  /**
   * Discover all elements on the current screen
   */
  async discoverElements(screenId: string): Promise<DiscoveredElement[]> {
    logger.debug('Discovering elements on screen', { screenId });

    const elements: DiscoveredElement[] = [];
    const startTime = Date.now();

    try {
      // Get page source for analysis
      const pageSource = await this.driver.getPageSource();

      // Discover elements using different strategies
      for (const strategy of this.options.selectorStrategies) {
        const strategyElements = await this.discoverElementsByStrategy(
          strategy,
          screenId,
          pageSource
        );
        elements.push(...strategyElements);
      }

      // Deduplicate elements
      const uniqueElements = this.deduplicateElements(elements);

      // Infer element types if enabled
      if (this.options.inferTypes) {
        for (const element of uniqueElements) {
          this.inferElementType(element);
          this.detectInteractionTypes(element);
        }
      }

      // Store discovered elements
      for (const element of uniqueElements) {
        this.discoveredElements.set(element.id, element);
      }

      const duration = Date.now() - startTime;
      logger.info('Element discovery completed', {
        screenId,
        count: uniqueElements.length,
        duration,
      });

      return uniqueElements;
    } catch (error) {
      logger.error('Element discovery failed', { screenId, error });
      return [];
    }
  }

  /**
   * Discover elements using a specific strategy
   */
  private async discoverElementsByStrategy(
    strategy: string,
    screenId: string,
    pageSource: string
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    try {
      switch (strategy) {
        case 'id':
          elements.push(...await this.discoverById(screenId, pageSource));
          break;
        case 'accessibility':
          elements.push(...await this.discoverByAccessibility(screenId, pageSource));
          break;
        case 'xpath':
          elements.push(...await this.discoverByXPath(screenId, pageSource));
          break;
        case 'css':
          elements.push(...await this.discoverByCSS(screenId, pageSource));
          break;
        case 'text':
          elements.push(...await this.discoverByText(screenId, pageSource));
          break;
      }
    } catch (error) {
      logger.debug(`Element discovery failed for strategy: ${strategy}`, { error });
    }

    return elements;
  }

  /**
   * Discover elements by ID
   */
  private async discoverById(screenId: string, pageSource: string): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Parse page source to find elements with IDs
    const idMatches = pageSource.matchAll(/id="([^"]+)"/g);
    const seenIds = new Set<string>();

    for (const match of idMatches) {
      const id = match[1];
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // Skip common non-interactive IDs
      if (this.isNonInteractiveId(id)) continue;

      try {
        const selector: ActionSelector = { type: 'id', value: id };
        const found = await this.driver.findElement(selector);

        if (found) {
          elements.push(await this.createElementFromHandle(selector, found, screenId, 'id'));
        }
      } catch {
        // Element not found or not accessible
      }

      if (elements.length >= this.options.maxElements) break;
    }

    return elements;
  }

  /**
   * Discover elements by accessibility ID
   */
  private async discoverByAccessibility(screenId: string, pageSource: string): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Parse for accessibility labels
    const a11yMatches = pageSource.matchAll(/content-desc="([^"]+)"/g);
    const seenLabels = new Set<string>();

    for (const match of a11yMatches) {
      const label = match[1];
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);

      try {
        const selector: ActionSelector = { type: 'accessibility_id', value: label };
        const found = await this.driver.findElement(selector);

        if (found) {
          elements.push(await this.createElementFromHandle(selector, found, screenId, 'accessibility'));
        }
      } catch {
        // Element not found or not accessible
      }

      if (elements.length >= this.options.maxElements) break;
    }

    return elements;
  }

  /**
   * Discover elements by XPath
   */
  private async discoverByXPath(screenId: string, _pageSource: string): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Common XPath patterns for interactive elements
    const xpathPatterns = [
      '//button',
      '//input',
      '//textarea',
      '//a',
      '//select',
      '//*[contains(@class, "button")]',
      '//*[contains(@class, "btn")]',
      '//*[contains(@role, "button")]',
      '//*[contains(@role, "link")]',
      '//android.widget.Button',
      '//android.widget.EditText',
      '//android.widget.ImageView',
      '//XCUIElementTypeButton',
      '//XCUIElementTypeTextField',
    ];

    for (const xpath of xpathPatterns) {
      if (elements.length >= this.options.maxElements) break;

      try {
        const selector: ActionSelector = { type: 'xpath', value: xpath };
        const found = await this.driver.findElements(selector);

        for (const handle of found) {
          if (elements.length >= this.options.maxElements) break;

          try {
            const isVisible = await handle.isVisible();
            if (isVisible) {
              elements.push(await this.createElementFromHandle(selector, handle, screenId, 'xpath'));
            }
          } catch {
            // Continue with next element
          }
        }
      } catch {
        // XPath not applicable for current platform
      }
    }

    return elements;
  }

  /**
   * Discover elements by CSS selector
   */
  private async discoverByCSS(screenId: string, _pageSource: string): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Common CSS selector patterns
    const cssPatterns = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      'select:not([disabled])',
      '[role="button"]',
      '[onclick]',
    ];

    for (const css of cssPatterns) {
      if (elements.length >= this.options.maxElements) break;

      try {
        const selector: ActionSelector = { type: 'css', value: css };
        const found = await this.driver.findElements(selector);

        for (const handle of found) {
          if (elements.length >= this.options.maxElements) break;

          try {
            const isVisible = await handle.isVisible();
            if (isVisible) {
              elements.push(await this.createElementFromHandle(selector, handle, screenId, 'css'));
            }
          } catch {
            // Continue with next element
          }
        }
      } catch {
        // CSS selector not supported
      }
    }

    return elements;
  }

  /**
   * Discover elements by text content
   */
  private async discoverByText(screenId: string, pageSource: string): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Extract text from page source and create text-based selectors
    const textMatches = pageSource.matchAll(/>([^<]{3,50})</g);
    const seenTexts = new Set<string>();

    for (const match of textMatches) {
      const text = match[1]?.trim();
      if (!text || seenTexts.has(text) || /^\d+$/.test(text)) continue;
      seenTexts.add(text);

      // Only consider actionable text (buttons, links, menu items)
      if (!this.isActionableText(text)) continue;

      try {
        const selector: ActionSelector = { type: 'text', value: text };
        const found = await this.driver.findElement(selector);

        if (found) {
          elements.push(await this.createElementFromHandle(selector, found, screenId, 'text'));
        }
      } catch {
        // Element not found or not accessible
      }

      if (elements.length >= this.options.maxElements) break;
    }

    return elements;
  }

  /**
   * Create a discovered element from an element handle
   */
  private async createElementFromHandle(
    selector: ActionSelector,
    handle: any,
    screenId: string,
    strategy: string
  ): Promise<DiscoveredElement> {
    const elementId = `element_${this.elementCounter++}_${strategy}`;

    let text: string | undefined;
    let visible = false;
    let enabled = false;
    let clickable = false;
    let bounds;

    try {
      text = await handle.getText();
      visible = await handle.isVisible();
      enabled = await handle.isEnabled();
      clickable = await handle.isEnabled(); // approximation

      try {
        bounds = await handle.getBounds();
      } catch {
        // Bounds not available
      }
    } catch {
      // Some properties not available
    }

    return {
      id: elementId,
      selector,
      elementType: 'unknown',
      text: text ?? undefined,
      accessibilityLabel: selector.type === 'accessibility_id' ? selector.value : undefined,
      bounds,
      visible,
      enabled,
      clickable,
      interactionTypes: [],
      screenId,
      confidence: 0.8,
    };
  }

  /**
   * Infer element type from properties
   */
  private inferElementType(element: DiscoveredElement): void {
    const { text, selector, accessibilityLabel } = element;
    const value = selector.value.toLowerCase();
    const label = accessibilityLabel?.toLowerCase() ?? '';

    // Check for button-like elements
    if (
      value.includes('button') ||
      label.includes('button') ||
      selector.type === 'text' && this.isActionableText(text || '')
    ) {
      element.elementType = 'button';
      return;
    }

    // Check for input fields
    if (
      value.includes('input') ||
      value.includes('textfield') ||
      value.includes('edittext') ||
      label.includes('input') ||
      label.includes('field') ||
      label.includes('search')
    ) {
      element.elementType = 'input';
      return;
    }

    // Check for links
    if (
      value.includes('link') ||
      value.includes('href') ||
      label.includes('link')
    ) {
      element.elementType = 'link';
      return;
    }

    // Check for images
    if (
      value.includes('image') ||
      value.includes('img') ||
      value.includes('imageview')
    ) {
      element.elementType = 'image';
      return;
    }

    // Check for switches/toggles
    if (
      value.includes('switch') ||
      value.includes('toggle') ||
      value.includes('checkbox')
    ) {
      element.elementType = 'switch';
      return;
    }

    // Check for dropdowns/selects
    if (
      value.includes('select') ||
      value.includes('dropdown') ||
      value.includes('picker')
    ) {
      element.elementType = 'select';
      return;
    }

    // Default to generic element
    element.elementType = 'generic';
  }

  /**
   * Detect interaction types supported by element
   */
  private detectInteractionTypes(element: DiscoveredElement): void {
    const interactions: InteractionType[] = [];

    switch (element.elementType) {
      case 'button':
      case 'link':
      case 'image':
        interactions.push(InteractionType.TAP);
        if (element.elementType === 'image') {
          interactions.push(InteractionType.LONG_PRESS);
        }
        break;

      case 'input':
        interactions.push(InteractionType.INPUT, InteractionType.TAP);
        break;

      case 'switch':
      case 'select':
        interactions.push(InteractionType.TOGGLE, InteractionType.TAP);
        break;

      case 'generic':
      default:
        if (element.clickable && element.enabled) {
          interactions.push(InteractionType.TAP);
        }
        break;
    }

    // Add navigation capability for certain elements
    if (['button', 'link', 'image'].includes(element.elementType)) {
      interactions.push(InteractionType.NAVIGATION);
    }

    element.interactionTypes = interactions;
  }

  /**
   * Check if an ID is non-interactive
   */
  private isNonInteractiveId(id: string): boolean {
    const nonInteractivePatterns = [
      /^(app|root|main|container|wrapper|layout)$/i,
      /^(.*-)(content|container|wrapper|group)$/i,
    ];

    return nonInteractivePatterns.some(pattern => pattern.test(id));
  }

  /**
   * Check if text is actionable (button/label text)
   */
  private isActionableText(text: string): boolean {
    if (!text || text.length > 50) return false;

    const actionablePatterns = [
      /^(submit|save|cancel|delete|add|edit|close|back|next|previous|login|logout)$/i,
      /^(continue|confirm|done|ok|yes|no)$/i,
      /^(sign|log)\s*(in|out|up)$/i,
      /^.+(\s(button|btn|link))$/i,
    ];

    return actionablePatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Deduplicate elements by comparing selectors
   */
  private deduplicateElements(elements: DiscoveredElement[]): DiscoveredElement[] {
    const unique = new Map<string, DiscoveredElement>();

    for (const element of elements) {
      const key = `${element.selector.type}:${element.selector.value}`;
      if (!unique.has(key)) {
        unique.set(key, element);
      }
    }

    return Array.from(unique.values());
  }

  /**
   * Generate a hash for a screen state (for duplicate detection)
   */
  generateScreenHash(elements: DiscoveredElement[]): string {
    // Create a hash based on element types and text content
    const sortedElements = [...elements].sort((a, b) =>
      (a.text || '').localeCompare(b.text || '')
    );

    const fingerprint = sortedElements
      .map(e => `${e.elementType}:${e.text}:${e.selector.value}`)
      .join('|');

    return createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get all discovered elements
   */
  getAllDiscoveredElements(): DiscoveredElement[] {
    return Array.from(this.discoveredElements.values());
  }

  /**
   * Reset discovered elements
   */
  resetDiscoveredElements(): void {
    this.discoveredElements.clear();
    this.elementCounter = 0;
  }
}

/**
 * Create a new element discovery service
 */
export function createElementDiscoveryService(
  driver: ActionDriver,
  options?: ElementDiscoveryOptions
): ElementDiscoveryService {
  return new ElementDiscoveryService(driver, options);
}
