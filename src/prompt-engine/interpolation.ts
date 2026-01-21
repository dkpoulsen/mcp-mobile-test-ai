/**
 * Variable Interpolation for Prompt Templates
 * Handles variable substitution and formatter application
 */

import type {
  TemplateContext,
  InterpolationOptions,
  CompiledTemplate,
  ValidationResult,
} from './types.js';
import {
  PromptTemplateError,
  PromptTemplateErrorType,
} from './types.js';
import { parseVariableRefs, extractVariables } from './parser.js';
import { builtInFormatters, createFormattersRegistry } from './formatters.js';

/**
 * Default interpolation options
 */
const DEFAULT_OPTIONS: InterpolationOptions = {
  strict: false,
  formatters: builtInFormatters,
  leftDelimiter: '{{',
  rightDelimiter: '}}',
  recursive: true,
};

/**
 * Get value from context using dot notation
 */
function getContextValue(context: TemplateContext, path: string): unknown {
  if (path in context) {
    return context[path];
  }

  // Support dot notation: user.name
  const parts = path.split('.');
  let value: unknown = context;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Apply formatters to a value
 */
function applyFormatters(
  value: unknown,
  formatterChain: Array<{ name: string; args: string[] }>,
  formatters: Record<string, (value: unknown, ...args: unknown[]) => string>
): string {
  let result: unknown = value;

  for (const formatter of formatterChain) {
    const formatterFn = formatters[formatter.name];

    if (!formatterFn) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.SYNTAX_ERROR,
        `Unknown formatter: "${formatter.name}"`
      );
    }

    try {
      result = formatterFn(result, ...formatter.args);
    } catch (error) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.VALIDATION_ERROR,
        `Error applying formatter "${formatter.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        error
      );
    }
  }

  return String(result);
}

/**
 * Interpolate variables in a template string
 */
export function interpolate(
  template: string,
  context: TemplateContext,
  options: InterpolationOptions = {}
): { result: string; warnings: string[]; variablesUsed: string[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const variablesUsed = new Set<string>();

  const formatters = opts.formatters
    ? createFormattersRegistry(opts.formatters)
    : builtInFormatters;

  const variableRefs = parseVariableRefs(template, {
    leftDelimiter: opts.leftDelimiter || '{{',
    rightDelimiter: opts.rightDelimiter || '}}',
    commentDelimiter: '#',
  });

  let result = template;

  // Process variables in reverse order to maintain position accuracy
  for (let i = variableRefs.length - 1; i >= 0; i--) {
    const ref = variableRefs[i];
    variablesUsed.add(ref.name);

    const value = getContextValue(context, ref.name);

    if (value === undefined) {
      if (opts.strict) {
        throw new PromptTemplateError(
          PromptTemplateErrorType.MISSING_VARIABLE,
          `Required variable "${ref.name}" is not defined in context`
        );
      }
      warnings.push(`Variable "${ref.name}" is not defined`);
      // Replace with empty string
      const placeholder = template.slice(
        ref.position,
        ref.position + ref.full.length + (opts.leftDelimiter?.length || 2) + (opts.rightDelimiter?.length || 2)
      );
      result = result.replace(placeholder, '');
      continue;
    }

    let replacement: string;

    if (ref.formatters.length > 0) {
      replacement = applyFormatters(value, ref.formatters, formatters);
    } else {
      replacement = String(value);
    }

    // Escape special regex characters in the placeholder
    const placeholderPattern = new RegExp(
      `${opts.leftDelimiter}\\s*${ref.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*${opts.rightDelimiter}`,
      'g'
    );
    result = result.replace(placeholderPattern, replacement);
  }

  // Handle recursive interpolation if enabled
  if (opts.recursive && result !== template) {
    // Check if there are still variables to resolve
    const remainingVars = extractVariables(result, {
      leftDelimiter: opts.leftDelimiter || '{{',
      rightDelimiter: opts.rightDelimiter || '}}',
      commentDelimiter: '#',
    });

    if (remainingVars.length > 0) {
      const nestedResult = interpolate(result, context, opts);
      result = nestedResult.result;
      nestedResult.warnings.forEach((w) => warnings.push(w));
      nestedResult.variablesUsed.forEach((v) => variablesUsed.add(v));
    }
  }

  return {
    result,
    warnings,
    variablesUsed: Array.from(variablesUsed),
  };
}

/**
 * Create a compiled template
 */
export function compileTemplate(template: string): CompiledTemplate {
  const variables = extractVariables(template);

  return {
    render: (context: TemplateContext, options?: InterpolationOptions): string => {
      const { result } = interpolate(template, context, options);
      return result;
    },

    validate: (context: TemplateContext): ValidationResult => {
      const errors: string[] = [];
      const missing: string[] = [];
      const invalid: Record<string, string> = {};

      // Check for missing required variables (simple check - all variables in template)
      for (const variable of variables) {
        const value = getContextValue(context, variable);

        if (value === undefined) {
          missing.push(variable);
          errors.push(`Missing required variable: "${variable}"`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        missing,
        invalid,
      };
    },

    getRequiredVariables: (): string[] => {
      return [...variables];
    },

    getAllVariables: (): string[] => {
      return [...variables];
    },

    getSource: (): string => {
      return template;
    },
  };
}

/**
 * Validate template context
 */
export function validateContext(
  template: string,
  context: TemplateContext,
  options?: InterpolationOptions
): ValidationResult {
  const compiled = compileTemplate(template);
  return compiled.validate(context);
}

/**
 * Quick interpolation helper
 */
export function render(
  template: string,
  context: TemplateContext,
  options?: InterpolationOptions
): string {
  return interpolate(template, context, options).result;
}
