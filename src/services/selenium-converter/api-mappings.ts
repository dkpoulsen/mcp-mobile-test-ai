/**
 * API Mappings
 * Maps Selenium API calls to target framework APIs
 */

import type { ApiMapping, LocatorType, SeleniumActionType, TargetFramework } from './types.js';

/**
 * Convert Selenium locator type to target framework format
 */
export function convertLocator(
  locatorType: LocatorType,
  value: string,
  targetFramework: TargetFramework
): string {
  const trimmedValue = value.trim();

  switch (targetFramework) {
    case 'playwright':
      return convertLocatorForPlaywright(locatorType, trimmedValue);

    case 'webdriverio':
    case 'appium':
      return convertLocatorForWebdriverIO(locatorType, trimmedValue);

    default:
      return `$('${trimmedValue}')`;
  }
}

/**
 * Convert locator for Playwright
 */
function convertLocatorForPlaywright(locatorType: LocatorType, value: string): string {
  switch (locatorType) {
    case 'id':
      return `page.getByTestId('${value}')`;
    case 'name':
      return `page.getByRole('textbox', { name: '${value}' })`;
    case 'className':
      return `page.locator('.${value}')`;
    case 'tagName':
      return `page.locator('${value}')`;
    case 'xpath':
      return `page.locator('xpath=${value}')`;
    case 'cssSelector':
      return `page.locator('${value}')`;
    case 'linkText':
      return `page.getByRole('link', { name: '${value}' })`;
    case 'partialLinkText':
      return `page.getByRole('link', { name: /${escapeRegex(value)}/ })`;
    case 'accessibilityId':
      return `page.getByTestId('${value}')`;
    default:
      return `page.locator('${value}')`;
  }
}

/**
 * Convert locator for WebDriverIO/Appium
 */
