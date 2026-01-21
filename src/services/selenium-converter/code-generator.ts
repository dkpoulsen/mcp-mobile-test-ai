/**
 * Code Generator for Selenium Converter
 * Generates TypeScript test code from parsed Selenium tests
 */

import type {
  ParsedSeleniumTestCase,
  ParsedSeleniumTestSuite,
  ParsedStep,
  ParsedAssertion,
  ConversionOptions,
  GeneratedTestFile,
  TargetFramework,
  ParsedAction,
} from './types.js';
import { convertLocator, getFrameworkImports, getTestWrapperKeywords } from './api-mappings.js';
import { SeleniumConverterError, ConverterErrorType } from './types.js';

/**
 * Convert string to camelCase
 */
function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/**
 * Code Generator class
 */
export class ConverterCodeGenerator {
  /**
   * Generate TypeScript test code from parsed Selenium test suite
   */
  generateTestSuite(
    suite: ParsedSeleniumTestSuite,
    options: ConversionOptions
  ): GeneratedTestFile[] {
    const files: GeneratedTestFile[] = [];

    // Generate test files for each test case
    for (const testCase of suite.testCases) {
      const testFile = this.generateTestFile(testCase, suite, options);
      files.push(testFile);
    }

    // Generate page objects if requested
    if (options.generatePageObjects) {
      const pageObjects = this.generatePageObjects(suite, options);
      files.push(...pageObjects);
    }

    return files;
  }

  /**
   * Generate a single test file
   */
  generateTestFile(
    testCase: ParsedSeleniumTestCase,
    suite: ParsedSeleniumTestSuite,
    options: ConversionOptions
  ): GeneratedTestFile {
    const fileName = `${toKebabCase(testCase.name)}.spec.ts`;
    const filePath = `${options.outputDir}/${fileName}`;

    const content = this.generateTestContent(testCase, suite, options);

    return {
      fileName,
      filePath,
      content,
      fileType: 'test',
    };
  }

  /**
   * Generate test file content
   */
  private generateTestContent(
    testCase: ParsedSeleniumTestCase,
    suite: ParsedSeleniumTestSuite,
    options: ConversionOptions
  ): string {
    const framework = options.targetFramework;
    const keywords = getTestWrapperKeywords(framework);
    const imports = getFrameworkImports(framework);
    const useTypeScript = options.useTypeScript ?? true;

    let content = '';

    // Add imports
    content += this.generateImports(testCase, suite, framework, useTypeScript);
    content += '\n';

    // Add file description
    if (options.includeComments && testCase.description) {
      content += `/**\n * ${testCase.description}\n */\n`;
    }

    // Start test suite
    content += `${keywords.describe}('${testCase.name}', () => {\n`;

    // Add before hooks (setup)
    if (testCase.setUp && testCase.setUp.length > 0) {
      content += `  ${keywords.beforeAll}(async () => {\n`;
      for (const setupLine of testCase.setUp) {
        const converted = this.convertActionLine(setupLine, framework, testCase);
        if (converted) {
          content += `    ${converted}\n`;
        }
      }
      content += `  });\n\n`;
    }

    // Start test
    content += `  ${keywords.it}('should ${testCase.description?.toLowerCase() || testCase.name.toLowerCase()}', async () => {\n`;

    // Add test steps
    for (const step of testCase.steps) {
      const stepCode = this.generateStepCode(step, framework, options);
      if (stepCode) {
        content += `    ${stepCode}\n`;
      }
    }

    // Add assertions
    for (const assertion of testCase.assertions) {
      const assertionCode = this.generateAssertionCode(assertion, framework);
      if (assertionCode) {
        content += `    ${assertionCode}\n`;
      }
    }

    // End test
    content += `  });\n`;

    // Add after hooks (teardown)
    if (testCase.tearDown && testCase.tearDown.length > 0) {
      content += `\n  ${keywords.afterAll}(async () => {\n`;
      for (const tearDownLine of testCase.tearDown) {
        const converted = this.convertActionLine(tearDownLine, framework, testCase);
        if (converted) {
          content += `    ${converted}\n`;
        }
      }
      content += `  });\n`;
    }

    // End test suite
    content += `});\n`;

    return content;
  }

