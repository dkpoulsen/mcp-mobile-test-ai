/**
 * Few-Shot Examples Pattern for Prompt Templates
 * Manages and formats few-shot learning examples for LLM prompts
 */

import type { FewShotExample, TemplateContext, InterpolationOptions } from '../types.js';
import { interpolate } from '../interpolation.js';

/**
 * Format options for few-shot examples
 */
export interface FewShotFormatOptions {
  /**
   * Prefix for the examples section
   */
  prefix?: string;

  /**
   * Suffix for the examples section
   */
  suffix?: string;

  /**
   * Separator between examples
   */
  separator?: string;

  /**
   * Format string for each example
   * Use {{input}} and {{output}} placeholders
   */
  exampleFormat?: string;

  /**
   * Include example numbers
   */
  numbered?: boolean;

  /**
   * Maximum number of examples to include
   */
  maxExamples?: number;

  /**
   * Shuffle examples before selecting
   */
  shuffle?: boolean;

  /**
   * Interpolation options for variable substitution in examples
   */
  interpolationOptions?: InterpolationOptions;
}

/**
 * Default few-shot format options
 */
const DEFAULT_OPTIONS: FewShotFormatOptions = {
  prefix: '\nHere are some examples:\n',
  suffix: '\n',
  separator: '\n',
  exampleFormat: 'Input: {{input}}\nOutput: {{output}}',
  numbered: true,
  maxExamples: undefined,
  shuffle: false,
};

/**
 * Format a single example
 */
function formatExample(
  example: FewShotExample,
  index: number,
  options: FewShotFormatOptions
): string {
  const format = options.exampleFormat || DEFAULT_OPTIONS.exampleFormat!;

  // Replace {{input}} and {{output}} placeholders
  let result = format.replace(/\{\{input\}\}/g, example.input);
  result = result.replace(/\{\{output\}\}/g, example.output);

  // Add number if requested
  if (options.numbered) {
    result = `Example ${index + 1}:\n${result}`;
  }

  // Add description if present
  if (example.description) {
    result = `// ${example.description}\n${result}`;
  }

  return result;
}

/**
 * Format few-shot examples into a prompt section
 */
