/**
 * Template Parser for Prompt Template Engine
 * Parses template strings and extracts variables, formatters, and structure
 */

import type { TemplateVariable, InterpolationOptions } from './types.js';
import { PromptTemplateError, PromptTemplateErrorType } from './types.js';

/**
 * Parsed token types
 */
enum TokenType {
  TEXT = 'TEXT',
  VARIABLE = 'VARIABLE',
  COMMENT = 'COMMENT',
}

/**
 * Parsed token
 */
interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Variable reference with optional formatters
 */
interface VariableRef {
  /**
   * Full variable reference string
   */
  full: string;

  /**
   * Variable name
   */
  name: string;

  /**
   * Formatter chain (array of formatter names and their args)
   */
  formatters: Array<{ name: string; args: string[] }>;

  /**
   * Position in template
   */
  position: number;
}

/**
 * Parser configuration
 */
interface ParserConfig {
  /**
   * Left delimiter for variables
   */
  leftDelimiter: string;

  /**
   * Right delimiter for variables
   */
  rightDelimiter: string;

  /**
   * Comment delimiter
   */
  commentDelimiter: string;
}

/**
 * Default parser configuration
 */
const DEFAULT_CONFIG: ParserConfig = {
  leftDelimiter: '{{',
  rightDelimiter: '}}',
  commentDelimiter: '#',
};

/**
 * Extract variable references from a template string
 */
export function extractVariables(
  template: string,
  config: ParserConfig = DEFAULT_CONFIG
): string[] {
  const variableRefs = parseVariableRefs(template, config);
  const names = new Set<string>();

  for (const ref of variableRefs) {
    names.add(ref.name);
  }

  return Array.from(names);
}

/**
 * Parse variable references from a template string
 */
export function parseVariableRefs(
  template: string,
  config: ParserConfig = DEFAULT_CONFIG
): VariableRef[] {
  const refs: VariableRef[] = [];
  const { leftDelimiter, rightDelimiter } = config;

  let pos = 0;
  while (pos < template.length) {
    const startPos = template.indexOf(leftDelimiter, pos);
    if (startPos === -1) break;

    const endPos = template.indexOf(rightDelimiter, startPos + leftDelimiter.length);
    if (endPos === -1) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.SYNTAX_ERROR,
        `Unclosed variable delimiter at position ${startPos}`,
        undefined,
        `Found "${leftDelimiter}" but no matching "${rightDelimiter}"`
      );
    }

    const fullRef = template.slice(startPos + leftDelimiter.length, endPos).trim();

    // Skip comments
    if (fullRef.startsWith(config.commentDelimiter)) {
      pos = endPos + rightDelimiter.length;
      continue;
    }

    const parsed = parseVariableRef(fullRef, startPos);
    refs.push(parsed);

    pos = endPos + rightDelimiter.length;
  }

  return refs;
}

/**
 * Parse a single variable reference
 */
function parseVariableRef(ref: string, position: number): VariableRef {
  // Parse formatters: variable|formatter1:arg1,arg2|formatter2
  const parts = ref.split('|');
  const name = parts[0]?.trim() || '';

  if (!name) {
    throw new PromptTemplateError(
      PromptTemplateErrorType.SYNTAX_ERROR,
      `Empty variable name at position ${position}`
    );
  }

  // Validate variable name (alphanumeric, underscore, dot notation)
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) {
    throw new PromptTemplateError(
      PromptTemplateErrorType.SYNTAX_ERROR,
      `Invalid variable name "${name}" at position ${position}`
    );
  }

  const formatters: Array<{ name: string; args: string[] }> = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Parse formatter with optional args: formatter:arg1,arg2
    const colonPos = part.indexOf(':');
    let formatterName: string;
    let args: string[] = [];

    if (colonPos === -1) {
      formatterName = part.trim();
    } else {
      formatterName = part.slice(0, colonPos).trim();
      const argsStr = part.slice(colonPos + 1).trim();
      args = argsStr ? argsStr.split(',').map((a) => a.trim()) : [];
    }

    if (!formatterName) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.SYNTAX_ERROR,
        `Empty formatter name at position ${position}`
      );
    }

    formatters.push({ name: formatterName, args });
  }

  return {
    full: ref,
    name,
    formatters,
    position,
  };
}

