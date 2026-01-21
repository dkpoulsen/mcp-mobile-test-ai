/**
 * Chain-of-Thought Prompting Pattern for Prompt Templates
 * Implements structured reasoning prompts for better LLM outputs
 */

import type {
  ThoughtStep,
  ChainOfThoughtConfig,
  TemplateContext,
  InterpolationOptions,
} from '../types.js';
import { interpolate } from '../interpolation.js';

/**
 * Format options for chain-of-thought prompting
 */
export interface ChainOfThoughtFormatOptions {
  /**
   * Enable or disable chain-of-thought
   */
  enabled?: boolean;

  /**
   * Prefix for the thinking section
   */
  prefix?: string;

  /**
   * Suffix for the thinking section
   */
  suffix?: string;

  /**
   * Separator between thought steps
   */
  separator?: string;

  /**
   * Format string for each thought step
   */
  stepFormat?: string;

  /**
   * Include step numbers
   */
  numbered?: boolean;

  /**
   * Include a summary section
   */
  includeSummary?: boolean;

  /**
   * Format for the summary section
   */
  summaryFormat?: string;

  /**
   * Pre-defined thought steps to include
   */
  steps?: ThoughtStep[];

  /**
   * Interpolation options for variable substitution
   */
  interpolationOptions?: InterpolationOptions;
}

/**
 * Default chain-of-thought format options
 */
const DEFAULT_OPTIONS: ChainOfThoughtFormatOptions = {
  enabled: true,
  prefix: '\nLet\'s think through this step by step:\n',
  suffix: '\n',
  separator: '\n',
  stepFormat: '{{thought}}',
  numbered: true,
  includeSummary: true,
  summaryFormat: '\nBased on the above reasoning, the answer is:\n',
};

/**
 * Format a single thought step
 */
function formatThoughtStep(
  step: ThoughtStep,
  index: number,
  options: ChainOfThoughtFormatOptions
): string {
  let result = options.stepFormat || DEFAULT_OPTIONS.stepFormat!;

  // Replace placeholders
  result = result.replace(/\{\{thought\}\}/g, step.thought);

  if (step.action) {
    result = result.replace(/\{\{action\}\}/g, `Action: ${step.action}`);
  } else {
    result = result.replace(/\{\{action\}\}/g, '');
  }

  if (step.result) {
    result = result.replace(/\{\{result\}\}/g, `Result: ${step.result}`);
  } else {
    result = result.replace(/\{\{result\}\}/g, '');
  }

  // Add step number if requested
  if (options.numbered) {
    result = `${index + 1}. ${result}`;
  }

  return result;
}

/**
 * Format chain-of-thought steps into a prompt section
 */
export function formatChainOfThought(
  options: ChainOfThoughtFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!opts.enabled || !opts.steps || opts.steps.length === 0) {
    return '';
  }

  // Format each step
  const formattedSteps = opts.steps.map((step, index) =>
    formatThoughtStep(step, index, opts)
  );

  // Combine with prefix, suffix, and separator
  const parts: string[] = [];

  if (opts.prefix) {
    parts.push(opts.prefix);
  }

  parts.push(formattedSteps.join(opts.separator || '\n'));

  // Add summary if requested
  if (opts.includeSummary) {
    const summaryFormat = opts.summaryFormat || DEFAULT_OPTIONS.summaryFormat!;
    parts.push(summaryFormat);
  }

  if (opts.suffix) {
    parts.push(opts.suffix);
  }

  return parts.join('');
}

/**
 * Format chain-of-thought with variable interpolation
 */
export function formatChainOfThoughtWithContext(
  context: TemplateContext,
  options: ChainOfThoughtFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!opts.enabled || !opts.steps || opts.steps.length === 0) {
    return '';
  }

  // Interpolate variables in step content
  const interpolatedSteps = opts.steps.map((step) => ({
    ...step,
    thought: interpolate(step.thought, context, opts.interpolationOptions).result,
    action: step.action
      ? interpolate(step.action, context, opts.interpolationOptions).result
      : undefined,
    result: step.result
      ? interpolate(step.result, context, opts.interpolationOptions).result
      : undefined,
  }));

  return formatChainOfThought({
    ...opts,
    steps: interpolatedSteps,
  });
}

/**
 * Chain-of-thought builder for constructing reasoning prompts
 */
export class ChainOfThoughtBuilder {
  private steps: ThoughtStep[] = [];
  private options: ChainOfThoughtFormatOptions = {};

  /**
   * Add a thought step
   */
  addThought(thought: string, action?: string, result?: string): this {
    this.steps.push({ thought, action, result });
    return this;
  }