export function formatFewShotExamples(
  examples: FewShotExample[],
  options: FewShotFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (examples.length === 0) {
    return '';
  }

  // Limit examples if maxExamples is set
  let selectedExamples = examples;
  if (opts.maxExamples && opts.maxExamples < examples.length) {
    if (opts.shuffle) {
      selectedExamples = shuffleArray([...examples]).slice(0, opts.maxExamples);
    } else {
      selectedExamples = examples.slice(0, opts.maxExamples);
    }
  } else if (opts.shuffle) {
    selectedExamples = shuffleArray([...examples]);
  }

  // Format each example
  const formattedExamples = selectedExamples.map((example, index) =>
    formatExample(example, index, opts)
  );

  // Combine with prefix, suffix, and separator
  const parts: string[] = [];

  if (opts.prefix) {
    parts.push(opts.prefix);
  }

  parts.push(formattedExamples.join(opts.separator || '\n'));

  if (opts.suffix) {
    parts.push(opts.suffix);
  }

  return parts.join('');
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Format few-shot examples with variable interpolation
 */
export function formatFewShotExamplesWithContext(
  examples: FewShotExample[],
  context: TemplateContext,
  options: FewShotFormatOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // First interpolate variables in example content
  const interpolatedExamples = examples.map((example) => ({
    ...example,
    input: interpolate(example.input, context, opts.interpolationOptions).result,
    output: interpolate(example.output, context, opts.interpolationOptions).result,
    description: example.description
      ? interpolate(example.description, context, opts.interpolationOptions).result
      : undefined,
  }));

  return formatFewShotExamples(interpolatedExamples, opts);
}

/**
 * Create a few-shot examples prompt builder
 */
export class FewShotBuilder {
  private examples: FewShotExample[] = [];
  private options: FewShotFormatOptions = {};

  /**
   * Add an example
   */
  addExample(example: FewShotExample): this {
    this.examples.push(example);
    return this;
  }

  /**
   * Add multiple examples
   */
  addExamples(examples: FewShotExample[]): this {
    this.examples.push(...examples);
    return this;
  }

  /**
   * Set format options
   */
  setOptions(options: Partial<FewShotFormatOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Clear all examples
   */
  clear(): this {
    this.examples = [];
    return this;
  }

  /**
   * Get the number of examples
   */
  count(): number {
    return this.examples.length;
  }

  /**
   * Format examples with optional context
   */
  format(context?: TemplateContext): string {
    if (context) {
      return formatFewShotExamplesWithContext(this.examples, context, this.options);
    }
    return formatFewShotExamples(this.examples, this.options);
  }

  /**
   * Get examples by metadata filter
   */
  filterByMetadata(filter: (metadata: Record<string, unknown>) => boolean): FewShotExample[] {
    return this.examples.filter((example) => {
      if (!example.metadata) return false;
      return filter(example.metadata);
    });
  }

  /**
   * Get examples by tag (if metadata.tags exists)
   */
  getByTag(tag: string): FewShotExample[] {
    return this.filterByMetadata((metadata) => {
      const tags = metadata.tags as string[] | undefined;
      return tags ? tags.includes(tag) : false;
    });
  }
}

/**
 * Create a few-shot examples prompt from a template
 */
export interface FewShotTemplate {
  /**
   * Template for the examples section
   */
  template: string;

  /**
   * Variable to use for examples array
   */
  examplesVariable: string;

  /**
   * Format for each example
   */
  exampleFormat: string;
}

/**
 * Format few-shot examples using a template
 */
export function formatFewShotFromTemplate(
  template: FewShotTemplate,
  examples: FewShotExample[],
  context: TemplateContext = {}
): string {
  // Format the examples
  const formattedExamples = examples
    .map((ex, i) => {
      let result = template.exampleFormat;
      result = result.replace(/\{\{input\}\}/g, ex.input);
      result = result.replace(/\{\{output\}\}/g, ex.output);
      result = result.replace(/\{\{index\}\}/g, String(i + 1));
      if (ex.description) {
        result = result.replace(/\{\{description\}\}/g, ex.description);
      }
      return result;
    })
    .join('\n');

  // Add to context and render the template
  const fullContext = {
    ...context,
    [template.examplesVariable]: formattedExamples,
  };

  return template.template.replace(
    new RegExp(`\\{\\{${template.examplesVariable}\\}\\}`, 'g'),
    formattedExamples
  );
}

/**
 * Common few-shot example formats
 */
export const FewShotFormats = {
  /**
   * Standard Input/Output format
   */
  inputOutput: {
    prefix: 'Here are some examples:\n',
    exampleFormat: 'Input: {{input}}\nOutput: {{output}}',
    suffix: '\n',
    separator: '\n',
    numbered: true,
  },

  /**
   * Q&A format
   */
  questionAnswer: {
    prefix: 'Examples:\n',
    exampleFormat: 'Q: {{input}}\nA: {{output}}',
    suffix: '\n',
    separator: '\n\n',
    numbered: false,
  },

  /**
   * Task/Completion format
   */
  taskCompletion: {
    prefix: 'Reference examples:\n',
    exampleFormat: 'Task: {{input}}\nCompletion: {{output}}',
    suffix: '\n',
    separator: '\n---\n',
    numbered: false,
  },

  /**
   * Code format
   */
  code: {
    prefix: 'Code examples:\n',
    exampleFormat: '```{{input}}\n{{output}}\n```',
    suffix: '\n',
    separator: '\n',
    numbered: true,
  },

  /**
   * Test generation format
   */
  testGeneration: {
    prefix: 'Example test cases:\n',
    exampleFormat:
      'Test Case:\n{{input}}\nExpected Result:\n{{output}}',
    suffix: '\n',
    separator: '\n---\n',
    numbered: true,
  },
} as const;
