/**
 * Code Templates for Test Generation
 * Pre-defined templates for generating test code in different frameworks
 */

import type { CodeTemplate } from './types.js';

/**
 * WebDriverIO TypeScript templates
 */
const webdriverioTypeScriptTemplates: CodeTemplate[] = [
  {
    name: 'wdio-ts-test',
    framework: 'webdriverio',
    language: 'typescript',
    pattern: 'page-object',
    template: `import {{ chaiAssertion }} from 'chai';
import {{ pageObjectImports }};
import { config as wdioConfig } from '../wdio.conf.js';

describe('{{ testSuiteName }}', () => {
  {{#if beforeEachHook}}
  beforeEach(async () => {
    {{ beforeEachHook }}
  });
  {{/if}}

  {{#if afterEachHook}}
  afterEach(async () => {
    {{ afterEachHook }}
  });
  {{/if}}

  {{#each tests}}
  it('{{{ this.title }}}', async () => {
    {{#each this.steps}}
    // {{ this.description }}
    {{ this.code }}
    {{/each}}

    {{#each this.assertions}}
    // {{ this.description }}
    {{ this.code }}
    {{/each}}
  });
  {{/each}}
});`,
    description: 'WebDriverIO test with Page Object Model in TypeScript',
  },
  {
    name: 'wdio-ts-page-object',
    framework: 'webdriverio',
    language: 'typescript',
    pattern: 'page-object',
    template: `import { $, $$, browser } from '@wdio/globals';

/**
 * {{ pageDescription }}
 */
export class {{ className }} {
  {{#each elements}}
  /**
   * {{ this.description }}
   */
  private {{ this.camelCaseName }} = {{ this.locator }};
  {{/each}}

  {{#each methods}}
  /**
   * {{ this.description }}
   */
  async {{ this.name }}({{ this.params }}): Promise<{{ this.returnType }}> {
    {{ this.body }}
  }
  {{/each}}
}`,
    description: 'WebDriverIO Page Object in TypeScript',
  },
];

/**
 * WebDriverIO JavaScript templates
 */
const webdriverioJavaScriptTemplates: CodeTemplate[] = [
  {
    name: 'wdio-js-test',
    framework: 'webdriverio',
    language: 'javascript',
    pattern: 'page-object',
    template: `const { expect } = require('chai');
const {{ pageObjects }} = require('../pageObjects/index.js');

describe('{{ testSuiteName }}', () => {
  {{#each tests}}
  it('{{{ this.title }}}', async () => {
    {{#each this.steps}}
    await {{ this.code }};
    {{/each}}
  });
  {{/each}}
});`,
    description: 'WebDriverIO test in JavaScript',
  },
];

/**
 * Appium TypeScript templates
 */
const appiumTypeScriptTemplates: CodeTemplate[] = [
  {
    name: 'appium-ts-test',
    framework: 'appium',
    language: 'typescript',
    pattern: 'page-object',
    template: `import { $, $$, driver } from '@wdio/globals';
import {{ pageObjectImports }} from '../pageObjects/index.js';

describe('{{ testSuiteName }}', () => {
  before(async () => {
    // Setup code
  });

  after(async () => {
    // Cleanup code
  });

  {{#each tests}}
  it('{{{ this.title }}}', async () => {
    {{#each this.steps}}
    {{ this.code }}
    {{/each}}
  });
  {{/each}
});`,
    description: 'Appium mobile test in TypeScript',
  },
];

/**
 * Playwright TypeScript templates
 */
const playwrightTypeScriptTemplates: CodeTemplate[] = [
  {
    name: 'playwright-ts-test',
    framework: 'playwright',
    language: 'typescript',
    pattern: 'page-object',
    template: `import { test, expect } from '@playwright/test';
import {{ pageObjectImports }} from '../pageObjects/index.js';

test.describe('{{ testSuiteName }}', () => {
  {{#each tests}}
  test('{{{ this.title }}}', async ({ page }) => {
    {{#each this.steps}}
    {{ this.code }}
    {{/each}}
  });
  {{/each}
});`,
    description: 'Playwright test in TypeScript',
  },
];

/**
 * Template registry
 */
export const templateRegistry: Record<string, CodeTemplate> = {};

/**
 * Register all templates
 */
function registerTemplates(): void {
  [...webdriverioTypeScriptTemplates, ...webdriverioJavaScriptTemplates, ...appiumTypeScriptTemplates, ...playwrightTypeScriptTemplates].forEach(
    (template) => {
      const key = `${template.framework}-${template.language}-${template.pattern}-${template.name}`;
      templateRegistry[key] = template;
    }
  );
}

registerTemplates();

/**
 * Get a template by key
 */
export function getTemplate(key: string): CodeTemplate | undefined {
  return templateRegistry[key];
}

/**
 * Get templates for a framework and language
 */
export function getTemplatesForFramework(
  framework: string,
  language: string
): CodeTemplate[] {
  return Object.values(templateRegistry).filter(
    (t) => t.framework === framework && t.language === language
  );
}

/**
 * Get all available template keys
 */
export function getTemplateKeys(): string[] {
  return Object.keys(templateRegistry);
}

/**
 * System prompt for LLM-based code generation
 */