  /**
   * Generate import statements
   */
  private generateImports(
    testCase: ParsedSeleniumTestCase,
    suite: ParsedSeleniumTestSuite,
    framework: TargetFramework,
    useTypeScript: boolean
  ): string {
    let imports = '';

    // Framework-specific imports
    if (framework === 'playwright') {
      imports += "import { test, expect } from '@playwright/test';\n";
    } else if (framework === 'webdriverio' || framework === 'appium') {
      imports += "import { expect } from '@wdio/globals';\n";
    }

    // Page object imports (placeholder)
    const pageObjects = this.extractPageObjectsFromTest(testCase);
    if (pageObjects.size > 0) {
      imports += '// TODO: Import page objects\n';
      const pageObjectArray = Array.from(pageObjects);
      for (const po of pageObjectArray) {
        const poName = toPascalCase(po);
        imports += `// import { ${poName} } from '../pageObjects/${poName}.js';\n`;
      }
    }

    return imports;
  }

  /**
   * Generate code for a test step
   */
  private generateStepCode(
    step: ParsedStep,
    framework: TargetFramework,
    options: ConversionOptions
  ): string | null {
    if (!step.code) {
      // Generate from action description
      if (step.action) {
        return `// ${step.action}\n    // TODO: Implement: ${step.action}`;
      }
      return null;
    }

    const converted = this.convertActionLine(step.code, framework);
    if (converted) {
      if (options.includeComments && step.action) {
        return `// ${step.action}\n    ${converted}`;
      }
      return converted;
    }

    // Return original as comment if conversion failed
    return `// ${step.action || step.code}`;
  }

  /**
   * Convert an action line from Selenium to target framework
   */
  private convertActionLine(
    codeLine: string,
    framework: TargetFramework,
    testCase?: ParsedSeleniumTestCase
  ): string | null {
    const trimmed = codeLine.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      return null;
    }

    // Common patterns to convert

    // Navigation: driver.get("url") or driver.navigate().to("url")
    const getMatch = trimmed.match(/(?:get|navigate\(\)\.to)\s*\(\s*["']([^"']+)["']\s*\)/);
    if (getMatch) {
      if (framework === 'playwright') {
        return `await page.goto('${getMatch[1]}');`;
      } else {
        return `await browser.url('${getMatch[1]}');`;
      }
    }

    // Click: element.click()
    if (/\.click\s*\(\s*\)/.test(trimmed)) {
      const element = this.extractElementReference(trimmed);
      if (element) {
        const convertedElement = this.convertElementReference(element, framework);
        return `await ${convertedElement}.click();`;
      }
      return `// TODO: Click - ${trimmed}`;
    }

    // SendKeys: element.sendKeys("value")
    const sendKeysMatch = trimmed.match(/(\w+(?:\.\w+)*)\.sendKeys\s*\(\s*["']([^"']*)["']?\s*\)/);
    if (sendKeysMatch) {
      const element = sendKeysMatch[1];
      const value = sendKeysMatch[2];
      const convertedElement = this.convertElementReference(element, framework);
      return `await ${convertedElement}.fill('${value}');`;
    }

    // Clear: element.clear()
    if (/\.clear\s*\(\s*\)/.test(trimmed)) {
      const element = this.extractElementReference(trimmed);
      if (element) {
        const convertedElement = this.convertElementReference(element, framework);
        return `await ${convertedElement}.clear();`;
      }
      return `// TODO: Clear - ${trimmed}`;
    }

    // Submit: element.submit()
    if (/\.submit\s*\(\s*\)/.test(trimmed)) {
      const element = this.extractElementReference(trimmed);
      if (element) {
        const convertedElement = this.convertElementReference(element, framework);
        if (framework === 'playwright') {
          return `await ${convertedElement}.press('Enter');`;
        } else {
          return `await ${convertedElement}.press('Enter');`;
        }
      }
      return `// TODO: Submit - ${trimmed}`;
    }

    // Find element: driver.findElement(By.id("value"))
    const findMatch = trimmed.match(/findElement\s*\(\s*(?:By\.)?(\w+)\s*\(\s*["']([^"']+)["']\s*\)\s*\)/);
    if (findMatch) {
      const byType = findMatch[1];
      const value = findMatch[2];
      const locatorType = this.mapByTypeToLocatorType(byType);
      const locator = convertLocator(locatorType, value, framework);
      return `const element = ${locator};`;
    }

    // Sleep/Wait: Thread.sleep() or time.sleep()
    const sleepMatch = trimmed.match(/(?:sleep|waitForTimeout)\s*\(\s*(\d+)\s*\)/);
    if (sleepMatch) {
      const ms = parseInt(sleepMatch[1], 10);
      if (framework === 'playwright') {
        return `await page.waitForTimeout(${ms});`;
      } else {
        return `await browser.pause(${ms});`;
      }
    }

    // Select: Select(element).selectByVisibleText("value")
    const selectMatch = trimmed.match(/select_by_(?:visible_text|value)\s*\(\s*["']([^"']+)["']\s*\)/);
    if (selectMatch) {
      const element = this.extractElementReference(trimmed);
      if (element) {
        const convertedElement = this.convertElementReference(element, framework);
        return `await ${convertedElement}.selectOption('${selectMatch[1]}');`;
      }
      return `// TODO: Select option - ${trimmed}`;
    }