/**
 * Tokenize a template string
 */
export function tokenize(template: string, config: ParserConfig = DEFAULT_CONFIG): Token[] {
  const tokens: Token[] = [];
  const { leftDelimiter, rightDelimiter, commentDelimiter } = config;

  let pos = 0;
  let lastTextEnd = 0;

  while (pos < template.length) {
    const startPos = template.indexOf(leftDelimiter, pos);
    if (startPos === -1) {
      // Add remaining text
      if (lastTextEnd < template.length) {
        tokens.push({
          type: TokenType.TEXT,
          value: template.slice(lastTextEnd),
          position: lastTextEnd,
        });
      }
      break;
    }

    // Add text before the delimiter
    if (startPos > lastTextEnd) {
      tokens.push({
        type: TokenType.TEXT,
        value: template.slice(lastTextEnd, startPos),
        position: lastTextEnd,
      });
    }

    const endPos = template.indexOf(rightDelimiter, startPos + leftDelimiter.length);
    if (endPos === -1) {
      throw new PromptTemplateError(
        PromptTemplateErrorType.SYNTAX_ERROR,
        `Unclosed variable delimiter at position ${startPos}`
      );
    }

    const content = template.slice(startPos + leftDelimiter.length, endPos).trim();

    // Check if it's a comment
    if (content.startsWith(commentDelimiter)) {
      tokens.push({
        type: TokenType.COMMENT,
        value: content.slice(commentDelimiter.length).trim(),
        position: startPos,
      });
    } else {
      tokens.push({
        type: TokenType.VARIABLE,
        value: content,
        position: startPos,
      });
    }

    lastTextEnd = endPos + rightDelimiter.length;
    pos = lastTextEnd;
  }

  return tokens;
}

/**
 * Validate template syntax
 */
export function validateSyntax(
  template: string,
  config: ParserConfig = DEFAULT_CONFIG
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const refs = parseVariableRefs(template, config);

    // Check for circular references in variable names (dot notation)
    const seen = new Set<string>();
    for (const ref of refs) {
      if (seen.has(ref.name)) {
        errors.push(`Duplicate variable reference: "${ref.name}"`);
      }
      seen.add(ref.name);
    }

    // Check for unbalanced delimiters
    let openCount = 0;
    let closeCount = 0;
    let pos = 0;

    while (pos < template.length) {
      const openPos = template.indexOf(config.leftDelimiter, pos);
      const closePos = template.indexOf(config.rightDelimiter, pos);

      if (openPos !== -1 && (closePos === -1 || openPos < closePos)) {
        openCount++;
        pos = openPos + config.leftDelimiter.length;
      } else if (closePos !== -1) {
        closeCount++;
        pos = closePos + config.rightDelimiter.length;
      } else {
        break;
      }
    }

    if (openCount !== closeCount) {
      errors.push(
        `Unbalanced delimiters: ${openCount} opening "${config.leftDelimiter}" and ${closeCount} closing "${config.rightDelimiter}"`
      );
    }
  } catch (error) {
    if (error instanceof PromptTemplateError) {
      errors.push(error.message);
    } else {
      errors.push(String(error));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse template and extract structure
 */
export interface ParsedTemplate {
  template: string;
  variables: string[];
  variableRefs: VariableRef[];
  tokens: Token[];
  hasFormatters: boolean;
}

export function parseTemplate(
  template: string,
  config: ParserConfig = DEFAULT_CONFIG
): ParsedTemplate {
  const tokens = tokenize(template, config);
  const variableRefs = parseVariableRefs(template, config);
  const variables = extractVariables(template, config);
  const hasFormatters = variableRefs.some((ref) => ref.formatters.length > 0);

  return {
    template,
    variables,
    variableRefs,
    tokens,
    hasFormatters,
  };
}
