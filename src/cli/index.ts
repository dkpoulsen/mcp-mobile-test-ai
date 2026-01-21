#!/usr/bin/env node
/**
 * CLI entry point for MCP Mobile Test AI
 */

import { createMcpMobileTest } from '../core/index.js';
import { executeConvertCommand } from './commands/convert.js';
import { main as testDocsMain } from './test-docs.js';

const args = process.argv.slice(2);

async function main(): Promise<void> {
  // Check for convert command
  if (args[0] === 'convert') {
    await executeConvertCommand(args.slice(1));
    return;
  }

  // Check for test-docs command
  if (args[0] === 'test-docs') {
    await testDocsMain();
    return;
  }

  // Show help if no args or help requested
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    displayMainHelp();
    return;
  }

  // Default: run the main application
  const verbose = args.includes('--verbose') || args.includes('-v');

  const mcpMobileTest = await createMcpMobileTest({ verbose });

  console.info(`MCP Mobile Test AI v${mcpMobileTest.getVersion()}`);

  await mcpMobileTest.initialize();

  await mcpMobileTest.shutdown();
}

/**
 * Display main CLI help
 */
function displayMainHelp(): void {
  console.log(`
MCP Mobile Test AI
==================

An intelligent mobile testing framework leveraging LLMs and MCP for automated
mobile application testing.

Usage:
  mcp-mobile-test [command] [options]

Commands:
  convert                 Convert Selenium tests from Java/Python to TypeScript
  test-docs               Generate test documentation from test code

  (no command)            Start the MCP Mobile Test server

Options:
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message

Examples:
  # Start the server
  mcp-mobile-test

  # Convert Selenium tests
  mcp-mobile-test convert LoginTest.java
  mcp-mobile-test convert -f webdriverio tests/selenium/

  # Generate test documentation
  mcp-mobile-test test-docs
  mcp-mobile-test test-docs --format json
  mcp-mobile-test test-docs --output ./custom-docs

For more information on a specific command, use:
  mcp-mobile-test test-docs --help
`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
