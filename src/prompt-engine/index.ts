/**
 * Prompt Template Engine
 *
 * A comprehensive template engine for managing and versioning LLM prompts.
 * Supports variable interpolation, few-shot examples, and chain-of-thought
 * prompting patterns for test generation tasks.
 *
 * @example
 * ```ts
 * import { PromptEngine } from './prompt-engine';
 *
 * // Create a simple template
 * const template = PromptEngine.create('Hello, {{name}}!');
 * const result = template.render({ name: 'World' });
 * // => 'Hello, World!'
 *
 * // Use formatters
 * const template2 = PromptEngine.create('Hello, {{name|uppercase}}!');
 * const result2 = template2.render({ name: 'world' });
 * // => 'Hello, WORLD!'
 * ```
 */

// Type definitions
export * from './types.js';

// Core functionality
export { interpolate, compileTemplate, validateContext } from './interpolation.js';

// Parser
export {
  tokenize,
  parseTemplate,
  parseVariableRefs,
  extractVariables,
  validateSyntax,
} from './parser.js';

// Formatters
export {
  builtInFormatters,
  getFormatter,
  hasFormatter,
  getFormatterNames,
  createFormattersRegistry,
} from './formatters.js';

// Registry
export {
  TemplateRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  createTemplate as createTemplateFromRegistry,
  renderTemplate as renderTemplateFromRegistry,
} from './registry.js';

// Patterns
export * from './patterns/index.js';

// Import types for class usage
import type {
  TemplateContext,
  InterpolationOptions,
  CompiledTemplate,
  PromptTemplate,
  TemplateRegistryOptions,
  RenderResult,
  TemplateVersion,
  FewShotExample,
  ChainOfThoughtConfig,
  TemplateVariable,
} from './types.js';
import { compileTemplate as compileTemplateFn, interpolate as interpolateFn } from './interpolation.js';
import { extractVariables as extractVariablesFn, validateSyntax as validateSyntaxFn } from './parser.js';
import { TemplateRegistry } from './registry.js';
import { FewShotBuilder } from './patterns/few-shot.js';
import { ChainOfThoughtBuilder } from './patterns/chain-of-thought.js';

/**
 * Main PromptEngine class for convenient template operations
 */
export class PromptEngine {
  private registry: TemplateRegistry;

  constructor(options?: TemplateRegistryOptions) {
    this.registry = new TemplateRegistry(options);
  }

  /**
   * Create a new template from a string
   */
  static create(
    templateString: string,
    metadata?: {
      name?: string;
      description?: string;
      tags?: string[];
    }
  ): CompiledTemplate {
    return compileTemplateFn(templateString);
  }

  /**
   * Render a template string with context
   */
  static renderTemplate(
    templateString: string,
    context: TemplateContext,
    options?: InterpolationOptions
  ): string {
    return interpolateFn(templateString, context, options).result;
  }

  /**
   * Extract variables from a template string
   */
  static extractVariables(templateString: string): string[] {
    return extractVariablesFn(templateString);
  }

  /**
   * Validate template syntax
   */
  static validate(templateString: string): { valid: boolean; errors: string[] } {
    return validateSyntaxFn(templateString);
  }

  /**
   * Register a template
   */
  register(template: Omit<PromptTemplate, 'id'>): PromptTemplate {
    return this.registry.register(template);
  }

  /**
   * Get a template by ID
   */
  get(id: string): PromptTemplate | undefined {
    return this.registry.get(id);
  }

  /**
   * Get a template by name
   */
  getByName(name: string): PromptTemplate | undefined {
    return this.registry.getByName(name);
  }

  /**
   * List all template IDs
   */
  list(): string[] {
    return this.registry.list();
  }

  /**
   * Render a template by ID
   */
  renderById(
    templateId: string,
    context: TemplateContext,
    options?: InterpolationOptions
  ): RenderResult {
    return this.registry.render(templateId, context, options);
  }

  /**
   * Validate context against a template
   */
  validate(
    templateId: string,
    context: TemplateContext
  ): { valid: boolean; errors: string[]; missing: string[] } {
    return this.registry.validate(templateId, context);
  }

  /**
   * Create a new template
   */
  createTemplate(definition: {
    name: string;
    description?: string;
    tags?: string[];
    template: string;
    variables?: TemplateVariable[];
    examples?: FewShotExample[];
    chainOfThought?: ChainOfThoughtConfig;
    version?: string;
  }): PromptTemplate {
    return this.registry.createTemplate(definition);
  }

  /**
   * Add a version to a template
   */
  addVersion(
    templateId: string,
    version: string,
    versionData: Omit<TemplateVersion, 'version' | 'createdAt'>
  ): PromptTemplate {
    return this.registry.addVersion(templateId, version, versionData);
  }

  /**
   * Switch a template to a specific version
   */
  switchVersion(templateId: string, version: string): PromptTemplate {
    return this.registry.switchVersion(templateId, version);
  }

  /**
   * Get version history for a template
   */
  getVersions(templateId: string): TemplateVersion[] {
    return this.registry.getVersions(templateId);
  }

  /**
   * List templates by tag
   */
  listByTag(tag: string): PromptTemplate[] {
    return this.registry.listByTag(tag);
  }

  /**
   * Delete a template
   */
  delete(id: string): boolean {
    return this.registry.delete(id);
  }

  /**
   * Clear all templates
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Export all templates
   */
  export(): Record<string, unknown> {
    return this.registry.export();
  }

  /**
   * Import templates
   */
  import(data: Record<string, unknown>): void {
    this.registry.import(data);
  }
}

/**
 * Default global PromptEngine instance
 */
export const promptEngine = new PromptEngine();

/**
 * Convenience function for quick template rendering
 */
export function render(
  template: string,
  context: TemplateContext,
  options?: InterpolationOptions
): string {
  return PromptEngine.renderTemplate(template, context, options);
}

/**
 * Convenience function for creating a compiled template
 */
export function compile(
  template: string
): CompiledTemplate {
  return PromptEngine.create(template);
}

/**
 * Convenience function for creating a few-shot builder
 */
export function fewShot(): FewShotBuilder {
  return new FewShotBuilder();
}

/**
 * Convenience function for creating a chain-of-thought builder
 */
export function chainOfThought(): ChainOfThoughtBuilder {
  return new ChainOfThoughtBuilder();
}
