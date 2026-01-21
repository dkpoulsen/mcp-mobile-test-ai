/**
 * Self-Healing Locator Prompts
 * AI prompts for analyzing failed locators and generating alternatives
 */

/**
 * System prompt for locator analysis
 */
export const LOCATOR_ANALYSIS_SYSTEM_PROMPT = `You are an expert test automation engineer specializing in UI element location strategies.
Your task is to analyze failed element locators and suggest alternative ways to find the same element.

You have deep knowledge of:
- CSS selectors and XPath expressions
- Mobile app locators (Accessibility ID, UIAutomator, iOS Predicate)
- HTML structure and DOM traversal
- Common UI patterns and component libraries
- Accessibility attributes (aria-label, role, etc.)

When analyzing a failed locator:
1. Understand the intent behind the original selector
2. Examine the page structure to find the target element
3. Suggest multiple alternative locators with different strategies
4. Rank alternatives by confidence and robustness

Always prioritize:
- IDs and unique attributes over structural selectors
- Accessibility attributes (aria-label, data-testid) over class names
- Stable attributes over dynamic ones
- Text content when other options are unreliable

Provide your response in the following JSON format:
{
  "analysis": "Brief explanation of what likely changed and your approach",
  "alternatives": [
    {
      "type": "css_selector|xpath|id|accessibility_id|text|etc",
      "value": "the selector value",
      "confidence": 0.95,
      "reason": "why this selector should work"
    }
  ]
}

Limit your response to 3-5 best alternatives.`;

/**
 * Prompt for web-based locator analysis
 */
export function createWebLocatorAnalysisPrompt(context: {
  originalLocator: { type: string; value: string };
  errorMessage: string;
  pageSource: string;
  pageUrl?: string;
  action?: string;
  expectedElementType?: string;
}): string {
  const { originalLocator, errorMessage, pageSource, pageUrl, action, expectedElementType } = context;

  // Truncate page source if too long
  const maxSourceLength = 15000;
  const truncatedSource = pageSource.length > maxSourceLength
    ? pageSource.substring(0, maxSourceLength) + '\n\n... (truncated)'
    : pageSource;

  return `I need help finding a UI element that has moved or changed.

**Original Locator (that failed):**
- Type: ${originalLocator.type}
- Value: ${originalLocator.value}

**Error Message:**
${errorMessage}

**Context:**
${pageUrl ? `- Page URL: ${pageUrl}` : ''}
${action ? `- Action: ${action}` : ''}
${expectedElementType ? `- Expected element type: ${expectedElementType}` : ''}

**Current Page Structure:**
\`\`\`html
${truncatedSource}
\`\`\`

Please analyze this and suggest alternative locators to find the element. The element may have:
1. Changed its ID or class
2. Moved to a different location in the DOM
3. Had its attributes modified
4. Been replaced by a similar element

Return ONLY a valid JSON response with your analysis and suggested alternatives.`;
}

/**
 * Prompt for mobile (iOS/Android) locator analysis
 */
export function createMobileLocatorAnalysisPrompt(context: {
  originalLocator: { type: string; value: string };
  errorMessage: string;
  pageSource: string;
  platform: 'ios' | 'android';
  action?: string;
  expectedElementType?: string;
}): string {
  const { originalLocator, errorMessage, pageSource, platform, action, expectedElementType } = context;

  const maxSourceLength = 15000;
  const truncatedSource = pageSource.length > maxSourceLength
    ? pageSource.substring(0, maxSourceLength) + '\n\n... (truncated)'
    : pageSource;

  const platformSpecificHints = platform === 'ios'
    ? `- Consider: iOS Predicates, Class Chains, Accessibility Identifiers
- Common iOS patterns: XCUIElementTypeButton, XCUIElementTypeTextField, etc.`
    : `- Consider: UIAutomator selectors, Resource IDs, Content Descriptions
- Common Android patterns: android.widget.Button, android.widget.EditText, etc.`;

  return `I need help finding a mobile UI element that has moved or changed.

**Platform:** ${platform.toUpperCase()}

**Original Locator (that failed):**
- Type: ${originalLocator.type}
- Value: ${originalLocator.value}

**Error Message:**
${errorMessage}

**Context:**
${action ? `- Action: ${action}` : ''}
${expectedElementType ? `- Expected element type: ${expectedElementType}` : ''}
${platformSpecificHints}

**Current Page/App Source:**
\`\`\`xml
${truncatedSource}
\`\`\`

Please analyze this and suggest alternative mobile-specific locators to find the element.

Return ONLY a valid JSON response with your analysis and suggested alternatives.`;
}

/**
 * Prompt for heuristic locator generation (fallback when AI is unavailable)
 */
