/**
 * Element Location Service - Index
 *
 * Exports all element location functionality including:
 * - Multiple locator types (ID, XPath, accessibility ID, CSS selector)
 * - Fallback strategies
 * - Timeout handling with exponential backoff
 * - Selector parsing from natural language
 */

// Types
export {
  LocatorType,
  LocatorPriority,
  type LocatorStrategy,
  type ElementLocatorConfig,
  type LocationResult,
  type LocationAttempt,
  type LocationOptions,
  type ParsedSelector,
  type LocationDriver,
  type ElementHandle,
  LocationErrorType,
  ElementLocationError,
} from './types.js';

// Element Locator
export {
  ElementLocator,
  createElementLocator,
} from './element-locator.js';

// Selector Parser
export {
  SelectorParser,
  getSelectorParser,
  parseSelector,
  byId,
  byXPath,
  byAccessibilityId,
  byCss,
  byText,
} from './selector-parser.js';

// Timeout Handler
export {
  TimeoutHandler,
  createTimeoutHandler,
  type TimeoutOptions,
  type TimeoutResult,
} from './timeout-handler.js';

// Fallback Strategy
export {
  FallbackStrategyManager,
  createFallbackManager,
  type FallbackConfig,
  type FallbackResult,
} from './fallback-strategy.js';
