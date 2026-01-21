/**
 * Test Runner
 *
 * Executes test suites for dependency updates and parses results
 * to determine if updates are safe to merge.
 */

import { spawn } from 'node:child_process';
import { readFile, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { TestResults, IndividualTestResult, DependencyUpdaterConfig } from './types.js';
import { TestExecutionError } from './types.js';

/**
 * Default timeout for test execution (30 minutes)
 */
const DEFAULT_TEST_TIMEOUT = 30 * 60 * 1000;

/**
 * Test command presets for different project types
 */
const TEST_PRESETS: Record<string, string[]> = {
  npm: ['npm', 'test'],
  yarn: ['yarn', 'test'],
  pnpm: ['pnpm', 'test'],
  'npm-ci': ['npm', 'run', 'test:ci'],
  'npm-all': ['npm', 'run', 'test:all'],
  playwright: ['npx', 'playwright', 'test'],
  jest: ['npx', 'jest', '--ci', '--coverage'],
  vitest: ['npx', 'vitest', 'run', '--coverage'],
};

/**
 * Parse test output to extract test results
 */
function parseTestOutput(output: string, testName?: string): IndividualTestResult[] {
  const tests: IndividualTestResult[] = [];

  // Try to parse Playwright JSON output
  const playwrightJsonMatch = output.match(/\{[\s\S]*?\}/);
  if (playwrightJsonMatch) {
    try {
      const parsed = JSON.parse(playwrightJsonMatch[0]);
      if (parsed.stats) {
        return [{
          name: testName || 'Playwright Test Suite',
          status: parsed.stats.failed === 0 ? 'passed' : 'failed',
          duration: parsed.stats.duration || 0,
          error: parsed.stats.failed > 0 ? `${parsed.stats.failed} test(s) failed` : undefined,
        }];
      }
    } catch {
      // Continue to other parsing methods
    }
  }

  // Try to parse TAP (Test Anything Protocol) output
  const tapLines = output.split('\n');
  let currentTest: IndividualTestResult | null = null;
  let testStartTime = Date.now();

  for (const line of tapLines) {
    const notOkMatch = line.match(/^not ok (\d+)\s+(.+)$/);
    const okMatch = line.match(/^ok (\d+)\s+(.+)$/);
    const diagnosticMatch = line.match(/^\s+(.+)/);

    if (notOkMatch) {
      if (currentTest) {
        tests.push(currentTest);
      }
      currentTest = {
        name: notOkMatch[2],
        status: 'failed',
        duration: 0,
        error: undefined,
      };
    } else if (okMatch) {
      if (currentTest) {
        tests.push(currentTest);
      }
      currentTest = {
        name: okMatch[2],
        status: 'passed',
        duration: 0,
      };
    } else if (diagnosticMatch && currentTest && currentTest.status === 'failed') {
      currentTest.error = (currentTest.error || '') + '\n' + diagnosticMatch[1];
    }
  }

  if (currentTest) {
    tests.push(currentTest);
  }

  // Default fallback - treat the entire output as one test
  if (tests.length === 0) {
    const hasError = output.toLowerCase().includes('fail') ||
      output.toLowerCase().includes('error') ||
      output.includes('✗') ||
      output.includes('✖');

    tests.push({
      name: testName || 'Test Suite',
      status: hasError ? 'failed' : 'passed',
      duration: 0,
      error: hasError ? 'Test execution failed' : undefined,
    });
  }

  return tests;
}

/**
 * Parse JSON test results file
 */
async function parseJsonTestResults(resultsPath: string): Promise<IndividualTestResult[]> {
  try {
    const content = await readFile(resultsPath, 'utf-8');
    const data = JSON.parse(content);

    // Handle JUnit XML format converted to JSON
    if (data.testsuites) {
      const tests: IndividualTestResult[] = [];
      const suites = Array.isArray(data.testsuites.testsuite)
        ? data.testsuites.testsuite
        : [data.testsuites.testsuite];

      for (const suite of suites) {
        const cases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase || []];
        for (const tc of cases) {
          if (tc) {
            tests.push({
              name: tc.name || tc.classname || 'Unknown Test',
              status: tc.failure || tc.error ? 'failed' : 'passed',
              duration: parseFloat(tc.time || '0') * 1000,
              error: tc.failure?.$.message || tc.error?.$.message,
            });
          }
        }
      }
      return tests;
    }

    // Handle Playwright results format
    if (data.stats) {
      return [{
        name: 'Playwright Test Suite',
        status: data.stats.failed === 0 ? 'passed' : 'failed',
        duration: data.stats.duration || 0,
        error: data.stats.failed > 0 ? `${data.stats.failed} test(s) failed` : undefined,
      }];
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Search for test result files in a directory
 */
async function findTestResultFiles(dir: string): Promise<string[]> {
  const resultFiles: string[] = [];
  const patterns = [
    'test-results',
    'test-results.json',
    'results.json',
    'junit.xml',
    'test-report.json',
    'playwright-report',
    'coverage',
  ];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const pattern of patterns) {
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          const fullPath = join(dir, entry.name);
          if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.xml'))) {
            resultFiles.push(fullPath);
          } else if (entry.isDirectory()) {
            // Recursively search subdirectories
            const subResults = await findTestResultFiles(fullPath);
            resultFiles.push(...subResults);
          }
        }
      }
    }
  } catch {
    // Directory might not exist
  }

  return resultFiles;
}