export const CODE_GENERATION_SYSTEM_PROMPT = `You are an expert test automation engineer. Your task is to generate executable test code from structured test specifications.

Rules for code generation:
1. Follow best practices for the target framework (WebDriverIO, Appium, or Playwright)
2. Use Page Object Model when requested - separate page logic from test logic
3. Write clean, maintainable, and well-documented code
4. Include proper assertions for each validation step
5. Handle waiting and synchronization appropriately
6. Use descriptive variable and method names
7. Include error handling where appropriate
8. Follow the specified naming conventions
9. Generate TypeScript code when useTypeScript is true
10. Return only valid code - no explanations outside the code`;

/**
 * JSON schema instruction for code generation
 */
export const CODE_GENERATION_JSON_SCHEMA = `
Respond with a JSON object in the following format:
{
  "files": [
    {
      "fileName": "string",
      "filePath": "string",
      "content": "string",
      "fileType": "test|page-object|helper|config"
    }
  ],
  "warnings": ["string"]
}

Do not include any text outside the JSON object.`;

/**
 * Default few-shot examples for code generation
 */
export const DEFAULT_CODE_GENERATION_EXAMPLES = [
  {
    input: {
      testCase: {
        title: 'Login with valid credentials',
        description: 'Verify user can log in with valid credentials',
        steps: [
          { order: 1, action: 'Navigate to login page', expectedOutcome: 'Login page is displayed' },
          { order: 2, action: 'Enter username', testData: 'testuser@example.com', expectedOutcome: 'Username is entered' },
          { order: 3, action: 'Enter password', testData: 'SecurePass123!', expectedOutcome: 'Password is entered' },
          { order: 4, action: 'Click login button', expectedOutcome: 'User is logged in' },
        ],
        assertions: [
          { condition: 'User is authenticated', expected: 'true', type: 'equality' },
          { condition: 'Dashboard is visible', expected: 'visible', type: 'visibility' },
        ],
        testDataRequirements: [],
        tags: ['authentication', 'login'],
        prerequisites: ['User exists'],
        expectedOutcome: 'User successfully logs in',
      },
      options: {
        framework: 'webdriverio',
        language: 'typescript',
        pattern: 'page-object',
        generatePageObjects: true,
      },
    },
    output: {
      files: [
        {
          fileName: 'login.test.ts',
          filePath: 'tests/login.test.ts',
          content: `import { expect } from '@wdio/globals';
import { LoginPage } from '../pageObjects/LoginPage.js';
import { DashboardPage } from '../pageObjects/DashboardPage.js';

describe('Login with valid credentials', () => {
  it('should log in with valid credentials', async () => {
    const loginPage = new LoginPage();
    const dashboardPage = new DashboardPage();

    await loginPage.open();
    await loginPage.login('testuser@example.com', 'SecurePass123!');

    expect(await dashboardPage.isVisible()).toBe(true);
  });
});`,
          fileType: 'test',
        },
        {
          fileName: 'LoginPage.ts',
          filePath: 'pageObjects/LoginPage.ts',
          content: `import { $, browser } from '@wdio/globals';

/**
 * Login Page Object
 */
export class LoginPage {
  /**
   * Define page elements
   */
  get usernameInput() { return $('#username'); }
  get passwordInput() { return $('#password'); }
  get loginButton() { return $('#login-btn'); }

  /**
   * Navigate to login page
   */
  async open(): Promise<void> {
    await browser.url('/login');
  }

  /**
   * Perform login with credentials
   */
  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.setValue(username);
    await this.passwordInput.setValue(password);
    await this.loginButton.click();
  }
}`,
          fileType: 'page-object',
        },
        {
          fileName: 'DashboardPage.ts',
          filePath: 'pageObjects/DashboardPage.ts',
          content: `import { $ } from '@wdio/globals';

/**
 * Dashboard Page Object
 */
export class DashboardPage {
  get header() { return $('h1'); }

  async isVisible(): Promise<boolean> {
    return await this.header.isDisplayed();
  }
}`,
          fileType: 'page-object',
        },
      ],
      warnings: [],
    },
  },
];

/**
 * Framework capability definitions
 */
export const frameworkCapabilities: Record<string, {
  languages: string[];
  patterns: string[];
  supportsPageObjects: boolean;
  supportsMobile: boolean;
  defaultFileExtension: string;
  supportsTypeScript: boolean;
}> = {
  webdriverio: {
    languages: ['typescript', 'javascript'],
    patterns: ['page-object', 'inline', 'data-driven'],
    supportsPageObjects: true,
    supportsMobile: true,
    defaultFileExtension: '.ts',
    supportsTypeScript: true,
  },
  appium: {
    languages: ['typescript', 'javascript'],
    patterns: ['page-object', 'inline'],
    supportsPageObjects: true,
    supportsMobile: true,
    defaultFileExtension: '.ts',
    supportsTypeScript: true,
  },
  playwright: {
    languages: ['typescript', 'javascript'],
    patterns: ['page-object', 'inline'],
    supportsPageObjects: true,
    supportsMobile: false,
    defaultFileExtension: '.ts',
    supportsTypeScript: true,
  },
};
