/**
 * Template Registry for Prompt Template Engine
 * Manages template storage, retrieval, and versioning
 */

import type {
  PromptTemplate,
  TemplateVersion,
  TemplateMetadata,
  TemplateVariable,
  FewShotExample,
  ChainOfThoughtConfig,
  TemplateContext,
  RenderResult,
  InterpolationOptions,
  TemplateRegistryOptions,
} from './types.js';
import {
  PromptTemplateError,
  PromptTemplateErrorType,
} from './types.js';
import { interpolate } from './interpolation.js';
import { formatFewShotExamplesWithContext } from './patterns/few-shot.js';
import { formatChainOfThoughtWithContext } from './patterns/chain-of-thought.js';

/**
 * Generate a unique ID
 */
let idCounter = 0;
function generateId(): string {
  return `tpl_${Date.now()}_${++idCounter}`;
}

/**
 * Template registry class
 */
export class TemplateRegistry {
  private templates: Map<string, PromptTemplate> = new Map();
  private options: TemplateRegistryOptions;

  constructor(options: TemplateRegistryOptions = {}) {
    this.options = {
      maxCacheSize: 100,
      validateByDefault: true,
      defaultInterpolationOptions: {
        strict: false,
        recursive: true,
      },
      ...options,
    };
  }

  /**
   * Register a new template
   */
  register(template: Omit<PromptTemplate, 'id'>): PromptTemplate {
    const id = generateId();
    const fullTemplate: PromptTemplate = {
      ...template,
      id,
    };

    this.templates.set(id, fullTemplate);

    // Enforce cache size limit
    if (this.options.maxCacheSize && this.templates.size > this.options.maxCacheSize) {
      const firstKey = this.templates.keys().next().value;
      if (firstKey) {
        this.templates.delete(firstKey);
      }
    }

    return fullTemplate;
  }

  /**
   * Register a template with a specific ID
   */
  registerWithId(id: string, template: Omit<PromptTemplate, 'id'>): PromptTemplate {
    const fullTemplate: PromptTemplate = {
      ...template,
      id,
    };

    this.templates.set(id, fullTemplate);

    return fullTemplate;
  }

  /**
   * Get a template by ID
   */
  get(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get a template by name
   */
  getByName(name: string): PromptTemplate | undefined {
    const values = Array.from(this.templates.values());
    for (const template of values) {
      if (template.metadata.name === name) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Check if a template exists
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Delete a template
   */
  delete(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * List all template IDs
   */
  list(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * List templates by tag
   */
  listByTag(tag: string): PromptTemplate[] {
    return Array.from(this.templates.values()).filter((template) => {
      return template.metadata.tags?.includes(tag);
    });
  }

  /**
   * Clear all templates
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Get the size of the registry
   */
  size(): number {
    return this.templates.size;
  }

  /**
   * Add a version to an existing template
   */
  addVersion(
    templateId: string,
    version: string,
    versionData: Omit<TemplateVersion, 'version' | 'createdAt'>
  ): PromptTemplate {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    const newVersion: TemplateVersion = {
      ...versionData,
      version,
      createdAt: new Date(),
    };

    template.versions[version] = newVersion;

    return template;
  }

  /**
   * Switch a template to a specific version
   */
  switchVersion(templateId: string, version: string): PromptTemplate {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    const versionData = template.versions[version];

    if (!versionData) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.VERSION_NOT_FOUND,
        `Version not found: ${version}`
      );
    }

    template.version = version;
    template.template = versionData.template;
    template.variables = versionData.variables;
    template.examples = versionData.examples;
    template.chainOfThought = versionData.chainOfThought;

    return template;
  }

  /**
   * Get version history for a template
   */
  getVersions(templateId: string): TemplateVersion[] {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    return Object.values(template.versions).sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true })
    );
  }

  /**
   * Render a template with context
   */
  render(
    templateId: string,
    context: TemplateContext,
    options?: InterpolationOptions
  ): RenderResult {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    const interpolationOptions = {
      ...this.options.defaultInterpolationOptions,
      ...options,
    };

    const warnings: string[] = [];
    const variablesUsed = new Set<string>();

    // Interpolate the main template
    const { result: mainContent, warnings: mainWarnings, variablesUsed: mainVars } =
      interpolate(template.template, context, interpolationOptions);
    warnings.push(...mainWarnings);
    mainVars.forEach((v) => variablesUsed.add(v));

    // Build the full prompt with examples and chain-of-thought
    let fullContent = mainContent;

    // Add few-shot examples if present
    if (template.examples && template.examples.length > 0) {
      const examplesSection = formatFewShotExamplesWithContext(
        template.examples,
        context,
        { interpolationOptions }
      );
      fullContent += examplesSection;
    }

    // Add chain-of-thought if present
    if (template.chainOfThought?.enabled) {
      const cotSection = formatChainOfThoughtWithContext(context, {
        ...template.chainOfThought,
        interpolationOptions,
      });
      fullContent += cotSection;
    }

    return {
      content: fullContent,
      warnings,
      variablesUsed: Array.from(variablesUsed),
      metadata: {
        templateId: template.id,
        templateName: template.metadata.name,
        templateVersion: template.version,
      },
    };
  }