function convertLocatorForWebdriverIO(locatorType: LocatorType, value: string): string {
  switch (locatorType) {
    case 'id':
      return `$('#${value}')`;
    case 'name':
      return `[name="${value}"]`;
    case 'className':
      return `$('.${value}')`;
    case 'tagName':
      return `$('${value}')`;
    case 'xpath':
      return `$('${value}')`;
    case 'cssSelector':
      return `$('${value}')`;
    case 'linkText':
      return `$('=${value}')`;
    case 'partialLinkText':
      return `$('=${value}')`;
    case 'accessibilityId':
      return `$('~${value}')`;
    default:
      return `$('${value}')`;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get import statements for target framework
 */
export function getFrameworkImports(targetFramework: TargetFramework): string[] {
  switch (targetFramework) {
    case 'playwright':
      return [
        "import { test, expect } from '@playwright/test';",
      ];
    case 'webdriverio':
    case 'appium':
      return [
        "import { expect } from '@wdio/globals';",
      ];
    default:
      return [];
  }
}

/**
 * Get test wrapper keywords
 */
export function getTestWrapperKeywords(targetFramework: TargetFramework): {
  describe: string;
  it: string;
  beforeEach: string;
  afterEach: string;
  beforeAll: string;
  afterAll: string;
} {
  switch (targetFramework) {
    case 'playwright':
      return {
        describe: 'test.describe',
        it: 'test',
        beforeEach: 'test.beforeEach',
        afterEach: 'test.afterEach',
        beforeAll: 'test.beforeAll',
        afterAll: 'test.afterAll',
      };
    case 'webdriverio':
    case 'appium':
      return {
        describe: 'describe',
        it: 'it',
        beforeEach: 'beforeEach',
        afterEach: 'afterEach',
        beforeAll: 'before',
        afterAll: 'after',
      };
    default:
      return {
        describe: 'describe',
        it: 'it',
        beforeEach: 'beforeEach',
        afterEach: 'afterEach',
        beforeAll: 'beforeAll',
        afterAll: 'afterAll',
      };
  }
}

/**
 * Selenium to target framework API mappings
 */
export const API_MAPPINGS: Record<SeleniumActionType, ApiMapping> = {
  navigate: {
    seleniumMethod: 'get',
    targetMethod: 'goto',
    targetImport: undefined,
    template: 'await page.goto({{value}})',
    parameters: [
      { name: 'url', source: 'value' },
    ],
  },
  click: {
    seleniumMethod: 'click',
    targetMethod: 'click',
    template: 'await {{locator}}.click()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  sendKeys: {
    seleniumMethod: 'sendKeys',
    targetMethod: 'fill',
    template: 'await {{locator}}.fill({{value}})',
    parameters: [
      { name: 'locator', source: 'locator' },
      { name: 'text', source: 'value' },
    ],
  },
  clear: {
    seleniumMethod: 'clear',
    targetMethod: 'clear',
    template: 'await {{locator}}.clear()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  submit: {
    seleniumMethod: 'submit',
    targetMethod: 'press',
    template: 'await {{locator}}.press("Enter")',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  findElement: {
    seleniumMethod: 'findElement',
    targetMethod: 'locator',
    template: '{{locator}}',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  findElements: {
    seleniumMethod: 'findElements',
    targetMethod: 'all',
    template: 'page.locator({{value}}).all()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  getText: {
    seleniumMethod: 'getText',
    targetMethod: 'textContent',
    template: 'await {{locator}}.textContent()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  getAttribute: {
    seleniumMethod: 'getAttribute',
    targetMethod: 'getAttribute',
    template: 'await {{locator}}.getAttribute({{value}})',
    parameters: [
      { name: 'locator', source: 'locator' },
      { name: 'attribute', source: 'value' },
    ],
  },
  isDisplayed: {
    seleniumMethod: 'isDisplayed',
    targetMethod: 'isVisible',
    template: 'await {{locator}}.isVisible()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  isEnabled: {
    seleniumMethod: 'isEnabled',
    targetMethod: 'isEnabled',
    template: 'await {{locator}}.isEnabled()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  isSelected: {
    seleniumMethod: 'isSelected',
    targetMethod: 'isChecked',
    template: 'await {{locator}}.isChecked()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  waitFor: {
    seleniumMethod: 'waitFor',
    targetMethod: 'waitFor',
    template: 'await page.waitForTimeout({{value}})',
    parameters: [
      { name: 'timeout', source: 'value' },
    ],
  },
  waitForElement: {
    seleniumMethod: 'waitForElement',
    targetMethod: 'waitForSelector',
    template: 'await page.waitForSelector({{locator}}, { timeout: {{timeout}} })',
    parameters: [
      { name: 'locator', source: 'locator' },
      { name: 'timeout', source: 'timeout' },
    ],
  },
  sleep: {
    seleniumMethod: 'Thread.sleep',
    targetMethod: 'waitForTimeout',
    template: 'await page.waitForTimeout({{value}})',
    parameters: [
      { name: 'milliseconds', source: 'value' },
    ],
  },
  select: {
    seleniumMethod: 'selectByVisibleText',
    targetMethod: 'selectOption',
    template: 'await {{locator}}.selectOption({{value}})',
    parameters: [
      { name: 'locator', source: 'locator' },
      { name: 'value', source: 'value' },
    ],
  },
  deselect: {
    seleniumMethod: 'deselectAll',
    targetMethod: 'selectOption',
    template: 'await {{locator}}.selectOption([])',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  assert: {
    seleniumMethod: 'assert',
    targetMethod: 'expect',
    template: 'expect({{actual}}){{matcher}}',
    parameters: [
      { name: 'actual', source: 'value' },
    ],
  },
  verify: {
    seleniumMethod: 'verify',
    targetMethod: 'expect',
    template: 'expect.soft({{actual}}){{matcher}}',
    parameters: [
      { name: 'actual', source: 'value' },
    ],
  },
  assertEquals: {
    seleniumMethod: 'assertEquals',
    targetMethod: 'toEqual',
    template: 'expect({{actual}}).toEqual({{expected}})',
    parameters: [
      { name: 'actual', source: 'value' },
      { name: 'expected', source: 'value' },
    ],
  },
  assertTrue: {
    seleniumMethod: 'assertTrue',
    targetMethod: 'toBeTruthy',
    template: 'expect({{actual}}).toBeTruthy()',
    parameters: [
      { name: 'actual', source: 'value' },
    ],
  },
  assertFalse: {
    seleniumMethod: 'assertFalse',
    targetMethod: 'toBeFalsy',
    template: 'expect({{actual}}).toBeFalsy()',
    parameters: [
      { name: 'actual', source: 'value' },
    ],
  },
  assertContains: {
    seleniumMethod: 'assertContains',
    targetMethod: 'toContain',
    template: 'expect({{actual}}).toContain({{expected}})',
    parameters: [
      { name: 'actual', source: 'value' },
      { name: 'expected', source: 'value' },
    ],
  },
  switchTo: {
    seleniumMethod: 'switchTo',
    targetMethod: 'frame',
    template: 'await page.frame({{value}})',
    parameters: [
      { name: 'frame', source: 'value' },
    ],
  },
  frame: {
    seleniumMethod: 'frame',
    targetMethod: 'frame',
    template: 'await page.frame({{value}})',
    parameters: [
      { name: 'frame', source: 'value' },
    ],
  },
  window: {
    seleniumMethod: 'window',
    targetMethod: 'context',
    template: 'await page.context()',
    parameters: [],
  },
  alert: {
    seleniumMethod: 'alert',
    targetMethod: 'on',
    template: 'page.on("dialog", (dialog) => dialog.{{action}}())',
    parameters: [
      { name: 'action', source: 'value' },
    ],
  },
  accept: {
    seleniumMethod: 'accept',
    targetMethod: 'accept',
    template: 'await dialog.accept()',
    parameters: [],
  },
  dismiss: {
    seleniumMethod: 'dismiss',
    targetMethod: 'dismiss',
    template: 'await dialog.dismiss()',
    parameters: [],
  },
  hover: {
    seleniumMethod: 'moveToElement',
    targetMethod: 'hover',
    template: 'await {{locator}}.hover()',
    parameters: [
      { name: 'locator', source: 'locator' },
    ],
  },
  dragAndDrop: {
    seleniumMethod: 'dragAndDrop',
    targetMethod: 'dragTo',
    template: 'await {{sourceLocator}}.dragTo({{targetLocator}})',
    parameters: [
      { name: 'sourceLocator', source: 'locator' },
      { name: 'targetLocator', source: 'locator' },
    ],
  },
  scroll: {
    seleniumMethod: 'executeScript',
    targetMethod: 'evaluate',
    template: 'await page.evaluate(() => window.scrollTo({{x}}, {{y}}))',
    parameters: [
      { name: 'x', source: 'value' },
      { name: 'y', source: 'value' },
    ],
  },
  executeScript: {
    seleniumMethod: 'executeScript',
    targetMethod: 'evaluate',
    template: 'await page.evaluate({{script}})',
    parameters: [
      { name: 'script', source: 'value' },
    ],
  },
  screenshot: {
    seleniumMethod: 'takeScreenshot',
    targetMethod: 'screenshot',
    template: 'await page.screenshot({ path: "{{path}}" })',
    parameters: [
      { name: 'path', source: 'value' },
    ],
  },
  unknown: {
    seleniumMethod: 'unknown',
    targetMethod: 'unknown',
    template: '// Unknown action: {{original}}',
    parameters: [],
  },
};

/**
 * Get assertion matcher based on assertion type
 */
export function getAssertionMatcher(assertionType: string): string {
  const matchers: Record<string, string> = {
    equality: '.toEqual()',
    truthiness: '.toBeTruthy()',
    contains: '.toContain()',
    visibility: '.toBeVisible()',
    exists: '.toBeTruthy()',
    attribute: '.toHaveAttribute()',
  };
  return matchers[assertionType] || '.toEqual()';
}