    // Screenshot: save_screenshot() or getScreenshotAs()
    const screenshotMatch = trimmed.match(/(?:save_screenshot|getScreenshotAs)\s*\(\s*["']?([^"')\]]*)["']?\s*\)/);
    if (screenshotMatch) {
      const path = screenshotMatch[1];
      if (framework === 'playwright') {
        return `await page.screenshot({ path: '${path}' });`;
      } else {
        return `await browser.saveScreenshot('${path}');`;
      }
    }

    // Execute script
    const scriptMatch = trimmed.match(/executeScript\s*\(\s*["']([^"']+)["']\s*/);
    if (scriptMatch) {
      const script = scriptMatch[1];
      if (framework === 'playwright') {
        return `await page.evaluate('${script}');`;
      } else {
        return `await browser.execute('${script}');`;
      }
    }

    // If no conversion found, return as comment
    return null;
  }

  /**
   * Extract element reference from code line
   */
  private extractElementReference(line: string): string | null {
    // Match patterns like "elementName.method()" or "webElement.method()"
    const match = line.match(/(\w+(?:\.\w+)*)\s*\.\s*\w+\s*\(/);
    return match ? match[1] : null;
  }

  /**
   * Convert element reference to target framework format
   */
  private convertElementReference(ref: string, framework: TargetFramework): string {
    // Remove common prefixes/suffixes
    const cleanRef = ref
      .replace(/^webElement/, 'element')
      .replace(/^element$/, 'element');

    // For now, return a placeholder reference
    return `await ${toCamelCase(cleanRef)}`;
  }

  /**
   * Map By.* type to locator type
   */
  private mapByTypeToLocatorType(byType: string): 'id' | 'name' | 'className' | 'tagName' | 'xpath' | 'cssSelector' | 'linkText' | 'partialLinkText' {
    const byTypeLower = byType.toLowerCase();

    const mapping: Record<string, 'id' | 'name' | 'className' | 'tagName' | 'xpath' | 'cssSelector' | 'linkText' | 'partialLinkText'> = {
      'id': 'id',
      'name': 'name',
      'classname': 'className',
      'tagname': 'tagName',
      'xpath': 'xpath',
      'cssselector': 'cssSelector',
      'linktext': 'linkText',
      'partiallinktext': 'partialLinkText',
    };

    return mapping[byTypeLower] || 'cssSelector';
  }

  /**
   * Generate assertion code
   */
  private generateAssertionCode(
    assertion: ParsedAssertion,
    framework: TargetFramework
  ): string | null {
    let code = '';

    switch (assertion.type) {
      case 'equality':
        if (framework === 'playwright') {
          code = `expect(await ${assertion.actual}).toEqual('${assertion.expected}');`;
        } else {
          code = `expect(await ${assertion.actual}).toEqual('${assertion.expected}');`;
        }
        break;

      case 'truthiness':
        if (assertion.expected === 'true') {
          code = `expect(await ${assertion.condition}).toBeTruthy();`;
        } else {
          code = `expect(await ${assertion.condition}).toBeFalsy();`;
        }
        break;

      case 'contains':
        if (framework === 'playwright') {
          code = `expect(await ${assertion.actual}).toContain('${assertion.expected}');`;
        } else {
          code = `expect(await ${assertion.actual}).toContain('${assertion.expected}');`;
        }
        break;

      case 'visibility':
        code = `expect(await ${assertion.condition}).toBeVisible();`;
        break;

      case 'exists':
        code = `expect(await ${assertion.condition}).toBeTruthy();`;
        break;

      default:
        return null;
    }

    return code;
  }

  /**
   * Extract page objects mentioned in the test
   */
  private extractPageObjectsFromTest(testCase: ParsedSeleniumTestCase): Set<string> {
    const pageObjects = new Set<string>();

    // Extract from pageObjects property if available
    for (const po of testCase.pageObjects) {
      pageObjects.add(po);
    }

    // Extract from steps
    for (const step of testCase.steps) {
      if (step.pageObject) {
        pageObjects.add(step.pageObject);
      }
    }

    return pageObjects;
  }

  /**
   * Generate page object files
   */
  private generatePageObjects(
    suite: ParsedSeleniumTestSuite,
    options: ConversionOptions
  ): GeneratedTestFile[] {
    const pageObjects: GeneratedTestFile[] = [];
    const framework = options.targetFramework;
    const pageObjectDir = options.outputDir + '/pageObjects';

    // Extract unique elements from all test cases
    const elementsMap = this.extractElementsFromSuite(suite);

    const entries = Array.from(elementsMap.entries());
    for (const [pageName, elements] of entries) {
      const fileName = `${toPascalCase(pageName)}.ts`;
      const filePath = `${pageObjectDir}/${fileName}`;

      const content = this.generatePageObjectContent(pageName, elements, framework, options);

      pageObjects.push({
        fileName,
        filePath,
        content,
        fileType: 'page-object',
      });
    }

    return pageObjects;
  }

  /**
   * Extract elements from test suite
   */
  private extractElementsFromSuite(suite: ParsedSeleniumTestSuite): Map<string, Array<{ name: string; selector: string; type: string }>> {
    const elementsMap = new Map<string, Array<{ name: string; selector: string; type: string }>>();

    for (const testCase of suite.testCases) {
      const steps = testCase.steps;

      for (const step of steps) {
        if (step.code) {
          // Extract findElement calls
          const findMatch = step.code.match(/findElement\s*\(\s*(?:By\.)?(\w+)\s*\(\s*["']([^"']+)["']\s*\)\s*\)/);
          if (findMatch) {
            const type = findMatch[1];
            const selector = findMatch[2];

            // Determine page name from context (use test case name for now)
            const pageName = 'DefaultPage';

            if (!elementsMap.has(pageName)) {
              elementsMap.set(pageName, []);
            }

            // Create a name for the element
            const elementName = toCamelCase(`${type}_${selector}`);

            // Check if element already exists
            const existing = elementsMap.get(pageName)!;
            if (!existing.some(e => e.selector === selector)) {
              existing.push({
                name: elementName,
                selector,
                type,
              });
            }
          }
        }
      }
    }

    return elementsMap;
  }

  /**
   * Generate page object class content
   */
  private generatePageObjectContent(
    pageName: string,
    elements: Array<{ name: string; selector: string; type: string }>,
    framework: TargetFramework,
    options: ConversionOptions
  ): string {
    let content = '';

    // Add imports
    if (framework === 'playwright') {
      content += "import { type Locator, Page } from '@playwright/test';\n\n";
    } else {
      content += "import { $, browser } from '@wdio/globals';\n\n";
    }

    // Class declaration
    const className = toPascalCase(pageName);
    content += `/**\n * ${className} Page Object\n */\n`;
    content += `export class ${className}`;

    if (framework === 'playwright') {
      content += ` {\n  private page: Page;\n\n`;
      content += `  constructor(page: Page) {\n    this.page = page;\n`;
      content += `  }\n\n`;
    } else {
      content += ` {\n`;
    }

    // Add element locators
    for (const element of elements) {
      const elementComment = `/**\n   * ${element.type} locator: ${element.selector}\n   */\n`;

      if (framework === 'playwright') {
        const locator = this.convertElementToPlaywrightLocator(element);
        content += elementComment;
        content += `  get ${element.name}(): Locator {\n`;
        content += `    return this.page.locator('${locator}');\n`;
        content += `  }\n\n`;
      } else {
        const locator = this.convertElementToWebdriverIOLocator(element);
        content += elementComment;
        content += `  get ${element.name}() {\n`;
        content += `    return ${locator};\n`;
        content += `  }\n\n`;
      }
    }

    content += `}\n`;

    return content;
  }

  /**
   * Convert element to Playwright locator
   */
  private convertElementToPlaywrightLocator(element: { name: string; selector: string; type: string }): string {
    const type = element.type.toLowerCase();

    switch (type) {
      case 'id':
        return `#${element.selector}`;
      case 'name':
        return `[name="${element.selector}"]`;
      case 'classname':
        return `.${element.selector}`;
      case 'xpath':
        return `xpath=${element.selector}`;
      case 'cssselector':
        return element.selector;
      case 'linktext':
        return `text="${element.selector}"`;
      default:
        return element.selector;
    }
  }

  /**
   * Convert element to WebDriverIO locator
   */
  private convertElementToWebdriverIOLocator(element: { name: string; selector: string; type: string }): string {
    const type = element.type.toLowerCase();

    switch (type) {
      case 'id':
        return `$('#${element.selector}')`;
      case 'name':
        return `[name="${element.selector}"]`;
      case 'classname':
        return `$('.${element.selector}')`;
      case 'xpath':
        return `$('${element.selector}')`;
      case 'cssselector':
        return `$('${element.selector}')`;
      case 'linktext':
        return `$('=${element.selector}')`;
      default:
        return `$('${element.selector}')`;
    }
  }
}

/**
 * Create a code generator instance
 */
export function createCodeGenerator(): ConverterCodeGenerator {
  return new ConverterCodeGenerator();
}