/**
 * Execute a command and capture output
 */
function executeCommand(
  command: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout ?? DEFAULT_TEST_TIMEOUT;
    const startTime = Date.now();

    const proc = spawn(command[0], command.slice(1), {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new TestExecutionError(`Test execution timed out after ${timeout}ms`));
    }, timeout);

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(new TestExecutionError(`Failed to execute test command: ${error.message}`));
    });
  });
}

/**
 * Run tests using the specified command
 */
export async function runTests(
  command: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<TestResults> {
  const startTime = Date.now();

  try {
    const { stdout, stderr, exitCode } = await executeCommand(command, options);

    const output = stdout + stderr;
    const tests = parseTestOutput(output);

    const failedCount = tests.filter((t) => t.status === 'failed').length;
    const skippedCount = tests.filter((t) => t.status === 'skipped').length;

    return {
      passed: exitCode === 0 && failedCount === 0,
      totalTests: tests.length,
      failedTests: failedCount,
      skippedTests: skippedCount,
      duration: Date.now() - startTime,
      output,
      tests,
    };
  } catch (error) {
    if (error instanceof TestExecutionError) {
      throw error;
    }
    throw new TestExecutionError(
      `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Run tests and parse result files for detailed reporting
 */
export async function runTestsWithArtifacts(
  command: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    artifactDir?: string;
  } = {}
): Promise<TestResults> {
  const cwd = options.cwd || process.cwd();
  const artifactDir = options.artifactDir || join(cwd, 'test-results');

  // Run tests first
  const results = await runTests(command, options);

  // Try to parse detailed results from artifact files
  const resultFiles = await findTestResultFiles(artifactDir);
  const detailedTests: IndividualTestResult[] = [];

  for (const file of resultFiles) {
    const fileTests = await parseJsonTestResults(file);
    detailedTests.push(...fileTests);
  }

  if (detailedTests.length > 0) {
    results.tests = detailedTests;
    results.totalTests = detailedTests.length;
    results.failedTests = detailedTests.filter((t) => t.status === 'failed').length;
    results.skippedTests = detailedTests.filter((t) => t.status === 'skipped').length;
  }

  return results;
}

/**
 * Run the CI test suite based on configuration
 */
export async function runCISuite(
  config: DependencyUpdaterConfig
): Promise<TestResults> {
  const cwd = config.workDir || process.cwd();
  const testCommand = config.testCommand || 'npm test';

  // Parse test command
  const command = testCommand.split(' ');

  return runTestsWithArtifacts(command, {
    cwd,
    env: {
      NODE_ENV: 'test',
      CI: 'true',
    },
    timeout: 60 * 60 * 1000, // 1 hour for CI
    artifactDir: join(cwd, 'test-results'),
  });
}

/**
 * Run specific test types
 */
export async function runTestTypes(
  config: DependencyUpdaterConfig,
  testTypes: ('unit' | 'integration' | 'e2e' | 'android' | 'ios')[]
): Promise<TestResults[]> {
  const results: TestResults[] = [];
  const cwd = config.workDir || process.cwd();

  const testCommands: Record<string, string[]> = {
    unit: ['npm', 'run', 'test:unit'],
    integration: ['npm', 'run', 'docker:test'],
    e2e: ['npx', 'playwright', 'test'],
    android: ['npm', 'run', 'test', '--', 'tests/android/'],
    ios: ['npm', 'run', 'test', '--', 'tests/ios/'],
  };

  for (const type of testTypes) {
    const command = testCommands[type];
    if (command) {
      try {
        const result = await runTestsWithArtifacts(command, {
          cwd,
          timeout: 60 * 60 * 1000,
        });
        results.push(result);
      } catch (error) {
        // Continue running other tests even if one fails
        results.push({
          passed: false,
          totalTests: 0,
          failedTests: 1,
          skippedTests: 0,
          duration: 0,
          output: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}

/**
 * Check if tests should be considered passing based on config
 */
export function areTestsPassing(
  results: TestResults | TestResults[],
  config: DependencyUpdaterConfig
): boolean {
  const allResults = Array.isArray(results) ? results : [results];

  for (const result of allResults) {
    if (!result.passed) {
      return false;
    }
  }

  return true;
}

/**
 * Get test command from package.json scripts
 */
export async function getTestCommand(packageJsonPath: string): Promise<string[]> {
  const content = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  // Prefer specific test commands
  if (packageJson.scripts?.['test:ci']) {
    return ['npm', 'run', 'test:ci'];
  }
  if (packageJson.scripts?.['test:all']) {
    return ['npm', 'run', 'test:all'];
  }
  if (packageJson.scripts?.['test']) {
    return ['npm', 'run', 'test'];
  }

  // Fallback to default
  return ['npm', 'test'];
}

/**
 * Check if test artifacts exist from a previous run
 */
export async function hasTestArtifacts(cwd: string): Promise<boolean> {
  const artifactPaths = [
    join(cwd, 'test-results'),
    join(cwd, 'playwright-report'),
    join(cwd, 'coverage'),
  ];

  for (const path of artifactPaths) {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}
