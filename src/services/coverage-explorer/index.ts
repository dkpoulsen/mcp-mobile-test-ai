/**
 * Coverage Explorer Service - Index
 *
 * AI-driven exploration mode that automatically discovers untested app flows
 * and suggests additional test cases to improve coverage.
 */

// Types
export type {
  DiscoveredElement,
  ElementDiscoveryOptions,
  ScreenState,
  ExplorationEdge,
  ExplorationConfig,
  ExplorationProgress,
  ExplorationResult,
  ExplorationStatistics,
  TestCaseSuggestion,
  CoverageGap,
  NavigationGraph,
} from './types.js';

export {
  ExplorationStrategy,
  ExplorationStatus,
  InteractionType,
  CoverageExplorerErrorType,
  CoverageExplorerError,
} from './types.js';

// Main Coverage Explorer
export {
  CoverageExplorer,
  createCoverageExplorer,
} from './coverage-explorer.js';

// Element Discovery
export {
  ElementDiscoveryService,
  createElementDiscoveryService,
} from './element-discovery.js';

// Exploration Strategies
export {
  createExplorationStrategy,
  type IExplorationStrategy,
} from './exploration-strategies.js';

export {
  BFSExplorationStrategy,
  DFSExplorationStrategy,
  RandomExplorationStrategy,
  SmartExplorationStrategy,
} from './exploration-strategies.js';

// Coverage Analyzer
export {
  CoverageAnalyzer,
  createCoverageAnalyzer,
} from './coverage-analyzer.js';
