/**
 * Java Selenium Parser
 * Parses Java Selenium test files and extracts test structure
 */

import type {
  ParsedSeleniumTestCase,
  ParsedSeleniumTestSuite,
  ParsedAction,
  ParsedLocator,
  ParsedStep,
  ParsedAssertion,
  SeleniumActionType,
  LocatorType,
} from './types.js';
import { SeleniumConverterError, ConverterErrorType } from './types.js';

/**
 * Java Selenium patterns for parsing
 */
const JAVA_PATTERNS = {
  // Test method annotations
  testAnnotation: /@(Test|TestMethod)\b/,
  beforeAnnotation: /@(Before|BeforeEach)\b/,
  afterAnnotation: /@(After|AfterEach)\b/,
  beforeClassAnnotation: /@(BeforeClass|BeforeAll)\b/,
  afterClassAnnotation: /@(AfterClass|AfterAll)\b/,

  // Method declarations - more permissive patterns
  testMethod: /(?:public\s+)?(?:void|static|\w+)\s+(\w+)\s*\(\s*(?:[^)]*\s*)?\)\s*(?:throws\s+\w+)?\s*\{/,
  anyMethod: /public\s+(?:void|\w+)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+)?\s*\{/,

  // Selenium actions
  get: /(?:driver|WebDriver)\.get\s*\(\s*["']([^"']+)["']\s*\)/,
  navigate: /(?:driver|WebDriver)\.navigate\(\)\.to\s*\(\s*["']([^"']+)["']\s*\)/,

  findElement: /(?:driver|webElement|element)\.findElement\s*\(\s*(?:By\.)?(\w+)\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
  findElements: /(?:driver|webElement|element)\.findElements\s*\(\s*(?:By\.)?(\w+)\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,

  click: /\w+\.click\s*\(\s*\)/,
  submit: /\w+\.submit\s*\(\s*\)/,
  clear: /\w+\.clear\s*\(\s*\)/,

  sendKeys: /\w+\.sendKeys\s*\(\s*(?:(?:Keys\.)?(\w+)\s*,\s*)?["']([^"']*)["']\s*\)/,

  getText: /\w+\.getText\s*\(\s*\)/,
  getAttribute: /\w+\.getAttribute\s*\(\s*["']([^"']+)["']\s*\)/,

  isDisplayed: /\w+\.isDisplayed\s*\(\s*\)/,
  isEnabled: /\w+\.isEnabled\s*\(\s*\)/,
  isSelected: /\w+\.isSelected\s*\(\s*\)/,

  waitFor: /(?:new\s+WebDriverWait\s*\([^)]+\)\.until\s*\(|(?:fluentWait|wait)\.until\s*\()/,
  sleep: /Thread\.sleep\s*\(\s*(\d+)\s*\)/,
  implicitlyWait: /driver\.manage\(\)\.timeouts\(\)\.implicitlyWait\s*\(\s*(\d+)\s*,\s*(?:TimeUnit|MILLISECONDS)\./,

  select: /new\s+Select\s*\(\s*\w+\s*\)\.selectBy(?:VisibleText|Value|Index)\s*\(\s*["']?([^"')\]]*)["']?\s*\)/,

  assertions: {
    assertEquals: /(?:assertEquals|assertSame)\s*\(\s*["']?([^"')\]]*)["']?\s*,\s*(\w+(?:\.\w+)*)\s*\)/,
    assertTrue: /(?:assertTrue|verifyTrue)\s*\(\s*(\w+(?:\.\w+)*)\s*\)/,
    assertFalse: /(?:assertFalse|verifyFalse)\s*\(\s*(\w+(?:\.\w+)*)\s*\)/,
    assertContains: /assertThat\s*\(\s*(\w+(?:\.\w+)*)\s*,\s*containsString\s*\(\s*["']([^"']+)["']\s*\)\s*\)/,
  },

  screenshots: /(?:TakeScreenshot|((?:\w+)?Screenshot))\.getScreenshotAs\s*\(/,

  executeScript: /(?:driver|javascriptExecutor)\.executeScript\s*\(\s*["']([^"']+)["']\s*/,

  // Variable declarations
 webElement: /(?:WebElement|AndroidElement|IOSElement)\s+(\w+)\s*=\s*driver\.findElement/,
  stringVar: /String\s+(\w+)\s*=\s*["']([^"']+)["']/,

  // Comments
  comment: /\/\/\s*(.*)/,
};

/**
 * By methods mapping to locator types
 */
const BY_METHODS: Record<string, LocatorType> = {
  id: 'id',
  name: 'name',
  className: 'className',
  tagName: 'tagName',
  xpath: 'xpath',
  cssSelector: 'cssSelector',
  linkText: 'linkText',
  partialLinkText: 'partialLinkText',
  accessibilityId: 'accessibilityId',
};

/**
 * Java Selenium Parser class
 */
export class JavaSeleniumParser {
  /**
   * Parse a Java Selenium test file
   */
  parseFile(content: string, fileName: string): ParsedSeleniumTestSuite {
    const testCases: ParsedSeleniumTestCase[] = [];
    const imports = this.extractImports(content);
    const annotations = this.extractAnnotations(content);

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
      sourceLanguage: 'java',
    };
  }

  /**
   * Extract imports from Java code
   */
  private extractImports(content: string): Set<string> {
    const imports = new Set<string>();
    const importRegex = /import\s+([\w.]+);/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    return imports;
  }

  /**
   * Extract annotations from Java code
   */
  private extractAnnotations(content: string): string[] {
    const annotations: string[] = [];
    const annotationRegex = /@(\w+)/g;
    let match;

    while ((match = annotationRegex.exec(content)) !== null) {
      if (!annotations.includes(match[1])) {
        annotations.push(match[1]);
      }
    }

    return annotations;
  }

  /**
   * Extract class name from Java code
   */
  private extractClassName(content: string): string | null {
    const match = content.match(/public\s+(?:class)\s+(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract test methods from Java code
   */
  private extractTestMethods(content: string): Array<{ name: string; body: string }> {
    const methods: Array<{ name: string; body: string }> = [];
    const lines = content.split('\n');
    let inTestMethod = false;
    let currentMethod: { name: string; body: string; startLine: number } | null = null;
    let braceCount = 0;
    let methodBraceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for test annotation
      if (JAVA_PATTERNS.testAnnotation.test(line)) {
        inTestMethod = true;
        continue;
      }

      // Check for method declaration
      if (inTestMethod && JAVA_PATTERNS.testMethod.test(line)) {
        const match = line.match(JAVA_PATTERNS.testMethod);
        if (match) {
          currentMethod = { name: match[1], body: '', startLine: i };
          methodBraceCount = 0;
        }
      }

      // Count braces to find method body
      if (currentMethod) {
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;

        for (const char of line) {
          if (char === '{') {
            braceCount++;
            if (currentMethod && methodBraceCount === 0) {
              methodBraceCount = braceCount;
            }
          }
          if (char === '}') {
            braceCount--;
          }
        }

        currentMethod.body += line + '\n';

        // Method ends when brace count returns to method start level
        if (braceCount === methodBraceCount - 1 && openBraces > 0) {
          methods.push({
            name: currentMethod.name,
            body: currentMethod.body.trim(),
          });
          currentMethod = null;
          inTestMethod = false;
        }
      }
    }

    return methods;
  }

  /**
   * Extract setup code (methods annotated with @Before/@BeforeEach)
   */
  private extractSetupCode(content: string): string[] {
    const setupActions: string[] = [];
    const lines = content.split('\n');
    let inSetupMethod = false;
    let braceCount = 0;
    let methodBraceCount = 0;

    for (const line of lines) {
      if (JAVA_PATTERNS.beforeAnnotation.test(line)) {
        inSetupMethod = true;
        continue;
      }

      if (inSetupMethod) {
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;

        for (const char of line) {
          if (char === '{') {
            braceCount++;
            if (methodBraceCount === 0) {
              methodBraceCount = braceCount;
            }
          }
          if (char === '}') {
            braceCount--;
          }
        }

        if (line.trim() && !line.match(/^\s*}/)) {
          setupActions.push(line.trim());
        }

        if (braceCount === methodBraceCount - 1 && openBraces > 0) {
          inSetupMethod = false;
          methodBraceCount = 0;
        }
      }
    }

    return setupActions;
  }

  /**
   * Extract teardown code (methods annotated with @After/@AfterEach)
   */
  private extractTeardownCode(content: string): string[] {
    const teardownActions: string[] = [];
    const lines = content.split('\n');
    let inTeardownMethod = false;
    let braceCount = 0;
    let methodBraceCount = 0;

    for (const line of lines) {
      if (JAVA_PATTERNS.afterAnnotation.test(line)) {
        inTeardownMethod = true;
        continue;
      }

      if (inTeardownMethod) {
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;

        for (const char of line) {
          if (char === '{') {
            braceCount++;
            if (methodBraceCount === 0) {
              methodBraceCount = braceCount;
            }
          }
          if (char === '}') {
            braceCount--;
          }
        }

        if (line.trim() && !line.match(/^\s*}/)) {
          teardownActions.push(line.trim());
        }

        if (braceCount === methodBraceCount - 1 && openBraces > 0) {
          inTeardownMethod = false;
          methodBraceCount = 0;
        }
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
      sourceLanguage: 'java',
      originalCode: method.body,
    };
  }

  /**
   * Parse actions from method body
   */
  private parseActions(body: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    const lines = body.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines, comments, and braces
      if (!line || line.startsWith('//') || line === '{' || line === '}') {
        continue;
      }

      const action = this.parseAction(line);
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
    const commentMatch = line.match(JAVA_PATTERNS.comment);
    const comment = commentMatch ? commentMatch[1] : undefined;
    const codeLine = line.replace(JAVA_PATTERNS.comment, '').trim();

    // Navigation
    const getMatch = codeLine.match(JAVA_PATTERNS.get);
    if (getMatch) {
      return {
        type: 'navigate',
        value: getMatch[1],
        original: codeLine,
        comment,
      };
    }

    const navigateMatch = codeLine.match(JAVA_PATTERNS.navigate);
    if (navigateMatch) {
      return {
        type: 'navigate',
        value: navigateMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Find element
    const findElementMatch = codeLine.match(JAVA_PATTERNS.findElement);
    if (findElementMatch) {
      return {
        type: 'findElement',
        target: {
          type: BY_METHODS[findElementMatch[1]] || 'id',
          value: findElementMatch[2],
          original: `${findElementMatch[1]}("${findElementMatch[2]}")`,
        },
        original: codeLine,
        comment,
      };
    }

    // Click
    if (JAVA_PATTERNS.click.test(codeLine)) {
      return {
        type: 'click',
        original: codeLine,
        comment,
      };
    }

    // Submit
    if (JAVA_PATTERNS.submit.test(codeLine)) {
      return {
        type: 'submit',
        original: codeLine,
        comment,
      };
    }

    // Clear
    if (JAVA_PATTERNS.clear.test(codeLine)) {
      return {
        type: 'clear',
        original: codeLine,
        comment,
      };
    }

    // SendKeys
    const sendKeysMatch = codeLine.match(JAVA_PATTERNS.sendKeys);
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
    if (JAVA_PATTERNS.getText.test(codeLine)) {
      return {
        type: 'getText',
        original: codeLine,
        comment,
      };
    }

    // Get attribute
    const getAttributeMatch = codeLine.match(JAVA_PATTERNS.getAttribute);
    if (getAttributeMatch) {
      return {
        type: 'getAttribute',
        value: getAttributeMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Visibility checks
    if (JAVA_PATTERNS.isDisplayed.test(codeLine)) {
      return {
        type: 'isDisplayed',
        original: codeLine,
        comment,
      };
    }

    if (JAVA_PATTERNS.isEnabled.test(codeLine)) {
      return {
        type: 'isEnabled',
        original: codeLine,
        comment,
      };
    }

    if (JAVA_PATTERNS.isSelected.test(codeLine)) {
      return {
        type: 'isSelected',
        original: codeLine,
        comment,
      };
    }

    // Wait/Sleep
    const sleepMatch = codeLine.match(JAVA_PATTERNS.sleep);
    if (sleepMatch) {
      return {
        type: 'sleep',
        value: sleepMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Select dropdown
    const selectMatch = codeLine.match(JAVA_PATTERNS.select);
    if (selectMatch) {
      return {
        type: 'select',
        value: selectMatch[1],
        original: codeLine,
        comment,
      };
    }

    // Screenshot
    if (JAVA_PATTERNS.screenshots.test(codeLine)) {
      return {
        type: 'screenshot',
        original: codeLine,
        comment,
      };
    }

    // Execute script
    const executeScriptMatch = codeLine.match(JAVA_PATTERNS.executeScript);
    if (executeScriptMatch) {
      return {
        type: 'executeScript',
        value: executeScriptMatch[1],
        original: codeLine,
        comment,
      };
    }

    // If no pattern matched, treat as unknown
    if (codeLine && !codeLine.startsWith('/') && !codeLine.startsWith('*')) {
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
      if (!trimmedLine || trimmedLine.startsWith('//')) {
        continue;
      }

      // assertEquals
      const assertEqualsMatch = trimmedLine.match(JAVA_PATTERNS.assertions.assertEquals);
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

      // assertTrue
      const assertTrueMatch = trimmedLine.match(JAVA_PATTERNS.assertions.assertTrue);
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

      // assertFalse
      const assertFalseMatch = trimmedLine.match(JAVA_PATTERNS.assertions.assertFalse);
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

      // assertContains
      const assertContainsMatch = trimmedLine.match(JAVA_PATTERNS.assertions.assertContains);
      if (assertContainsMatch) {
        assertions.push({
          type: 'contains',
          condition: assertContainsMatch[1],
          expected: assertContainsMatch[2],
          actual: assertContainsMatch[1],
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
    const descriptions: Record<SeleniumActionType, string> = {
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
      assert: 'Assert condition',
      verify: 'Verify condition',
      assertEquals: 'Assert equals',
      assertTrue: 'Assert true',
      assertFalse: 'Assert false',
      assertContains: 'Assert contains',
      switchTo: 'Switch context',
      frame: 'Switch to frame',
      window: 'Switch to window',
      alert: 'Handle alert',
      accept: 'Accept alert',
      dismiss: 'Dismiss alert',
      hover: 'Hover over element',
      dragAndDrop: 'Drag and drop',
      scroll: 'Scroll page',
      executeScript: 'Execute JavaScript',
      screenshot: 'Take screenshot',
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
   * Format test name from method name
   */
  private formatTestName(methodName: string): string {
    // Convert camelCase to readable text
    return methodName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Extract description from method body comments
   */
  private extractDescription(body: string): string | undefined {
    const lines = body.split('\n');
    for (const line of lines) {
      const commentMatch = line.match(JAVA_PATTERNS.comment);
      if (commentMatch && commentMatch[1].trim()) {
        return commentMatch[1].trim();
      }
    }
    return undefined;
  }
}

/**
 * Create a Java parser instance
 */
export function createJavaParser(): JavaSeleniumParser {
  return new JavaSeleniumParser();
}
