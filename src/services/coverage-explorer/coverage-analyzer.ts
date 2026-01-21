/**
 * Coverage Analyzer
 *
 * Analyzes exploration results to identify coverage gaps and suggest test cases
 */

import type {
  ExplorationResult,
  ScreenState,
  ExplorationEdge,
  TestCaseSuggestion,
  CoverageGap,
} from './types.js';
import { InteractionType } from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('coverage-explorer:coverage-analyzer');

/**
 * Coverage Analyzer class
 */
export class CoverageAnalyzer {
  /**
   * Analyze exploration results and generate test case suggestions
   */
  analyzeCoverage(result: ExplorationResult): {
    suggestions: TestCaseSuggestion[];
    gaps: CoverageGap[];
  } {
    logger.info('Analyzing coverage', {
      sessionId: result.sessionId,
      screens: result.screens.length,
      elements: result.elements.length,
    });

    const gaps = this.identifyCoverageGaps(result);
    const suggestions = this.generateTestCaseSuggestions(result, gaps);

    logger.info('Coverage analysis complete', {
      gapsFound: gaps.length,
      suggestionsGenerated: suggestions.length,
    });

    return { suggestions, gaps };
  }

  /**
   * Identify coverage gaps in exploration results
   */
  private identifyCoverageGaps(result: ExplorationResult): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const { screens, elements } = result;

    // 1. Check for unexplored screens
    const unexploredScreens = screens.filter(s => !s.fullyExplored);
    for (const screen of unexploredScreens) {
      const unexploredCount = screen.elements.filter(
        e => !result.actionHistory.some(a => a.action.selector?.value === e.selector.value)
      ).length;

      if (unexploredCount > 0) {
        gaps.push({
          id: `gap_unexplored_${screen.id}`,
          gapType: 'untested_element',
          description: `Screen "${screen.name || screen.id}" has ${unexploredCount} untested elements`,
          severity: unexploredCount > 5 ? 'high' : 'medium',
          screenIds: [screen.id],
          elementIds: screen.elements
            .filter(e => !result.actionHistory.some(a => a.action.selector?.value === e.selector.value))
            .map(e => e.id),
          suggestions: [
            `Create tests for all interactive elements on screen "${screen.name || screen.id}"`,
            `Verify element state changes after interactions`,
          ],
          addressed: false,
        });
      }
    }

    // 2. Check for missing flows (screens only visited once or never reached deeply)
    const shallowScreens = screens.filter(s => s.depth === 1 && s.visitCount === 1);
    if (shallowScreens.length > 0) {
      gaps.push({
        id: 'gap_shallow_exploration',
        gapType: 'missing_flow',
        description: `${shallowScreens.length} screen(s) only visited once, may contain unexplored flows`,
        severity: 'medium',
        screenIds: shallowScreens.map(s => s.id),
        elementIds: shallowScreens.flatMap(s => s.elements.map(e => e.id)),
        suggestions: [
          'Create tests that navigate deeper into these screens',
          'Test back-and-forth navigation flows',
        ],
        addressed: false,
      });
    }

    // 3. Check for edge cases on forms/inputs
    const inputElements = elements.filter(e => e.elementType === 'input');
    if (inputElements.length > 0) {
      const testedInputs = inputElements.filter(e =>
        result.actionHistory.some(a =>
          a.action.selector?.value === e.selector.value &&
          a.action.type === 'input'
        )
      );

      if (testedInputs.length < inputElements.length) {
        gaps.push({
          id: 'gap_input_edge_cases',
          gapType: 'edge_case',
          description: `${inputElements.length - testedInputs.length} input field(s) need edge case testing`,
          severity: 'high',
          screenIds: [...new Set(inputElements.map(e => e.screenId))],
          elementIds: inputElements.map(e => e.id),
          suggestions: [
            'Test with empty values',
            'Test with very long values',
            'Test with special characters',
            'Test with invalid formats',
            'Test boundary values (min/max)',
          ],
          addressed: false,
        });
      }
    }

    // 4. Check for error scenario coverage
    const errorScenarios = this.identifyMissingErrorScenarios(result);
    gaps.push(...errorScenarios);

    // 5. Check for navigation flow gaps
    const navigationGaps = this.identifyNavigationGaps(result);
    gaps.push(...navigationGaps);