  /**
   * Validate context against a template
   */
  validate(templateId: string, context: TemplateContext): {
    valid: boolean;
    errors: string[];
    missing: string[];
  } {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    const errors: string[] = [];
    const missing: string[] = [];

    // Check required variables
    for (const variable of template.variables) {
      if (variable.required) {
        const value = context[variable.name];
        if (value === undefined || value === null) {
          missing.push(variable.name);
          errors.push(`Missing required variable: "${variable.name}"`);
        } else if (variable.validation) {
          const validationResult = variable.validation(value);
          if (validationResult !== true) {
            const errorMsg =
              typeof validationResult === 'string'
                ? validationResult
                : `Validation failed for variable: "${variable.name}"`;
            errors.push(errorMsg);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      missing,
    };
  }

  /**
   * Create a new template from a simple definition
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
    const now = new Date();
    const version = definition.version || '1.0.0';

    const metadata: TemplateMetadata = {
      name: definition.name,
      description: definition.description,
      tags: definition.tags,
      createdAt: now,
      updatedAt: now,
    };

    const versionData: TemplateVersion = {
      version,
      description: `Initial version`,
      template: definition.template,
      variables: definition.variables || [],
      examples: definition.examples,
      chainOfThought: definition.chainOfThought,
      createdAt: now,
    };

    return this.register({
      metadata,
      version,
      versions: {
        [version]: versionData,
      },
      template: definition.template,
      variables: definition.variables || [],
      examples: definition.examples,
      chainOfThought: definition.chainOfThought,
    });
  }

  /**
   * Update an existing template and create a new version
   */
  updateTemplate(
    templateId: string,
    updates: Partial<{
      template: string;
      variables: TemplateVariable[];
      examples: FewShotExample[];
      chainOfThought: ChainOfThoughtConfig;
      description: string;
      tags: string[];
    }>,
    newVersion?: string
  ): PromptTemplate {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.TEMPLATE_NOT_FOUND,
        `Template not found: ${templateId}`
      );
    }

    // Generate new version if not provided
    let version = newVersion;
    if (!version) {
      const current = template.version;
      const parts = current.split('.');
      if (parts.length === 3) {
        parts[2] = String(parseInt(parts[2], 10) + 1);
        version = parts.join('.');
      } else {
        version = `${current}.1`;
      }
    }

    const updatedTemplate: Partial<PromptTemplate> = {
      template: updates.template || template.template,
      variables: updates.variables || template.variables,
      examples: updates.examples !== undefined ? updates.examples : template.examples,
      chainOfThought:
        updates.chainOfThought !== undefined
          ? updates.chainOfThought
          : template.chainOfThought,
    };

    // Update metadata
    if (updates.description || updates.tags) {
      template.metadata.description = updates.description || template.metadata.description;
      template.metadata.tags = updates.tags || template.metadata.tags;
      template.metadata.updatedAt = new Date();
    }

    // Add new version
    this.addVersion(templateId, version, {
      template: updatedTemplate.template!,
      variables: updatedTemplate.variables!,
      examples: updatedTemplate.examples,
      chainOfThought: updatedTemplate.chainOfThought,
      description: `Updated version`,
    });

    // Switch to new version
    return this.switchVersion(templateId, version);
  }

  /**
   * Export all templates as JSON
   */
  export(): Record<string, unknown> {
    const exported: Record<string, unknown> = {};

    const entries = Array.from(this.templates.entries());
    for (const [id, template] of entries) {
      exported[id] = JSON.parse(JSON.stringify(template));
    }

    return exported;
  }

  /**
   * Import templates from JSON
   */
  import(data: Record<string, unknown>): void {
    for (const [id, templateData] of Object.entries(data)) {
      try {
        const template = templateData as PromptTemplate;
        this.templates.set(id, template);
      } catch (error) {
        throw new PromptTemplateError(
          PromptTemplateErrorType.SYNTAX_ERROR,
          `Failed to import template: ${id}`,
          id,
          error
        );
      }
    }
  }
}

/**
 * Default global template registry instance
 */
let defaultRegistry: TemplateRegistry | undefined;

/**
 * Get the default template registry
 */
export function getDefaultRegistry(): TemplateRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new TemplateRegistry();
  }
  return defaultRegistry;
}

/**
 * Reset the default registry
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = undefined;
}

/**
 * Create a template from a simple string
 */
export function createTemplate(
  templateString: string,
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  }
): PromptTemplate {
  const registry = getDefaultRegistry();
  return registry.createTemplate({
    name: metadata?.name || 'Unnamed Template',
    description: metadata?.description,
    tags: metadata?.tags,
    template: templateString,
    variables: [],
  });
}

/**
 * Quick render function for string templates
 */
export function renderTemplate(
  templateString: string,
  context: TemplateContext,
  options?: InterpolationOptions
): string {
  const { result } = interpolate(templateString, context, options);
  return result;
}