export function generateHeuristicLocators(originalLocator: { type: string; value: string }, pageSource: string): Array<{
  type: string;
  value: string;
  confidence: number;
  reason: string;
}> {
  const alternatives: Array<{
    type: string;
    value: string;
    confidence: number;
    reason: string;
  }> = [];

  const { type, value } = originalLocator;

  // Generate heuristic alternatives based on the original locator type
  switch (type.toLowerCase()) {
    case 'id':
      // Try CSS selector with the ID
      alternatives.push({
        type: 'css_selector',
        value: `#${value}`,
        confidence: 0.7,
        reason: 'CSS selector with ID as fallback'
      });
      // Try XPath with ID
      alternatives.push({
        type: 'xpath',
        value: `//*[@id="${value}"]`,
        confidence: 0.65,
        reason: 'XPath with ID attribute'
      });
      break;

    case 'css_selector':
      // Try to convert to XPath
      if (value.startsWith('#')) {
        const id = value.slice(1);
        alternatives.push({
          type: 'id',
          value: id,
          confidence: 0.8,
          reason: 'Direct ID lookup extracted from CSS'
        });
      }
      // Try XPath version
      alternatives.push({
        type: 'xpath',
        value: cssToXPath(value),
        confidence: 0.6,
        reason: 'XPath conversion of CSS selector'
      });
      break;

    case 'xpath':
      // Try to extract text content for text-based locator
      const textMatch = value.match(/text\(\)\s*=\s*['"]([^'"]+)['"]/);
      if (textMatch) {
        alternatives.push({
          type: 'text',
          value: textMatch[1],
          confidence: 0.75,
          reason: 'Text locator extracted from XPath'
        });
      }
      // Try to extract ID
      const idMatch = value.match(/@id\s*=\s*['"]([^'"]+)['"]/);
      if (idMatch) {
        alternatives.push({
          type: 'id',
          value: idMatch[1],
          confidence: 0.8,
          reason: 'ID locator extracted from XPath'
        });
      }
      break;

    case 'text':
      // Try XPath with text
      alternatives.push({
        type: 'xpath',
        value: `//*[text()='${value}']`,
        confidence: 0.7,
        reason: 'XPath with exact text match'
      });
      // Try XPath with contains
      alternatives.push({
        type: 'xpath',
        value: `//*[contains(text(),'${value}')]`,
        confidence: 0.65,
        reason: 'XPath with partial text match'
      });
      break;
  }

  // Add generic text-based search if the value looks like visible text
  if (value.length < 50 && /^[a-zA-Z0-9\s\-_.]+$/.test(value)) {
    alternatives.push({
      type: 'text',
      value: value,
      confidence: 0.5,
      reason: 'Generic text search as last resort'
    });
  }

  return alternatives;
}

/**
 * Simple CSS to XPath converter for heuristic generation
 */
function cssToXPath(css: string): string {
  let xpath = '//';

  // Handle ID selector
  if (css.startsWith('#')) {
    return `//*[@id="${css.slice(1)}"]`;
  }

  // Handle class selector
  if (css.startsWith('.')) {
    return `//*[contains(@class, "${css.slice(1)}")]`;
  }

  // Handle attribute selector
  const attrMatch = css.match(/^\[([^\]]+)\]$/);
  if (attrMatch) {
    const attr = attrMatch[1];
    const [name, ...rest] = attr.split('=');
    if (rest.length > 0) {
      const value = rest.join('=').replace(/['"]/g, '');
      return `//*[@${name}="${value}"]`;
    }
    return `//*[@${name}]`;
  }

  // Handle combined selectors (basic implementation)
  const parts = css.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    if (part.startsWith('#')) {
      xpath += `[@id="${part.slice(1)}"]`;
    } else if (part.startsWith('.')) {
      xpath += `[contains(@class, "${part.slice(1)}")]`;
    } else if (part.startsWith('[')) {
      xpath += part;
    } else if (part !== '>') {
      xpath += `//${part}`;
    }

    if (i < parts.length - 1) {
      xpath += '/';
    }
  }

  return xpath || `//*[@id="${css}"]`;
}

/**
 * Extract element type hint from selector
 */
export function extractElementTypeHint(selector: string): string | undefined {
  const lowerSelector = selector.toLowerCase();

  const buttonPatterns = ['button', 'btn', 'submit', 'click', 'tap'];
  const inputPatterns = ['input', 'field', 'text', 'email', 'password', 'search'];
  const linkPatterns = ['link', 'anchor', 'href'];

  if (buttonPatterns.some(p => lowerSelector.includes(p))) {
    return 'button';
  }
  if (inputPatterns.some(p => lowerSelector.includes(p))) {
    return 'input';
  }
  if (linkPatterns.some(p => lowerSelector.includes(p))) {
    return 'link';
  }

  return undefined;
}