    // 6. Check for toggle/switch state testing
    const toggleElements = elements.filter(e =>
      e.interactionTypes.includes(InteractionType.TOGGLE)
    );
    if (toggleElements.length > 0) {
      const testedToggles = toggleElements.filter(e =>
        result.actionHistory.some(a =>
          a.action.selector?.value === e.selector.value &&
          (a.action.type === 'toggle' || a.action.type === 'tap')
        )
      );

      if (testedToggles.length < toggleElements.length * 2) {
        // Need to test both on and off states
        gaps.push({
          id: 'gap_toggle_states',
          gapType: 'edge_case',
          description: 'Toggle/switch elements need both ON and OFF state testing',
          severity: 'medium',
          screenIds: [...new Set(toggleElements.map(e => e.screenId))],
          elementIds: toggleElements.map(e => e.id),
          suggestions: [
            'Test toggle ON state',
            'Test toggle OFF state',
            'Verify state persistence across navigation',
          ],
          addressed: false,
        });
      }
    }

    return gaps;
  }

  /**
   * Identify missing error scenarios
   */
  private identifyMissingErrorScenarios(result: ExplorationResult): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const { screens } = result;

    // Find login/signup screens that may need error testing
    const loginScreens = screens.filter(s =>
      s.name?.toLowerCase().includes('login') ||
      s.name?.toLowerCase().includes('sign in') ||
      s.elements.some(e =>
        e.text?.toLowerCase().includes('login') ||
        e.text?.toLowerCase().includes('sign in')
      )
    );

    for (const screen of loginScreens) {
      const inputFields = screen.elements.filter(e => e.elementType === 'input');
      if (inputFields.length > 0) {
        gaps.push({
          id: `gap_error_${screen.id}`,
          gapType: 'error_scenario',
          description: `Login screen "${screen.name || screen.id}" needs error scenario testing`,
          severity: 'high',
          screenIds: [screen.id],
          elementIds: inputFields.map(e => e.id),
          suggestions: [
            'Test with invalid credentials',
            'Test with empty fields',
            'Test with malformed email',
            'Test account lockout scenario',
          ],
          addressed: false,
        });
      }
    }

    // Find forms that may need validation testing
    const formScreens = screens.filter(s =>
      s.elements.filter(e => e.elementType === 'input').length >= 2
    );

    for (const screen of formScreens) {
      if (!loginScreens.includes(screen)) {
        gaps.push({
          id: `gap_form_validation_${screen.id}`,
          gapType: 'error_scenario',
          description: `Form on screen "${screen.name || screen.id}" needs validation testing`,
          severity: 'medium',
          screenIds: [screen.id],
          elementIds: screen.elements.filter(e => e.elementType === 'input').map(e => e.id),
          suggestions: [
            'Test form validation with invalid data',
            'Test required field validation',
            'Test field format validation',
          ],
          addressed: false,
        });
      }
    }

    return gaps;
  }

  /**
   * Identify navigation flow gaps
   */
  private identifyNavigationGaps(result: ExplorationResult): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const { screens } = result;

    // Find dead-end screens (no outgoing edges after exploration)
    const deadEndScreens = screens.filter(s =>
      s.childScreenIds.length === 0 &&
      s.elements.some(e => e.interactionTypes.includes(InteractionType.NAVIGATION))
    );

    if (deadEndScreens.length > 0) {
      gaps.push({
        id: 'gap_dead_end_screens',
        gapType: 'missing_flow',
        description: `${deadEndScreens.length} screen(s) appear to be dead ends with unexplored navigation`,
        severity: 'low',
        screenIds: deadEndScreens.map(s => s.id),
        elementIds: deadEndScreens.flatMap(s =>
          s.elements
            .filter(e => e.interactionTypes.includes(InteractionType.NAVIGATION))
            .map(e => e.id)
        ),
        suggestions: [
          'Investigate why navigation elements don\'t lead to new screens',
          'Test if these are terminal screens or navigation is broken',
        ],
        addressed: false,
      });
    }

    // Check for back navigation testing
    const backButtonTests = result.actionHistory.filter(a => a.action.type === 'go_back');
    if (backButtonTests.length === 0 && screens.length > 1) {
      gaps.push({
        id: 'gap_back_navigation',
        gapType: 'missing_flow',
        description: 'No back navigation tests found',
        severity: 'medium',
        screenIds: screens.slice(1).map(s => s.id), // All screens except first
        elementIds: [],
        suggestions: [
          'Test back button functionality',
          'Test state preservation after back navigation',
          'Test deep back navigation (multiple levels)',
        ],
        addressed: false,
      });
    }

    return gaps;
  }

  /**
   * Generate test case suggestions based on exploration results
   */
  private generateTestCaseSuggestions(
    result: ExplorationResult,
    gaps: CoverageGap[]
  ): TestCaseSuggestion[] {
    const suggestions: TestCaseSuggestion[] = [];
    let suggestionCounter = 0;

    // Generate happy path tests
    suggestions.push(...this.generateHappyPathTests(result, suggestionCounter));
    suggestionCounter += suggestions.length;

    // Generate edge case tests
    suggestions.push(...this.generateEdgeCaseTests(result, suggestionCounter));
    suggestionCounter += suggestions.filter(s => s.testType === 'edge_case').length;

    // Generate integration tests
    suggestions.push(...this.generateIntegrationTests(result, suggestionCounter));

    // Generate tests based on gaps
    for (const gap of gaps) {
      if (gap.gapType === 'error_scenario') {
        suggestions.push(this.generateErrorScenarioTest(result, gap, suggestionCounter++));
      }
    }

    return suggestions.filter(s => s !== null) as TestCaseSuggestion[];
  }

  /**
   * Generate happy path test suggestions
   */
  private generateHappyPathTests(
    result: ExplorationResult,
    startId: number
  ): TestCaseSuggestion[] {
    const suggestions: TestCaseSuggestion[] = [];
    const { screens, edges } = result;

    // Find main flows (longest paths from entry)
    const entryScreen = screens.find(s => s.depth === 0);
    if (!entryScreen) return suggestions;

    // Generate test for primary navigation flow
    const primaryPath = this.findPrimaryPath(screens, edges);
    if (primaryPath.length > 1) {
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: 'Primary User Flow - Happy Path',
        description: 'Test the main user journey through the application',
        priority: 'critical',
        steps: primaryPath.map((screen) => ({
          description: `Navigate to and interact with "${screen.name || screen.id}"`,
          expectedOutcome: `Screen "${screen.name || screen.id}" is displayed`,
        })),
        reasoning: 'This is the primary navigation flow that users will most commonly take',
        screenIds: primaryPath.map(s => s.id),
        elementIds: [],
        testType: 'happy_path',
        complexity: primaryPath.length > 5 ? 'complex' : 'moderate',
        automatable: true,
        tags: ['happy-path', 'smoke', 'critical'],
      });
    }

    // Generate test for each major feature/screen
    const majorScreens = screens.filter(s => s.elements.length >= 3);
    for (const screen of majorScreens.slice(0, 5)) {
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: `Verify "${screen.name || screen.id}" Screen Functionality`,
        description: `Test all interactive elements on the ${screen.name || screen.id} screen`,
        priority: screen.depth === 1 ? 'high' : 'medium',
        steps: screen.elements.slice(0, 5).map(element => ({
          description: `Interact with ${element.elementType}: ${element.text || element.id}`,
          expectedOutcome: 'Element interaction completes successfully',
        })),
        reasoning: `Screen has ${screen.elements.length} interactive elements that should be tested`,
        screenIds: [screen.id],
        elementIds: screen.elements.slice(0, 5).map(e => e.id),
        testType: 'happy_path',
        complexity: 'moderate',
        automatable: true,
        tags: ['screen', 'interactive'],
      });
    }

    return suggestions;
  }

  /**
   * Generate edge case test suggestions
   */
  private generateEdgeCaseTests(
    result: ExplorationResult,
    startId: number
  ): TestCaseSuggestion[] {
    const suggestions: TestCaseSuggestion[] = [];
    const { elements, screens } = result;

    // Test empty inputs
    const inputScreens = screens.filter(s =>
      s.elements.some(e => e.elementType === 'input')
    );

    for (const screen of inputScreens) {
      const inputs = screen.elements.filter(e => e.elementType === 'input');
      if (inputs.length > 0) {
        suggestions.push({
          id: `suggestion_${startId++}`,
          title: `Empty Input Test - "${screen.name || screen.id}"`,
          description: 'Test form behavior with empty input fields',
          priority: 'medium',
          steps: [
            {
              description: 'Navigate to form',
              expectedOutcome: 'Form is displayed',
            },
            {
              description: 'Leave all required fields empty and submit',
              expectedOutcome: 'Validation errors are shown for required fields',
            },
          ],
          reasoning: 'Forms should validate required fields and show appropriate errors',
          screenIds: [screen.id],
          elementIds: inputs.map(e => e.id),
          testType: 'edge_case',
          complexity: 'simple',
          automatable: true,
          tags: ['validation', 'edge-case', 'form'],
        });
      }
    }

    // Test special characters in inputs
    for (const screen of inputScreens.slice(0, 3)) {
      const inputs = screen.elements.filter(e => e.elementType === 'input');
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: `Special Character Input Test - "${screen.name || screen.id}"`,
        description: 'Test input fields with special characters',
        priority: 'medium',
        steps: [
          {
            description: 'Enter special characters: !@#$%^&*()_+-=[]{}|;:\'",.<>?/~`',
            expectedOutcome: 'Input is accepted or sanitized appropriately',
          },
        ],
        reasoning: 'Input fields should handle special characters correctly',
        screenIds: [screen.id],
        elementIds: inputs.map(e => e.id),
        testType: 'edge_case',
        complexity: 'simple',
        automatable: true,
        tags: ['validation', 'edge-case', 'input'],
      });
    }

    // Test toggle states
    const toggleElements = elements.filter(e =>
      e.interactionTypes.includes(InteractionType.TOGGLE)
    );

    if (toggleElements.length > 0) {
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: 'Toggle State Test',
        description: 'Test all toggle/switch elements in both ON and OFF states',
        priority: 'medium',
        steps: [
          {
            description: 'For each toggle, verify initial state',
            expectedOutcome: 'Initial state is as expected',
          },
          {
            description: 'Toggle to ON state',
            expectedOutcome: 'Toggle is now ON',
          },
          {
            description: 'Toggle to OFF state',
            expectedOutcome: 'Toggle is now OFF',
          },
        ],
        reasoning: 'Toggle states should be persistent and verifiable',
        screenIds: [...new Set(toggleElements.map(e => e.screenId))],
        elementIds: toggleElements.map(e => e.id),
        testType: 'edge_case',
        complexity: 'moderate',
        automatable: true,
        tags: ['toggle', 'state', 'edge-case'],
      });
    }

    return suggestions;
  }

  /**
   * Generate integration test suggestions
   */
  private generateIntegrationTests(
    result: ExplorationResult,
    startId: number
  ): TestCaseSuggestion[] {
    const suggestions: TestCaseSuggestion[] = [];
    const { screens } = result;

    // Test multi-screen navigation flow
    if (screens.length > 2) {
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: 'Multi-Screen Navigation Flow',
        description: 'Test navigation between multiple screens and state preservation',
        priority: 'high',
        steps: [
          {
            description: 'Navigate from first screen to deepest screen',
            expectedOutcome: 'Each screen transition is successful',
          },
          {
            description: 'Navigate back using back button',
            expectedOutcome: 'Previous screens are restored correctly',
          },
        ],
        reasoning: 'Multi-screen navigation is a core user interaction pattern',
        screenIds: screens.map(s => s.id),
        elementIds: [],
        testType: 'integration',
        complexity: 'moderate',
        automatable: true,
        tags: ['navigation', 'integration', 'flow'],
      });
    }

    // Test cross-screen data flow
    const inputScreens = screens.filter(s =>
      s.elements.some(e => e.elementType === 'input')
    );

    if (inputScreens.length > 1) {
      suggestions.push({
        id: `suggestion_${startId++}`,
        title: 'Cross-Screen Data Flow',
        description: 'Test that data entered on one screen is available on related screens',
        priority: 'high',
        steps: [
          {
            description: 'Enter data on first input screen',
            expectedOutcome: 'Data is accepted',
          },
          {
            description: 'Navigate to related screen',
            expectedOutcome: 'Entered data is reflected or accessible',
          },
        ],
        reasoning: 'Data should flow correctly between related screens',
        screenIds: inputScreens.map(s => s.id),
        elementIds: inputScreens.flatMap(s =>
          s.elements.filter(e => e.elementType === 'input').map(e => e.id)
        ),
        testType: 'integration',
        complexity: 'complex',
        automatable: true,
        tags: ['data-flow', 'integration'],
      });
    }

    return suggestions;
  }

  /**
   * Generate error scenario test from gap
   */
  private generateErrorScenarioTest(
    result: ExplorationResult,
    gap: CoverageGap,
    id: number
  ): TestCaseSuggestion {
    const screen = result.screens.find(s => s.id === gap.screenIds[0]);
    return {
      id: `suggestion_${id}`,
      title: `Error Scenario Test - ${screen?.name || gap.screenIds[0]}`,
      description: gap.description,
      priority: gap.severity === 'critical' ? 'critical' : gap.severity,
      steps: gap.suggestions.map(s => ({
        description: s,
        expectedOutcome: 'Appropriate error message or behavior',
      })),
      reasoning: 'Error scenarios should be tested to ensure proper error handling',
      screenIds: gap.screenIds,
      elementIds: gap.elementIds,
      testType: 'error_handling' as const,
      complexity: 'moderate',
      automatable: true,
      tags: ['error', 'validation', 'negative'],
    };
  }

  /**
   * Find primary path through the app (longest path from entry)
   */
  private findPrimaryPath(screens: ScreenState[], edges: ExplorationEdge[]): ScreenState[] {
    const path: ScreenState[] = [];
    const entryScreen = screens.find(s => s.depth === 0);
    if (!entryScreen) return path;

    path.push(entryScreen);

    // Follow the most-traversed edges
    let currentScreen = entryScreen;
    const visited = new Set<string>([entryScreen.id]);

    for (let i = 0; i < screens.length; i++) {
      // Find outgoing edges from current screen
      const outgoingEdges = edges.filter(e => e.fromScreenId === currentScreen.id);

      if (outgoingEdges.length === 0) break;

      // Sort by traversal count and pick most visited
      outgoingEdges.sort((a, b) => b.traversalCount - a.traversalCount);

      let foundNext = false;
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.toScreenId)) {
          const nextScreen = screens.find(s => s.id === edge.toScreenId);
          if (nextScreen) {
            path.push(nextScreen);
            visited.add(nextScreen.id);
            currentScreen = nextScreen;
            foundNext = true;
            break;
          }
        }
      }

      if (!foundNext) break;
    }

    return path;
  }

  /**
   * Calculate coverage statistics
   */
  calculateCoverageStatistics(result: ExplorationResult): {
    screenCoverage: number;
    elementCoverage: number;
    flowCoverage: number;
    overallCoverage: number;
  } {
    const { screens, elements, edges, actionHistory } = result;

    // Screen coverage: screens visited / total discoverable screens (estimated)
    const screenCoverage = screens.length > 0
      ? (screens.filter(s => s.fullyExplored).length / screens.length) * 100
      : 0;

    // Element coverage: elements interacted with / total elements
    const interactedElements = new Set(
      actionHistory
        .filter(a => a.action.selector)
        .map(a => a.action.selector!.value)
    );
    const elementCoverage = elements.length > 0
      ? (interactedElements.size / elements.length) * 100
      : 0;

    // Flow coverage: edges traversed / potential edges
    const flowCoverage = edges.length > 0
      ? Math.min(100, (edges.filter(e => e.traversalCount > 0).length / edges.length) * 100 * 1.5)
      : 0;

    // Overall coverage: weighted average
    const overallCoverage = (screenCoverage * 0.3 + elementCoverage * 0.4 + flowCoverage * 0.3);

    return {
      screenCoverage: Math.round(screenCoverage),
      elementCoverage: Math.round(elementCoverage),
      flowCoverage: Math.round(flowCoverage),
      overallCoverage: Math.round(overallCoverage),
    };
  }
}

/**
 * Create a new coverage analyzer
 */
export function createCoverageAnalyzer(): CoverageAnalyzer {
  return new CoverageAnalyzer();
}