  /**
   * Add a thought step object
   */
  addStep(step: ThoughtStep): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Add multiple thought steps
   */
  addSteps(steps: ThoughtStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  /**
   * Set format options
   */
  setOptions(options: Partial<ChainOfThoughtFormatOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Clear all steps
   */
  clear(): this {
    this.steps = [];
    return this;
  }

  /**
   * Get the number of steps
   */
  count(): number {
    return this.steps.length;
  }

  /**
   * Format the chain-of-thought prompt
   */
  format(context?: TemplateContext): string {
    if (context) {
      return formatChainOfThoughtWithContext(context, {
        ...this.options,
        steps: this.steps,
      });
    }
    return formatChainOfThought({
      ...this.options,
      steps: this.steps,
    });
  }
}

/**
 * Predefined chain-of-thought templates
 */
export const ChainOfThoughtTemplates = {
  /**
   * Test generation template - guides LLM through test creation
   */
  testGeneration: (testType: string): ChainOfThoughtFormatOptions => ({
    enabled: true,
    prefix: `\nLet's generate ${testType} tests step by step:\n`,
    stepFormat: '{{thought}}',
    separator: '\n',
    numbered: true,
    includeSummary: true,
    summaryFormat: '\nNow, generate the final test code based on the above analysis:\n',
    steps: [
      {
        thought: `First, identify the requirements and expected behavior for the ${testType}`,
      },
      {
        thought: 'Next, determine the test setup and initial conditions',
      },
      {
        thought: 'Then, define the test actions or inputs',
      },
      {
        thought: 'Finally, specify the expected assertions and outcomes',
      },
    ],
  }),

  /**
   * Debugging template - guides through systematic debugging
   */
  debugging: {
    enabled: true,
    prefix: '\nLet\'s debug this issue systematically:\n',
    stepFormat: '{{thought}}',
    separator: '\n',
    numbered: true,
    includeSummary: true,
    summaryFormat: '\nBased on this analysis, here\'s the solution:\n',
    steps: [
      { thought: 'Identify the symptoms of the error' },
      { thought: 'Analyze the error message or stack trace' },
      { thought: 'Examine the relevant code sections' },
      { thought: 'Formulate a hypothesis about the root cause' },
      { thought: 'Propose a fix and verify it addresses the issue' },
    ],
  } as ChainOfThoughtFormatOptions,

  /**
   * Code review template - guides through code analysis
   */
  codeReview: {
    enabled: true,
    prefix: '\nLet\'s review this code systematically:\n',
    stepFormat: '{{thought}}',
    separator: '\n',
    numbered: true,
    includeSummary: true,
    summaryFormat: '\nSummary of findings:\n',
    steps: [
      { thought: 'Check for correct syntax and structure' },
      { thought: 'Verify proper error handling' },
      { thought: 'Assess code readability and maintainability' },
      { thought: 'Identify potential security issues' },
      { thought: 'Check for performance optimizations' },
      { thought: 'Verify test coverage considerations' },
    ],
  } as ChainOfThoughtFormatOptions,

  /**
   * Problem solving template - general problem breakdown
   */
  problemSolving: {
    enabled: true,
    prefix: '\nLet\'s break down this problem:\n',
    stepFormat: '{{thought}}',
    separator: '\n',
    numbered: true,
    includeSummary: true,
    summaryFormat: '\nConclusion:\n',
    steps: [
      { thought: 'Understand the problem statement' },
      { thought: 'Identify the key constraints and requirements' },
      { thought: 'Explore potential approaches' },
      { thought: 'Evaluate trade-offs of each approach' },
      { thought: 'Select the best solution and justify it' },
    ],
  } as ChainOfThoughtFormatOptions,

  /**
   * Mobile test template - specific to mobile testing
   */
  mobileTest: (platform: 'ios' | 'android'): ChainOfThoughtFormatOptions => ({
    enabled: true,
    prefix: `\nLet's design a ${platform.toUpperCase()} test:\n`,
    stepFormat: '{{thought}}',
    separator: '\n',
    numbered: true,
    includeSummary: true,
    summaryFormat: '\nGenerate the test code:\n',
    steps: [
      { thought: `Identify the ${platform} app elements to interact with` },
      { thought: 'Determine the locator strategy (accessibility ID, XPath, etc.)' },
      { thought: 'Define the test actions (tap, swipe, input, etc.)' },
      { thought: 'Specify expected outcomes and assertions' },
      { thought: 'Handle platform-specific considerations' },
    ],
  }),
};

/**
 * Create a chain-of-thought prompt for test generation
 */
export function createTestGenerationCoT(
  testType: string,
  platform?: 'ios' | 'android'
): string {
  if (platform) {
    const mobileTemplate = ChainOfThoughtTemplates.mobileTest(platform);
    return formatChainOfThought({
      ...mobileTemplate,
      prefix: `\nLet's generate ${testType} tests for ${platform.toUpperCase()}:\n`,
    });
  }

  const genericTemplate = ChainOfThoughtTemplates.testGeneration(testType);
  return formatChainOfThought(genericTemplate);
}

/**
 * Create a chain-of-thought prompt for debugging
 */
export function createDebuggingCoT(issueDescription?: string): string {
  const template = ChainOfThoughtTemplates.debugging;
  const prefix = issueDescription
    ? `\nLet's debug this issue: "${issueDescription}"\n`
    : template.prefix;

  return formatChainOfThought({
    ...template,
    prefix,
  });
}

/**
 * Create a chain-of-thought prompt for code review
 */
export function createCodeReviewCoT(): string {
  return formatChainOfThought(ChainOfThoughtTemplates.codeReview);
}
