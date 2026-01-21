/**
 * Selector Parser - Parses natural language and structured selectors
 * into ParsedSelector objects with multiple locator strategies.
 */

import type {
  LocatorStrategy,
  LocatorType,
  ParsedSelector,
} from './types.js';
import { LocatorPriority } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('selector-parser');

/**
 * Patterns for detecting locator types in natural language
 */
const LOCATOR_PATTERNS = {
  id: [
    /id\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/i,
    /#([a-zA-Z0-9_-]+)/,
    /element\s+with\s+id\s+["']?([a-zA-Z0-9_-]+)["']?/i,
  ],

  xpath: [
    /xpath\s*[:=]\s*["']([^"']+)["']/i,
    /\/\/[^\s]+/,
  ],

  accessibility: [
    /accessibility\s*id\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/i,
    /a11y\s*id\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/i,
    /content[- ]?desc\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/i,
  ],

  css: [
    /css\s*[:=]\s*["']([^"']+)["']/i,
    /selector\s*[:=]\s*["']([^"']+)["']/i,
  ],

  text: [
    /text\s*[:=]\s*["']([^"']+)["']/i,
    /button\s+["']([^"']+)["']/i,
    /link\s+["']([^"']+)["']/i,
    /element\s+with\s+text\s+["']([^"']+)["']/i,
  ],

  class: [
    /class\s*[:=]\s*["']?([a-zA-Z0-9_\s-]+)["']?/i,
    /\.([a-zA-Z0-9_-]+)/,
  ],

  name: [
    /name\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/i,
  ],

  tag: [
    /tag\s*[:=]\s*["']?([a-zA-Z0-9]+)["']?/i,
    /<(?![\/])([a-zA-Z0-9]+)/,
  ],
};

/**
 * Selector Parser class
 */
export class SelectorParser {
  /**
   * Parse a selector string into a ParsedSelector with multiple strategies
   */
  parse(input: string): ParsedSelector {
    const trimmed = input.trim();
    const strategies: LocatorStrategy[] = [];
    const fallbacks: LocatorStrategy[] = [];

    logger.debug(
      {
        input: trimmed,
      },
      'Parsing selector'
    );

    // Try structured format first (JSON-like)
    if (this.isStructuredSelector(trimmed)) {
      return this.parseStructuredSelector(trimmed);
    }

    // Parse natural language or mixed format
    const result = this.parseNaturalLanguage(trimmed);

    logger.debug(
      {
        primary: result.strategies.length,
        fallbacks: result.fallbacks?.length,
      },
      'Selector parsed'
    );

    return result;
  }

  /**
   * Parse multiple selectors into an array of ParsedSelector objects
   */
  parseMultiple(inputs: string[]): ParsedSelector[] {
    return inputs.map((input) => this.parse(input));
  }

  /**
   * Create a ParsedSelector from explicit strategies
   */
  fromStrategies(
    strategies: LocatorStrategy[],
    options?: {
      fallbacks?: LocatorStrategy[];
      mustBeVisible?: boolean;
      mustBeClickable?: boolean;
    }
  ): ParsedSelector {
    return {
      strategies,
      fallbacks: options?.fallbacks || [],
      mustBeVisible: options?.mustBeVisible ?? true,
      mustBeClickable: options?.mustBeClickable ?? false,
    };
  }

  /**
   * Create a ParsedSelector from a simple ID
   */
  fromId(id: string, options?: Partial<ParsedSelector>): ParsedSelector {
    return {
      strategies: [
        {
          type: 'id',
          value: id,
          priority: LocatorPriority.CRITICAL,
        },
      ],
      fallbacks: this.generateIdFallbacks(id),
      mustBeVisible: true,
      mustBeClickable: false,
      ...options,
    };
  }

  /**
   * Create a ParsedSelector from an XPath
   */
  fromXPath(xpath: string, options?: Partial<ParsedSelector>): ParsedSelector {
    return {
      strategies: [
        {
          type: 'xpath',
          value: xpath,
          priority: LocatorPriority.CRITICAL,
        },
      ],
      fallbacks: [],
      mustBeVisible: true,
      mustBeClickable: false,
      ...options,
    };
  }

  /**
   * Create a ParsedSelector from an accessibility ID
   */
  fromAccessibilityId(
    accessibilityId: string,
    options?: Partial<ParsedSelector>
  ): ParsedSelector {
    return {
      strategies: [
        {
          type: 'accessibility_id',
          value: accessibilityId,
          priority: LocatorPriority.CRITICAL,
        },
      ],
      fallbacks: this.generateAccessibilityFallbacks(accessibilityId),
      mustBeVisible: true,
      mustBeClickable: false,
      ...options,
    };
  }

  /**
   * Create a ParsedSelector from a CSS selector
   */
  fromCssSelector(
    selector: string,
    options?: Partial<ParsedSelector>
  ): ParsedSelector {
    return {
      strategies: [
        {
          type: 'css_selector',
          value: selector,
          priority: LocatorPriority.CRITICAL,
        },
      ],
      fallbacks: this.generateCssFallbacks(selector),
      mustBeVisible: true,
      mustBeClickable: false,
      ...options,
    };
  }

  /**
   * Create a ParsedSelector from text content
   */
  fromText(text: string, options?: Partial<ParsedSelector>): ParsedSelector {
    return {
      strategies: [
        {
          type: 'text',
          value: text,
          priority: LocatorPriority.HIGH,
        },
      ],
      fallbacks: this.generateTextFallbacks(text),
      mustBeVisible: true,
      mustBeClickable: false,
      ...options,
    };
  }

  /**
   * Check if input is a structured selector (JSON/object format)
   */
  private isStructuredSelector(input: string): boolean {
    return (
      input.startsWith('{') ||
      input.includes('type:') ||
      input.includes('locator:') ||
      input.includes('strategies:')
    );
  }

  /**
   * Parse a structured selector
   */
  private parseStructuredSelector(input: string): ParsedSelector {
    try {
      // Try parsing as JSON first
      if (input.startsWith('{')) {
        const parsed = JSON.parse(input);
        return this.validateParsedSelector(parsed);
      }

      // Parse key-value format (e.g., "type:id, value:submitBtn")
      const parts = input.split(',').map((p) => p.trim());
      const strategies: LocatorStrategy[] = [];
      const typeMatch = parts.find((p) => p.toLowerCase().startsWith('type:'));
      const valueMatch = parts.find((p) => p.toLowerCase().startsWith('value:'));

      if (typeMatch && valueMatch) {
        const type = typeMatch.split(':')[1].trim();
        const value = valueMatch.split(':')[1].trim();

        strategies.push({
          type,
          value,
          priority: LocatorPriority.CRITICAL,
        });
      }

      return {
        strategies,
        fallbacks: [],
        mustBeVisible: true,
      };
    } catch (error) {
      logger.warn(
        {
          error,
          input,
        },
        'Failed to parse structured selector, falling back to natural language'
      );
      return this.parseNaturalLanguage(input);
    }
  }

  /**
   * Parse natural language or mixed format selector
   */
  private parseNaturalLanguage(input: string): ParsedSelector {
    const strategies: LocatorStrategy[] = [];
    const fallbacks: LocatorStrategy[] = [];
    let priority = LocatorPriority.CRITICAL;

    // Try each locator pattern type
    for (const [type, patterns] of Object.entries(LOCATOR_PATTERNS)) {
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          const value = match[1] || match[0];
          strategies.push({
            type: type as LocatorType,
            value,
            priority: priority++,
          });
        }
      }
    }

    // If no patterns matched, treat the entire input as text or CSS
    if (strategies.length === 0) {
      return this.guessSelectorType(input);
    }

    // Ensure we have at least one primary strategy
    const primaryStrategies = strategies.filter((s) => s.priority <= LocatorPriority.MEDIUM);
    const fallbackStrategies = strategies.filter((s) => s.priority > LocatorPriority.MEDIUM);

    return {
      strategies: primaryStrategies.length > 0 ? primaryStrategies : strategies.slice(0, 1),
      fallbacks: fallbackStrategies,
      mustBeVisible: true,
      mustBeClickable: false,
    };
  }

  /**
   * Guess the selector type based on input format
   */
  private guessSelectorType(input: string): ParsedSelector {
    // XPath
    if (input.startsWith('//') || input.startsWith('(//')) {
      return this.fromXPath(input);
    }

    // CSS ID
    if (input.startsWith('#') && !input.includes(' ')) {
      return this.fromId(input.slice(1));
    }

    // CSS class
    if (input.startsWith('.') && !input.includes(' ')) {
      return {
        strategies: [
          {
            type: 'class_name',
            value: input.slice(1),
            priority: LocatorPriority.HIGH,
          },
          {
            type: 'css_selector',
            value: input,
            priority: LocatorPriority.MEDIUM,
          },
        ],
        fallbacks: [],
        mustBeVisible: true,
      };
    }

    // CSS selector with combinators
    if (input.includes(' ') || input.includes('>')) {
      return this.fromCssSelector(input);
    }

    // Default to text content
    return this.fromText(input);
  }

  /**
   * Generate fallback strategies for ID selectors
   */
  private generateIdFallbacks(id: string): LocatorStrategy[] {
    return [
      {
        type: 'css_selector',
        value: `#${id}`,
        priority: LocatorPriority.MEDIUM,
      },
      {
        type: 'name',
        value: id,
        priority: LocatorPriority.LOW,
      },
      {
        type: 'accessibility_id',
        value: id,
        priority: LocatorPriority.FALLBACK,
      },
    ];
  }

  /**
   * Generate fallback strategies for CSS selectors
   */
  private generateCssFallbacks(selector: string): LocatorStrategy[] {
    const fallbacks: LocatorStrategy[] = [];

    // If CSS selector uses ID, add ID strategy
    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      fallbacks.push({
        type: 'id',
        value: idMatch[1],
        priority: LocatorPriority.HIGH,
      });
    }

    // If CSS selector uses class, add class strategy
    const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
    if (classMatch) {
      fallbacks.push({
        type: 'class_name',
        value: classMatch[1],
        priority: LocatorPriority.MEDIUM,
      });
    }

    // Add XPath fallback
    fallbacks.push({
      type: 'xpath',
      value: this.cssToXPath(selector),
      priority: LocatorPriority.LOW,
    });

    return fallbacks;
  }

  /**
   * Generate fallback strategies for accessibility IDs
   */
  private generateAccessibilityFallbacks(accessibilityId: string): LocatorStrategy[] {
    return [
      {
        type: 'id',
        value: accessibilityId,
        priority: LocatorPriority.HIGH,
      },
      {
        type: 'name',
        value: accessibilityId,
        priority: LocatorPriority.MEDIUM,
      },
      {
        type: 'text',
        value: accessibilityId.replace(/_/g, ' '),
        priority: LocatorPriority.LOW,
      },
    ];
  }

  /**
   * Generate fallback strategies for text selectors
   */
  private generateTextFallbacks(text: string): LocatorStrategy[] {
    return [
      {
        type: 'xpath',
        value: `//*[contains(text(), "${text}")]`,
        priority: LocatorPriority.HIGH,
      },
      {
        type: 'accessibility_id',
        value: text.toLowerCase().replace(/\s+/g, '_'),
        priority: LocatorPriority.MEDIUM,
      },
    ];
  }

  /**
   * Convert CSS selector to XPath (basic implementation)
   */
  private cssToXPath(css: string): string {
    // Handle ID selector
    if (css.startsWith('#')) {
      return `//*[@id="${css.slice(1)}"]`;
    }

    // Handle class selector
    if (css.startsWith('.')) {
      return `//*[contains(@class, "${css.slice(1)}")]`;
    }

    // Handle attribute selector
    const attrMatch = css.match(/\[([a-zA-Z-]+)\s*=\s*["']?([^"'\]]+)["']?\]/);
    if (attrMatch) {
      return `//*[@${attrMatch[1]}="${attrMatch[2]}"]`;
    }

    // Default: treat as tag name
    return `//${css}`;
  }

  /**
   * Validate and normalize a parsed selector
   */
  private validateParsedSelector(parsed: unknown): ParsedSelector {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid selector: must be an object');
    }

    const selector = parsed as Record<string, unknown>;

    // Ensure strategies array exists
    if (!Array.isArray(selector.strategies)) {
      throw new Error('Invalid selector: strategies must be an array');
    }

    return {
      strategies: selector.strategies as LocatorStrategy[],
      fallbacks: (selector.fallbacks as LocatorStrategy[]) || [],
      mustBeVisible: (selector.mustBeVisible as boolean) ?? true,
      mustBeClickable: (selector.mustBeClickable as boolean) ?? false,
    };
  }
}

