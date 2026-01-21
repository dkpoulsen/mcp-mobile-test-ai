/**
 * CLI for generating test documentation
 *
 * Usage:
 *   mcp-mobile-test test-docs                    # Generate markdown docs to ./docs/tests
 *   mcp-mobile-test test-docs --format json     # Generate JSON docs
 *   mcp-mobile-test test-docs --output ./docs   # Custom output directory
 */

import { parseArgs } from 'node:util';
import { relative, join } from 'node:path';
import type { DocumentationOptions } from '../services/test-docs/types.js';
import { generateDocumentation } from '../services/test-docs/generator.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('cli:test-docs');

/**
 * CLI configuration
 */
interface CliOptions {
  format: 'markdown' | 'json' | 'html';
  output: string;
  testDir: string;
  steps: boolean;
  coverage: boolean;
  tags: boolean;
  help: boolean;
}

/**
 * Parse CLI arguments for test-docs subcommand
 */
function parseCliOptions(): CliOptions {
  // Determine if we're being called via mcp-mobile-test test-docs or directly
  const argsStart = process.argv[1].includes('test-docs.ts') ? 2 : 3;
  const { values, positionals } = parseArgs({
    args: process.argv.slice(argsStart),
    options: {
      format: {
        type: 'string',
        short: 'f',
        default: 'markdown',
      },
      output: {
        type: 'string',
        short: 'o',
        default: './docs/tests',
      },
      testDir: {
        type: 'string',
        short: 't',
        default: './tests',
      },
      steps: {
        type: 'boolean',
        short: 's',
        default: true,
      },
      coverage: {
        type: 'boolean',
        short: 'c',
        default: true,
      },
      tags: {
        type: 'boolean',
        short: 'g',
        default: true,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    allowPositionals: true,
    strict: false,
  });

  return {
    format: values.format as 'markdown' | 'json' | 'html',
    output: values.output,
    testDir: values.testDir,
    steps: values.steps,
    coverage: values.coverage,
    tags: values.tags,
    help: values.help,
  };
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Test Documentation Generator

Automatically generates and maintains test documentation from test code.
Includes purpose, steps, coverage areas, and execution frequency.

Usage:
  test-docs [options]

Options:
  -f, --format <format>    Output format: markdown, json, or html (default: markdown)
  -o, --output <path>      Output directory (default: ./docs/tests)
  -t, --test-dir <path>    Test directory to scan (default: ./tests)
  -s, --steps              Include test steps in documentation (default: true)
  -c, --coverage           Include coverage analysis (default: true)
  -g, --tags               Group documentation by tags (default: true)
  -h, --help               Show this help message

Examples:
  test-docs                              # Generate markdown docs
  test-docs --format json                # Generate JSON docs
  test-docs --output ./docs              # Custom output directory
  test-docs --no-steps                   # Exclude test steps
  test-docs --format html --output ./site/docs

Documentation Tags (use in test file comments):
  @tag <name>            Categorize tests with custom tags
  @coverage <area>       Specify coverage areas (comma-separated)
  @frequency <level>     Execution frequency: always, often, sometimes, rarely
  @type <type>           Test type: unit, integration, e2e, api, visual, accessibility
  @dependency <path>     Related files or dependencies

Example test documentation:
  /**
   * Tests the health check endpoints
   * @tag api health smoke
   * @coverage endpoints, health-check
   * @frequency always
   *\/
  describe('Health API', () => {
    it('should return health status', async () => {
      // Test implementation
    });
  });

For more information, see the project documentation.
`);
}

/**
 * Main CLI entry point
 */
export async function main(): Promise<void> {
  const options = parseCliOptions();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate format
  if (!['markdown', 'json', 'html'].includes(options.format)) {
    console.error(`Error: Invalid format '${options.format}'. Must be markdown, json, or html.`);
    process.exit(1);
  }

  // Build documentation options
  const docOptions: DocumentationOptions = {
    outputDir: options.output,
    format: options.format,
    includeSteps: options.steps,
    includeCoverage: options.coverage,
    groupByTags: options.tags,
    testDir: options.testDir,
    patterns: ['**/*.test.ts', '**/*.spec.ts'],
    excludePatterns: [],
  };

  console.log(`🔍 Scanning tests in: ${docOptions.testDir}`);
  console.log(`📝 Generating ${docOptions.format} documentation...`);

  // Generate documentation
  const result = await generateDocumentation(docOptions);

  if (result.success) {
    console.log(`\n✅ Documentation generated successfully!`);
    console.log(`   Files processed: ${result.filesProcessed}`);
    console.log(`   Docs created: ${result.docsCreated}`);

    if (result.outputPaths.length > 0) {
      console.log(`\n📂 Output files:`);
      for (const path of result.outputPaths) {
        const relPath = relative(process.cwd(), path);
        console.log(`   - ${relPath}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      for (const warning of result.warnings) {
        console.log(`   - ${warning}`);
      }
    }

    console.log(`\n📖 View documentation:`);
    const indexPath = join(docOptions.outputDir, 'README.md');
    const relativeIndexPath = relative(process.cwd(), indexPath);
    console.log(`   ${relativeIndexPath}`);

    process.exit(0);
  } else {
    console.error(`\n❌ Documentation generation failed.`);
    console.error(`   Error: ${result.error}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('CLI error', { error: error.message });
    console.error(`\n❌ Unexpected error: ${error.message}`);
    process.exit(1);
  });
}
