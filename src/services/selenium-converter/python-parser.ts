/**
 * Python Selenium Parser
 * Parses Python Selenium test files and extracts test structure
 */

import type {
  ParsedSeleniumTestCase,
  ParsedSeleniumTestSuite,
  ParsedAction,
  ParsedLocator,
  ParsedStep,
  ParsedAssertion,
  LocatorType,
} from './types.js';
import { SeleniumConverterError, ConverterErrorType } from './types.js';

/**
 * Python Selenium patterns for parsing
 */
const PYTHON_PATTERNS = {
  // Test decorators
  testDecorator: /@(?:unittest\.)?test/,
  setUpDecorator: /@(?:unittest\.)?setUp/,
  tearDownDecorator: /@(?:unittest\.)?tearDown/,
  fixtureDecorator: /@pytest\.fixture/,

  // Test function/method
  testFunction: /def\s+(test_\w+)\s*\(\s*self\s*\)\s*:/,
  anyFunction: /def\s+(\w+)\s*\(\s*self\s*(?:,\s*[^)]+)?\)\s*:/,

  // Selenium actions
  get: /(?:self\.|driver\.)?get\s*\(\s*["']([^"']+)["']\s*\)/,
  navigate: /(?:self\.|driver\.)?navigate\s*\(\s*["']([^"']+)["']\s*\)/,

  findElement: /(?:self\.|driver\.)?find_element\s*\(\s*(?:By\.)?(\w+)\s*,\s*["']([^"']+)["']\s*\)/,
  findElements: /(?:self\.|driver\.)?find_elements\s*\(\s*(?:By\.)?(\w+)\s*,\s*["']([^"']+)["']\s*\)/,
  findElementSingleArg: /(?:self\.|driver\.)?find_element\((?:By\.)?(\w+)\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,

  click: /\w+\.click\s*\(\s*\)/,
  submit: /\w+\.submit\s*\(\s*\)/,
  clear: /\w+\.clear\s*\(\s*\)/,

  sendKeys: /\w+\.send_keys\s*\(\s*(?:(?:Keys\.)?(\w+)\s*,\s*)?["']?([^"')\]]*)["']?\s*\)/,

  getText: /\w+\.text\s*(?!\s*=)/,
  getAttribute: /\w+\.get_attribute\s*\(\s*["']([^"']+)["']\s*\)/,

  isDisplayed: /\w+\.is_displayed\s*\(\s*\)/,
  isEnabled: /\w+\.is_enabled\s*\(\s*\)/,
  isSelected: /\w+\.is_selected\s*\(\s*\)/,

  // WebDriverWait patterns
  waitFor: /WebDriverWait\s*\(\s*(?:driver|self)\s*,\s*(\d+)\s*\)\.until\s*/,
  untilExpectedCondition: /EC\.\w+\s*\(/,
  sleep: /time\.sleep\s*\(\s*(\d+(?:\.\d+)?)\s*\)/,
  implicitlyWait: /implicitly_wait\s*\(\s*(\d+)\s*\)/,

  select: /Select\s*\(\s*\w+\s*\)\.select_by_(?:visible_text|value|index)\s*\(\s*["']?([^"')\]]*)["']?\s*\)/,
  deselect: /Select\s*\(\s*\w+\s*\)\.deselect_by_/,

  assertions: {
    assertEqual: /self\.assertEqual\s*\(\s*["']?([^"')\]]*)["']?\s*,\s*(\w+(?:\.\w+)*)\s*\)/,
    assertEquals: /self\.assertEquals\s*\(\s*["']?([^"')\]]*)["']?\s*,\s*(\w+(?:\.\w+)*)\s*\)/,
    assertTrue: /self\.assertTrue\s*\(\s*(\w+(?:\.\w+)*)\s*\)/,
    assertFalse: /self\.assertFalse\s*\(\s*(\w+(?:\.\w+)*)\s*\)/,
    assertIn: /self\.assertIn\s*\(\s*["']([^"']+)["']\s*,\s*(\w+(?:\.\w+)*)\s*\)/,
    // pytest style assertions
    pytestAssert: /assert\s+(\w+)\s*(==|!=|>|<|>=|<=|is|in|not in)\s*(.+)/,
  },

  screenshots: /save_screenshot\s*\(\s*["']([^"']+)["']\s*\)/,

  executeScript: /driver\.execute_script\s*\(\s*["']([^"']+)["']\s*/,

  // Variable assignments
  webElement: /(\w+)\s*=\s*(?:driver|self)\.find_element/,
  stringVar: /(\w+)\s*=\s*["']([^"']+)["']/,

  // Comments
  comment: /#\s*(.*)/,
};

/**
 * By methods mapping to locator types (Python selenium.webdriver.common.by)
 */
const BY_METHODS: Record<string, LocatorType> = {
  ID: 'id',
  NAME: 'name',
  CLASS_NAME: 'className',
  TAG_NAME: 'tagName',
  XPATH: 'xpath',
  CSS_SELECTOR: 'cssSelector',
  LINK_TEXT: 'linkText',
  PARTIAL_LINK_TEXT: 'partialLinkText',
};

/**
 * ExpectedCondition methods in Python
 */
const EC_METHODS = [
  'presence_of_element_located',
  'visibility_of_element_located',
  'element_to_be_clickable',
  'title_contains',
  'title_is',
  'url_contains',
  'url_matches',
  'url_to_be',
  'visibility_of',
  'frame_to_be_available_and_switch_to_it',
  'invisibility_of_element_located',
  'element_located_selection_state_to_be',
  'element_located_to_be_selected',
  'staleness_of',
  'element_to_be_selected',
  'alert_is_present',
];

/**
 * Python Selenium Parser class
 */
export class PythonSeleniumParser {
  /**
   * Parse a Python Selenium test file
   */
  parseFile(content: string, fileName: string): ParsedSeleniumTestSuite {
    const testCases: ParsedSeleniumTestCase[] = [];
    const imports = this.extractImports(content);
    const annotations = this.extractDecorators(content);

    // Extract test methods
    const testMethods = this.extractTestMethods(content);

    for (const method of testMethods) {
      const testCase = this.parseTestMethod(method, content);
      if (testCase) {
        testCase.imports = Array.from(imports);
        testCases.push(testCase);
      }
    }

    return {
      name: this.extractClassName(content) || fileName,
      testCases,
      imports,
      annotations,
      sourceLanguage: 'python',
    };
  }

  /**
   * Extract imports from Python code
   */
  private extractImports(content: string): Set<string> {
    const imports = new Set<string>();

    // import statement
    const importRegex = /^import\s+(\w+(?:\.\w+)*(?:\s*,\s*\w+(?:\.\w+)*)*)/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const modules = match[1].split(',').map((m) => m.trim());
      for (const module of modules) {
        imports.add(module);
      }
    }

    // from ... import statement
    const fromImportRegex = /^from\s+(\w+(?:\.\w+)*)\s+import\s+(.+)/gm;
    while ((match = fromImportRegex.exec(content)) !== null) {
      const module = match[1];
      const names = match[2].split(',').map((n) => n.trim().split(' as ')[0]);
      for (const name of names) {
        imports.add(`${module}.${name}`);
      }
    }

    return imports;
  }

  /**
   * Extract decorators from Python code
   */
  private extractDecorators(content: string): string[] {
    const decorators: string[] = [];
    const decoratorRegex = /@(\w+(?:\.\w+)?)/g;
    let match;

    while ((match = decoratorRegex.exec(content)) !== null) {
      const decorator = match[1];
      if (!decorators.includes(decorator)) {
        decorators.push(decorator);
      }
    }

    return decorators;
  }

  /**
   * Extract class name from Python code
   */
  private extractClassName(content: string): string | null {
    const match = content.match(/class\s+(\w+)\s*(?:\([^)]*\))?:/);
    return match ? match[1] : null;
  }

  /**
   * Extract test methods from Python code
   */
  private extractTestMethods(content: string): Array<{ name: string; body: string; indent: number }> {
    const methods: Array<{ name: string; body: string; indent: number }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for test function
      const testMatch = line.match(PYTHON_PATTERNS.testFunction);
      if (testMatch) {
        const indent = line.search(/\S/);
        const methodBody = this.extractIndentedBlock(lines, i + 1, indent);

        methods.push({
          name: testMatch[1],
          body: methodBody,
          indent,
        });

        // Skip ahead past the method body
        const bodyLines = methodBody.split('\n').length;
        i += bodyLines;
      }
    }

    return methods;
  }

  /**
   * Extract an indented block of code (Python method body)
   */
  private extractIndentedBlock(lines: string[], startIndex: number, baseIndent: number): string {
    const bodyLines: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Empty line or comment - include if we've started the body
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        if (bodyLines.length > 0) {
          bodyLines.push(line);
        }
        continue;
      }

      const currentIndent = line.search(/\S/);

      // End of block when we hit a line at or below base indentation
      if (currentIndent <= baseIndent) {
        break;
      }

      bodyLines.push(line);
    }

    return bodyLines.join('\n');
  }

  /**
   * Extract setup code
   */
  private extractSetupCode(content: string): string[] {
    const setupActions: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for setUp method
      if (/def\s+(setUp|setUpClass)\s*\(\s*self\s*\)\s*:/.test(line)) {
        const indent = line.search(/\S/);
        const methodBody = this.extractIndentedBlock(lines, i + 1, indent);

        // Extract actions from setup
        const bodyLines = methodBody.split('\n');
        for (const bodyLine of bodyLines) {
          const trimmed = bodyLine.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('def')) {
            setupActions.push(trimmed);
          }
        }

        break;
      }
    }

    return setupActions;
  }

  /**
   * Extract teardown code
   */
  private extractTeardownCode(content: string): string[] {
    const teardownActions: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for tearDown method
      if (/def\s+(tearDown|tearDownClass)\s*\(\s*self\s*\)\s*:/.test(line)) {
        const indent = line.search(/\S/);
        const methodBody = this.extractIndentedBlock(lines, i + 1, indent);

        // Extract actions from teardown
        const bodyLines = methodBody.split('\n');
        for (const bodyLine of bodyLines) {
          const trimmed = bodyLine.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('def')) {
            teardownActions.push(trimmed);
          }
        }

        break;
      }
    }

    return teardownActions;
  }

  /**
   * Parse a test method into a test case
   */
  private parseTestMethod(
    method: { name: string; body: string },
    fullContent: string
  ): ParsedSeleniumTestCase | null {
    const actions = this.parseActions(method.body);
    const assertions = this.parseAssertions(method.body);
    const steps = this.createSteps(actions, method.body);

    return {
      name: this.formatTestName(method.name),
      description: this.extractDescription(method.body),
      steps,
      assertions,
      setUp: this.extractSetupCode(fullContent),
      tearDown: this.extractTeardownCode(fullContent),
      annotations: [],
      imports: [],
      pageObjects: [],
      sourceLanguage: 'python',
      originalCode: method.body,
    };
  }

  /**
   * Parse actions from method body
   */
  private parseActions(body: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines, comments, and decorators
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('@')) {
        continue;
      }

      const action = this.parseAction(trimmedLine);
      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Parse a single action line
   */
  private parseAction(line: string): ParsedAction | null {
    const commentMatch = line.match(PYTHON_PATTERNS.comment);
    const comment = commentMatch ? commentMatch[1] : undefined;
    const codeLine = line.replace(PYTHON_PATTERNS.comment, '').trim();

    // Navigation
    const getMatch = codeLine.match(PYTHON_PATTERNS.get);
    if (getMatch) {
      return {
        type: 'navigate',
        value: getMatch[1],
        original: codeLine,
        comment,
      };
    }

    const navigateMatch = codeLine.match(PYTHON_PATTERNS.navigate);
    if (navigateMatch) {
      return {
        type: 'navigate',
        value: navigateMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Find element (two-arg version: find_element(By.ID, "value"))
    const findElementMatch = codeLine.match(PYTHON_PATTERNS.findElement);
    if (findElementMatch) {
      const byMethod = findElementMatch[1].toUpperCase();
      const locatorType = BY_METHODS[byMethod] || 'id';
      return {
        type: 'findElement',
        target: {
          type: locatorType,
          value: findElementMatch[2],
          original: `By.${byMethod}("${findElementMatch[2]}")`,
        },
        original: codeLine,
        comment,
      };
    }

    // Find element (nested version: find_element(By.ID("value")))
    const findElementSingleMatch = codeLine.match(PYTHON_PATTERNS.findElementSingleArg);
    if (findElementSingleMatch) {
      const byMethod = findElementSingleMatch[1].toUpperCase();
      const locatorType = BY_METHODS[byMethod] || 'id';
      return {
        type: 'findElement',
        target: {
          type: locatorType,
          value: findElementSingleMatch[2],
          original: `By.${byMethod}("${findElementSingleMatch[2]}")`,
        },
        original: codeLine,
        comment,
      };
    }

    // Click
    if (PYTHON_PATTERNS.click.test(codeLine)) {
      return {
        type: 'click',
        original: codeLine,
        comment,
      };
    }

    // Submit
    if (PYTHON_PATTERNS.submit.test(codeLine)) {
      return {
        type: 'submit',
        original: codeLine,
        comment,
      };
    }

    // Clear
    if (PYTHON_PATTERNS.clear.test(codeLine)) {
      return {
        type: 'clear',
        original: codeLine,
        comment,
      };
    }

    // Send keys
    const sendKeysMatch = codeLine.match(PYTHON_PATTERNS.sendKeys);
    if (sendKeysMatch) {
      const keys = sendKeysMatch[1];
      const value = sendKeysMatch[2];

      if (keys && keys.toUpperCase() === 'ENTER') {
        return {
          type: 'submit',
          original: codeLine,
          comment,
        };
      }

      return {
        type: 'sendKeys',
        value: value || keys || '',
        original: codeLine,
        comment,
      };
    }

    // Get text
    if (PYTHON_PATTERNS.getText.test(codeLine)) {
      return {
        type: 'getText',
        original: codeLine,
        comment,
      };
    }

    // Get attribute
    const getAttributeMatch = codeLine.match(PYTHON_PATTERNS.getAttribute);
    if (getAttributeMatch) {
      return {
        type: 'getAttribute',
        value: getAttributeMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Visibility checks
    if (PYTHON_PATTERNS.isDisplayed.test(codeLine)) {
      return {
        type: 'isDisplayed',
        original: codeLine,
        comment,
      };
    }

    if (PYTHON_PATTERNS.isEnabled.test(codeLine)) {
      return {
        type: 'isEnabled',
        original: codeLine,
        comment,
      };
    }

    if (PYTHON_PATTERNS.isSelected.test(codeLine)) {
      return {
        type: 'isSelected',
        original: codeLine,
        comment,
      };
    }

    // Wait/Sleep
    const sleepMatch = codeLine.match(PYTHON_PATTERNS.sleep);
    if (sleepMatch) {
      return {
        type: 'sleep',
        value: Math.round(parseFloat(sleepMatch[1]) * 1000).toString(), // Convert to ms
        original: codeLine,
        comment,
      };
    }

    // WebDriverWait with ExpectedConditions
    if (PYTHON_PATTERNS.waitFor.test(codeLine)) {
      return {
        type: 'waitForElement',
        original: codeLine,
        comment,
      };
    }

    // Select dropdown
    const selectMatch = codeLine.match(PYTHON_PATTERNS.select);
    if (selectMatch) {
      return {
        type: 'select',
        value: selectMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Screenshot
    const screenshotMatch = codeLine.match(PYTHON_PATTERNS.screenshots);
    if (screenshotMatch) {
      return {
        type: 'screenshot',
        value: screenshotMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Execute script
    const executeScriptMatch = codeLine.match(PYTHON_PATTERNS.executeScript);
    if (executeScriptMatch) {
      return {
        type: 'executeScript',
        value: executeScriptMatch[1],
        original: codeLine,
        comment,
      };
    }

    // If no pattern matched, treat as unknown
    if (codeLine && !codeLine.startsWith('assert') && !codeLine.startsWith('raise')) {
      return {
        type: 'unknown',
        original: codeLine,
        comment,
      };
    }

    return null;
  }

  /**
   * Parse assertions from method body
   */
  private parseAssertions(body: string): ParsedAssertion[] {
    const assertions: ParsedAssertion[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // unittest assertions
      const assertEqualMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.assertEqual);
      if (assertEqualMatch) {
        assertions.push({
          type: 'equality',
          condition: assertEqualMatch[2],
          expected: assertEqualMatch[1],
          actual: assertEqualMatch[2],
          original: trimmedLine,
        });
        continue;
      }

      const assertEqualsMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.assertEquals);
      if (assertEqualsMatch) {
        assertions.push({
          type: 'equality',
          condition: assertEqualsMatch[2],
          expected: assertEqualsMatch[1],
          actual: assertEqualsMatch[2],
          original: trimmedLine,
        });
        continue;
      }

      const assertTrueMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.assertTrue);
      if (assertTrueMatch) {
        assertions.push({
          type: 'truthiness',
          condition: assertTrueMatch[1],
          expected: 'true',
          actual: assertTrueMatch[1],
          original: trimmedLine,
        });
        continue;
      }

      const assertFalseMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.assertFalse);
      if (assertFalseMatch) {
        assertions.push({
          type: 'truthiness',
          condition: assertFalseMatch[1],
          expected: 'false',
          actual: assertFalseMatch[1],
          original: trimmedLine,
        });
        continue;
      }

      const assertInMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.assertIn);
      if (assertInMatch) {
        assertions.push({
          type: 'contains',
          condition: assertInMatch[2],
          expected: assertInMatch[1],
          actual: assertInMatch[2],
          original: trimmedLine,
        });
        continue;
      }

      // pytest style assertions
      const pytestMatch = trimmedLine.match(PYTHON_PATTERNS.assertions.pytestAssert);
      if (pytestMatch) {
        const operator = pytestMatch[2];
        const left = pytestMatch[1];
        const right = pytestMatch[3].trim();

        let type: ParsedAssertion['type'] = 'equality';
        if (operator === 'in') {
          type = 'contains';
        }

        assertions.push({
          type,
          condition: left,
          expected: right,
          actual: left,
          original: trimmedLine,
        });
        continue;
      }
    }

    return assertions;
  }

  /**
   * Create test steps from parsed actions
   */
  private createSteps(actions: ParsedAction[], body: string): ParsedStep[] {
    const steps: ParsedStep[] = [];
    let order = 1;

    for (const action of actions) {
      const step: ParsedStep = {
        order,
        action: this.getActionDescription(action),
        code: action.original,
      };

      if (action.comment) {
        step.expectedOutcome = action.comment;
      }

      steps.push(step);
      order++;
    }

    return steps;
  }

  /**
   * Get human-readable description of an action
   */
  private getActionDescription(action: ParsedAction): string {
    const descriptions: Record<string, string> = {
      navigate: 'Navigate to URL',
      click: 'Click element',
      sendKeys: 'Enter text',
      clear: 'Clear field',
      submit: 'Submit form',
      findElement: 'Find element',
      findElements: 'Find elements',
      getText: 'Get text content',
      getAttribute: 'Get attribute value',
      isDisplayed: 'Check if element is displayed',
      isEnabled: 'Check if element is enabled',
      isSelected: 'Check if element is selected',
      waitFor: 'Wait for condition',
      waitForElement: 'Wait for element',
      sleep: 'Pause execution',
      select: 'Select option',
      deselect: 'Deselect option',
      screenshot: 'Take screenshot',
      executeScript: 'Execute JavaScript',
      unknown: 'Unknown action',
    };

    let desc = descriptions[action.type] || 'Perform action';

    if (action.value) {
      desc += `: ${action.value}`;
    }

    if (action.target) {
      desc += ` (${action.target.type}=${action.target.value})`;
    }

    return desc;
  }

  /**
   * Format test name from function name
   */
  private formatTestName(functionName: string): string {
    // Convert test_name to readable text
    return functionName
      .replace(/^test_?/, '')
      .replace(/_/g, ' ')
      .replace(/^./, (str) => str.toUpperCase());
  }

  /**
   * Extract description from method body comments
   */
  private extractDescription(body: string): string | undefined {
    const lines = body.split('\n');
    for (const line of lines) {
      const commentMatch = line.match(PYTHON_PATTERNS.comment);
      if (commentMatch && commentMatch[1].trim()) {
        return commentMatch[1].trim();
      }
    }
    return undefined;
  }
}

/**
 * Create a Python parser instance
 */
export function createPythonParser(): PythonSeleniumParser {
  return new PythonSeleniumParser();
}