/**
 * Singleton instance of the selector parser
 */
let parserInstance: SelectorParser | null = null;

/**
 * Get the singleton selector parser instance
 */
export function getSelectorParser(): SelectorParser {
  if (!parserInstance) {
    parserInstance = new SelectorParser();
  }
  return parserInstance;
}

/**
 * Parse a selector string into a ParsedSelector
 */
export function parseSelector(input: string): ParsedSelector {
  return getSelectorParser().parse(input);
}

/**
 * Create a ParsedSelector from an ID
 */
export function byId(id: string, options?: Partial<ParsedSelector>): ParsedSelector {
  return getSelectorParser().fromId(id, options);
}

/**
 * Create a ParsedSelector from an XPath
 */
export function byXPath(xpath: string, options?: Partial<ParsedSelector>): ParsedSelector {
  return getSelectorParser().fromXPath(xpath, options);
}

/**
 * Create a ParsedSelector from an accessibility ID
 */
export function byAccessibilityId(
  accessibilityId: string,
  options?: Partial<ParsedSelector>
): ParsedSelector {
  return getSelectorParser().fromAccessibilityId(accessibilityId, options);
}

/**
 * Create a ParsedSelector from a CSS selector
 */
export function byCss(selector: string, options?: Partial<ParsedSelector>): ParsedSelector {
  return getSelectorParser().fromCssSelector(selector, options);
}

/**
 * Create a ParsedSelector from text content
 */
export function byText(text: string, options?: Partial<ParsedSelector>): ParsedSelector {
  return getSelectorParser().fromText(text, options);
}
