/**
 * CLI Command: Convert
 * Convert Selenium tests from Java/Python to TypeScript
 */

import type { TargetFramework } from '../../services/selenium-converter/types.js';
import type { ConversionOptions } from '../../services/selenium-converter/types.js';
import { getSeleniumConverter } from '../../services/selenium-converter/index.js';

/**
 * Display help for the convert command
 */
export function displayConvertHelp(): void {
  console.log(`
Selenium Test Converter
=======================

Converts existing Selenium tests from Java or Python to TypeScript for the platform.

Usage:
  mcp-mobile-test convert [options] <input-path>

Arguments:
  input-path              Path to test file or directory to convert

Options:
  -f, --framework <name>  Target framework: playwright, webdriverio, appium
                          (default: playwright)

  -o, --output <dir>      Output directory for converted tests
                          (default: tests/converted)

  --no-page-objects       Don't generate page object classes

  --no-comments           Don't include comments in generated code

  --base-url <url>        Base URL for tests (default: http://localhost:3000)

  --timeout <ms>          Default timeout in milliseconds

  -h, --help              Show this help message

Examples:
  # Convert a single Java file
  mcp-mobile-test convert LoginTest.java

  # Convert a Python test directory
  mcp-mobile-test convert tests/python/selenium/

  # Convert to WebDriverIO format
  mcp-mobile-test convert -f webdriverio -o tests/wdio OldTests.java

  # Convert without page objects
  mcp-mobile-test convert --no-page-objects MyTest.py

Supported Source Formats:
  - Java Selenium tests (.java files)
  - Python Selenium tests (.py files)

Supported Target Frameworks:
  - Playwright (default)
  - WebDriverIO
  - Appium
`);
}

/**
 * Parse command line arguments for convert command
 */
interface ConvertCommandArgs {
  inputPath: string;
  framework: TargetFramework;
  outputDir: string;
  generatePageObjects: boolean;
  includeComments: boolean;
  baseUrl: string;
  timeout?: number;
  help: boolean;
}

export function parseConvertArgs(args: string[]): ConvertCommandArgs {
  const parsed: ConvertCommandArgs = {
    inputPath: '',
    framework: 'playwright',
    outputDir: 'tests/converted',
    generatePageObjects: true,
    includeComments: true,
    baseUrl: 'http://localhost:3000',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        parsed.help = true;
        break;

      case '-f':
      case '--framework':
        const frameworkValue = args[++i];
        if (frameworkValue) {
          parsed.framework = frameworkValue as TargetFramework;
        }
        break;

      case '-o':
      case '--output':
        const outputValue = args[++i];
        if (outputValue) {
          parsed.outputDir = outputValue;
        }
        break;

      case '--no-page-objects':
        parsed.generatePageObjects = false;
        break;

      case '--no-comments':
        parsed.includeComments = false;
        break;

      case '--base-url':
        const urlValue = args[++i];
        if (urlValue) {
          parsed.baseUrl = urlValue;
        }
        break;

      case '--timeout':
        const timeoutValue = args[++i];
        if (timeoutValue) {
          parsed.timeout = parseInt(timeoutValue, 10);
        }
        break;

      default:
        // Positional argument - input path
        if (arg && !arg.startsWith('-')) {
          parsed.inputPath = arg;
        }
        break;
    }
  }

  return parsed;
}

/**
 * Execute the convert command
 */
export async function executeConvertCommand(args: string[]): Promise<void> {
  const parsed = parseConvertArgs(args);

  if (parsed.help || !parsed.inputPath) {
    displayConvertHelp();
    return;
  }

  // Validate framework
  const validFrameworks: TargetFramework[] = ['playwright', 'webdriverio', 'appium'];
  if (!validFrameworks.includes(parsed.framework)) {
    console.error(`Error: Invalid framework '${parsed.framework}'. Valid options: ${validFrameworks.join(', ')}`);
    process.exit(1);
  }

  // Build conversion options
  const options: ConversionOptions = {
    targetFramework: parsed.framework,
    outputDir: parsed.outputDir,
    generatePageObjects: parsed.generatePageObjects,
    includeComments: parsed.includeComments,
    baseUrl: parsed.baseUrl,
    useTypeScript: true,
    preserveStructure: true,
    timeout: parsed.timeout
      ? {
          implicit: parsed.timeout,
          pageLoad: parsed.timeout * 6,
          script: parsed.timeout * 3,
        }
      : undefined,
  };

  console.log(`\n🔄 Converting Selenium tests...`);
  console.log(`   Input: ${parsed.inputPath}`);
  console.log(`   Framework: ${parsed.framework}`);
  console.log(`   Output: ${parsed.outputDir}\n`);

  const startTime = Date.now();

  try {
    const converter = getSeleniumConverter();
    const result = await converter.convertFile(parsed.inputPath, options);

    if (result.success) {
      console.log(`✅ Conversion successful!\n`);
      console.log(`Summary:`);
      console.log(`   Test cases converted: ${result.summary.testCasesConverted}`);
      console.log(`   Page objects generated: ${result.summary.pageObjectsGenerated}`);
      console.log(`   Actions converted: ${result.summary.actionsConverted}`);
      console.log(`   Processing time: ${result.summary.processingTimeMs}ms\n`);

      if (result.files.length > 0) {
        console.log(`Generated files:`);
        for (const file of result.files) {
          console.log(`   - ${file.filePath} (${file.fileType})`);
        }
        console.log();
      }

      if (result.warnings.length > 0) {
        console.log(`Warnings:`);
        for (const warning of result.warnings) {
          console.log(`   ⚠️  ${warning}`);
        }
        console.log();
      }
    } else {
      console.error(`❌ Conversion failed!\n`);
      for (const error of result.errors) {
        console.error(`   ${error}`);
      }
      console.error();

      if (result.warnings.length > 0) {
        console.warn(`Warnings:`);
        for (const warning of result.warnings) {
          console.warn(`   ⚠️  ${warning}`);
        }
        console.warn();
      }

      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error during conversion:`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(`Use --help for usage information.\n`);
    process.exit(1);
  }

  const totalTime = Date.now() - startTime;
  console.log(`Total time: ${totalTime}ms\n`);
}
