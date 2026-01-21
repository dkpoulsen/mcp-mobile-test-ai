/**
 * CLI Tool for Smart Test Selector
 * Command-line interface for selecting and running tests
 */

import { createModuleLogger } from '../../utils/logger.js';
import { SmartTestSelector } from './smart-test-selector.js';
import { parseChangedFilesFromGit } from './change-analyzer.js';
import type { TestSelectorConfig, SelectionStrategy } from './types.js';

const logger = createModuleLogger('smart-test-selector-cli');

/**
 * CLI options for test selection
 */
export interface CliOptions {
  /** Base branch to compare against */
  baseBranch?: string;
  /** Selection strategy */
  strategy?: SelectionStrategy;
  /** Full test threshold */
  fullTestThreshold?: number;
  /** Include flaky tests */
  includeFlaky?: boolean;
  /** Maximum tests to select */
  maxTests?: number;
  /** Output format */
  format?: 'text' | 'json' | 'list';
  /** Output test command */
  command?: string;
  /** Verbose output */
  verbose?: boolean;
  /** Project root directory */
  root?: string;
}

/**
 * Run the CLI
 */
export async function runCli(options: CliOptions = {}): Promise<void> {
  const {
    baseBranch = 'main',
    strategy,
    fullTestThreshold,
    includeFlaky,
    maxTests,
    format = 'text',
    command,
    verbose = false,
    root = process.cwd(),
  } = options;

  if (verbose) {
    // Logger level adjustment would go here if supported
  }

  logger.info('Starting smart test selection CLI');

  // Build configuration
  const config: Partial<TestSelectorConfig> = {};
  if (strategy) config.strategy = strategy;
  if (fullTestThreshold) config.fullTestThreshold = fullTestThreshold;
  if (includeFlaky !== undefined) config.includeFlaky = includeFlaky;
  if (maxTests) config.maxTests = maxTests;

  // Create selector
  const selector = new SmartTestSelector(root, config);

  // Get changed files
  const changedFiles = await parseChangedFilesFromGit(baseBranch);

  if (changedFiles.length === 0) {
    logger.info('No changes detected');
    outputNoChanges(format);
    return;
  }

  // Select tests
  const result = await selector.selectTests(changedFiles);

  // Output results
  switch (format) {
    case 'json':
      outputJson(result);
      break;
    case 'list':
      outputList(result, command);
      break;
    case 'text':
    default:
      outputText(result, command);
      break;
  }
}

/**
 * Output results in text format
 */
function outputText(result: any, command?: string): void {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('Smart Test Selection Results');
  lines.push('='.repeat(60));
  lines.push('');

  lines.push(`Selected Tests: ${result.selectedCount}`);
  lines.push(`Skipped Tests: ${result.skippedCount}`);
  lines.push(`Time Savings: ${formatDuration(result.estimatedTimeSavings)}`);
  lines.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  lines.push('');

  if (result.selectedTests.length > 0) {
    lines.push('Selected Tests:');
    lines.push('-'.repeat(60));

    for (const test of result.selectedTests) {
      lines.push(`  ${test.testPath}`);
      lines.push(`    Priority: ${(test.priority * 100).toFixed(1)}%`);
      lines.push(`    Reason: ${test.reason}`);
      if (test.estimatedDuration) {
        lines.push(`    Duration: ${formatDuration(test.estimatedDuration)}`);
      }
      lines.push('');
    }

    if (command) {
      const testPaths = result.selectedTests.map((t: any) => `"${t.testPath}"`).join(' ');
      lines.push('Test Command:');
      lines.push('-'.repeat(60));
      lines.push(`  ${command} ${testPaths}`);
      lines.push('');
    }
  }

  console.log(lines.join('\n'));
}

/**
 * Output results in JSON format
 */
function outputJson(result: any): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Output results in list format (just test paths)
 */
function outputList(result: any, command?: string): void {
  const testPaths = result.selectedTests.map((t: any) => t.testPath);

  if (command) {
    const quotedPaths = testPaths.map((p: string) => `"${p}"`).join(' ');
    console.log(`${command} ${quotedPaths}`);
  } else {
    testPaths.forEach((path: string) => console.log(path));
  }
}

/**
 * Output when no changes detected
 */
function outputNoChanges(format: string): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify({ selectedTests: [], selectedCount: 0, message: 'No changes detected' }, null, 2));
      break;
    case 'list':
      console.log('# No changes detected');
      break;
    case 'text':
    default:
      console.log('No changes detected. No tests need to run.');
      break;
  }
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * CLI entry point when run directly
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--base':
      case '-b':
        options.baseBranch = args[++i] ?? 'main';
        break;
      case '--strategy':
      case '-s':
        options.strategy = args[++i] as SelectionStrategy;
        break;
      case '--threshold':
      case '-t':
        options.fullTestThreshold = parseInt(args[++i] ?? '20', 10);
        break;
      case '--max-tests':
      case '-m':
        options.maxTests = parseInt(args[++i] ?? '0', 10);
        break;
      case '--no-flaky':
        options.includeFlaky = false;
        break;
      case '--format':
      case '-f':
        options.format = args[++i] as 'text' | 'json' | 'list';
        break;
      case '--command':
      case '-c':
        options.command = args[++i] ?? '';
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--root':
      case '-r':
        options.root = args[++i] ?? process.cwd();
        break;
      case '--help':
      case '-h':
        printHelp();
        return;
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  await runCli(options);
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Smart Test Selector CLI

Analyzes code changes and selects relevant tests to run.

Usage:
  smart-test-selector [options]

Options:
  -b, --base <branch>       Base branch to compare against (default: main)
  -s, --strategy <name>     Selection strategy (default: balanced)
                            Options: affected_only, affected_plus_high_risk,
                            affected_plus_flaky, threshold_based, balanced
  -t, --threshold <num>     Run all tests if files changed exceeds this (default: 20)
  -m, --max-tests <num>     Maximum number of tests to select
      --no-flaky            Exclude flaky tests from selection
  -f, --format <type>       Output format: text, json, list (default: text)
  -c, --command <cmd>       Test command template (e.g., "npm test --")
  -r, --root <path>         Project root directory (default: cwd)
  -v, --verbose             Enable verbose output
  -h, --help                Show this help message

Examples:
  # Select tests comparing to main branch
  smart-test-selector

  # Get JSON output
  smart-test-selector --format json

  # Get test command directly
  smart-test-selector --format list --command "npm test --"

  # Use specific strategy
  smart-test-selector --strategy affected_plus_flaky

  # Compare to develop branch
  smart-test-selector --base develop

Exit codes:
  0 - Success
  1 - Error or invalid option
`);
}
