/**
 * Dependency Category Matcher
 *
 * Categorizes dependencies based on package names and patterns
 * for Appium, WebDriver, browser drivers, and testing tools.
 */

import { DependencyCategory, type CategoryPattern } from './types.js';

/**
 * Pattern definitions for each dependency category
 */
const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: DependencyCategory.APPIUM,
    patterns: [
      /^appium(?:$|[-/])/,
      /^@appium\/.+/,
      /^appium-(.+)/,
    ],
    checkSecurity: true,
  },
  {
    category: DependencyCategory.WEBDRIVER,
    patterns: [
      /^selenium(?:$|[-/])/,
      /^selenium-(.+)/,
      /^@wdio\/.+/,
      /^webdriver(?:$|[-/])/,
      /^webdriverio(?:$|[-/])/,
    ],
    checkSecurity: true,
  },
  {
    category: DependencyCategory.BROWSER_DRIVER,
    patterns: [
      /^chromedriver$/,
      /^geckodriver$/,
      /^edgedriver$/,
      /^safaridriver$/,
      /^IEDriverServer$/,
      /^operadriver$/,
      /^microsoft-(.+)driver/,
      /^@puppeteer\/browsers$/,
      /^puppeteer$/,
      /^playwright-chromium$/,
      /^playwright-firefox$/,
      /^playwright-webkit$/,
    ],
    checkSecurity: true,
  },
  {
    category: DependencyCategory.PLAYWRIGHT,
    patterns: [
      /^@playwright\/.+/,
      /^playwright$/,
    ],
    checkSecurity: true,
  },
  {
    category: DependencyCategory.TESTING,
    patterns: [
      /^@types\/(.+)/,
      /^jest(?:$|[-/])/,
      /^mocha$/,
      /^chai$/,
      /^vitest$/,
      /^cypress$/,
      /^@cypress\/.+/,
      /^testing-library\/.+/,
      /^@testing-library\/.+/,
      /^test$/,
      /^tape$/,
      /^ava$/,
      /^supertest$/,
      /^msw$/,
      /^@msw\/.+/,
    ],
    checkSecurity: false,
  },
];

/**
 * Known testing-related packages that should be checked
 * but may not match pattern rules
 */
const KNOWN_TESTING_PACKAGES = new Set([
  '@playwright/test',
  'playwright',
  '@types/pixelmatch',
  'pixelmatch',
]);

/**
 * Determine the category of a dependency based on its name
 */
export function categorizeDependency(packageName: string): DependencyCategory {
  const normalizedName = packageName.toLowerCase().trim();

  // Check each category pattern
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedName)) {
        return category;
      }
    }
  }

  // Check known testing packages
  if (KNOWN_TESTING_PACKAGES.has(normalizedName)) {
    return DependencyCategory.TESTING;
  }

  return DependencyCategory.DEPS;
}

/**
 * Get all package names matching a specific category
 */
export function filterPackagesByCategory(
  packageNames: string[],
  category: DependencyCategory
): string[] {
  return packageNames.filter((name) => categorizeDependency(name) === category);
}

/**
 * Get categories for multiple packages
 */
export function categorizePackages(packageNames: string[]): Map<string, DependencyCategory> {
  const result = new Map<string, DependencyCategory>();
  for (const name of packageNames) {
    result.set(name, categorizeDependency(name));
  }
  return result;
}

/**
 * Check if security checks should be performed for a package
 */
export function shouldCheckSecurity(packageName: string): boolean {
  const category = categorizeDependency(packageName);
  const pattern = CATEGORY_PATTERNS.find((p) => p.category === category);
  return pattern?.checkSecurity ?? false;
}

/**
 * Get all categories that should be checked based on configuration
 */
export function getEnabledCategories(
  requestedCategories: DependencyCategory[]
): DependencyCategory[] {
  if (requestedCategories.includes(DependencyCategory.ALL)) {
    return Object.values(DependencyCategory);
  }
  return requestedCategories;
}

/**
 * Check if a package name matches any critical dependency pattern
 * (Appium, WebDriver, browser drivers)
 */
export function isCriticalDependency(packageName: string): boolean {
  const category = categorizeDependency(packageName);
  return [
    DependencyCategory.APPIUM,
    DependencyCategory.WEBDRIVER,
    DependencyCategory.BROWSER_DRIVER,
    DependencyCategory.PLAYWRIGHT,
  ].includes(category);
}

/**
 * Format category name for display
 */
export function formatCategoryName(category: DependencyCategory): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
