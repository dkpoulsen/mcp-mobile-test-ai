/**
 * Test Documentation Generator
 * Generates documentation from parsed test metadata
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import type {
  DocumentationOptions,
  DocumentationResult,
  ProjectDocumentation,
  TestFileDocumentation,
  TestCaseMetadata,
} from './types.js';
import { parseTestFiles } from './parser.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('services:test-docs');

/**
 * Default documentation options
 */
export const DEFAULT_OPTIONS: Partial<DocumentationOptions> = {
  outputDir: './docs/tests',
  format: 'markdown',
  includeSteps: true,
  includeCoverage: true,
  groupByTags: true,
  testDir: './tests',
  patterns: ['**/*.test.ts', '**/*.spec.ts'],
  excludePatterns: [],
};

/**
 * Generate test documentation
 */
export async function generateDocumentation(
  options: DocumentationOptions
): Promise<DocumentationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const outputPaths: string[] = [];

  try {
    logger.info('Starting test documentation generation', {
      testDir: opts.testDir,
      outputDir: opts.outputDir,
      format: opts.format,
    });

    // Parse all test files
    const files = await parseTestFiles(opts.testDir, process.cwd(), opts.patterns);

    if (files.length === 0) {
      warnings.push('No test files found matching the specified patterns');
      logger.warn('No test files found', { patterns: opts.patterns });
      return {
        success: true,
        filesProcessed: 0,
        docsCreated: 0,
        outputPaths,
        warnings,
      };
    }

    logger.info(`Found ${files.length} test files`);

    // Create project documentation
    const projectDocs = createProjectDocumentation(files);

    // Generate output based on format
    if (opts.format === 'markdown') {
      await generateMarkdownDocumentation(projectDocs, opts, outputPaths);
    } else if (opts.format === 'json') {
      await generateJsonDocumentation(projectDocs, opts, outputPaths);
    } else if (opts.format === 'html') {
      await generateHtmlDocumentation(projectDocs, opts, outputPaths);
    }

    logger.info('Documentation generation complete', {
      docsCreated: outputPaths.length,
    });

    return {
      success: true,
      filesProcessed: files.length,
      docsCreated: outputPaths.length,
      outputPaths,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Documentation generation failed', { error: errorMessage });

    return {
      success: false,
      filesProcessed: 0,
      docsCreated: 0,
      outputPaths,
      error: errorMessage,
      warnings,
    };
  }
}

/**
 * Create project documentation from parsed files
 */
function createProjectDocumentation(files: TestFileDocumentation[]): ProjectDocumentation {
  const allTests = files.flatMap((f) => f.tests);
  const allTags = new Set<string>();
  const allCoverage = new Set<string>();
  const testsByType: Record<string, number> = {};
  const testsByStatus: Record<string, number> = {};
  const filesByDirectory: Record<string, number> = {};

  const tagIndex = new Map<string, TestCaseMetadata[]>();
  const coverageIndex = new Map<string, TestCaseMetadata[]>();

  // Collect statistics
  for (const file of files) {
    // Count by directory
    const dir = file.relativePath.split('/')[0];
    filesByDirectory[dir] = (filesByDirectory[dir] || 0) + 1;

    for (const test of file.tests) {
      // Count by type
      testsByType[test.type] = (testsByType[test.type] || 0) + 1;

      // Count by status
      const status = test.status || 'active';
      testsByStatus[status] = (testsByStatus[status] || 0) + 1;

      // Collect tags
      for (const tag of test.tags) {
        allTags.add(tag);
        if (!tagIndex.has(tag)) {
          tagIndex.set(tag, []);
        }
        tagIndex.get(tag)!.push(test);
      }

      // Collect coverage
      for (const cov of test.coverage) {
        allCoverage.add(cov);
        if (!coverageIndex.has(cov)) {
          coverageIndex.set(cov, []);
        }
        coverageIndex.get(cov)!.push(test);
      }
    }
  }

  return {
    projectName: 'MCP Mobile Test AI',
    projectVersion: '0.1.0',
    generatedAt: new Date(),
    files,
    summary: {
      totalFiles: files.length,
      totalTests: allTests.length,
      testsByType,
      testsByStatus,
      allTags: Array.from(allTags).sort(),
      allCoverage: Array.from(allCoverage).sort(),
      filesByDirectory,
    },
    tagIndex,
    coverageIndex,
  };
}

/**
 * Generate markdown documentation
 */
async function generateMarkdownDocumentation(
  projectDocs: ProjectDocumentation,
  options: DocumentationOptions,
  outputPaths: string[]
): Promise<void> {
  const { outputDir } = options;

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Generate index
  const indexPath = join(outputDir, 'README.md');
  const indexContent = generateMarkdownIndex(projectDocs, options);
  await writeFile(indexPath, indexContent, 'utf-8');
  outputPaths.push(indexPath);

  // Generate per-file documentation
  for (const file of projectDocs.files) {
    const fileDocPath = join(outputDir, `${file.fileName.replace('.ts', '')}.md`);
    const content = generateMarkdownForFile(file, options);
    await writeFile(fileDocPath, content, 'utf-8');
    outputPaths.push(fileDocPath);
  }

  // Generate tag index if enabled
  if (options.groupByTags && projectDocs.summary.allTags.length > 0) {
    const tagIndexPath = join(outputDir, 'tags.md');
    const tagContent = generateMarkdownTagIndex(projectDocs);
    await writeFile(tagIndexPath, tagContent, 'utf-8');
    outputPaths.push(tagIndexPath);
  }

  // Generate coverage index if enabled
  if (options.includeCoverage && projectDocs.summary.allCoverage.length > 0) {
    const coverageIndexPath = join(outputDir, 'coverage.md');
    const coverageContent = generateMarkdownCoverageIndex(projectDocs);
    await writeFile(coverageIndexPath, coverageContent, 'utf-8');
    outputPaths.push(coverageIndexPath);
  }
}

/**
 * Generate markdown index
 */
function generateMarkdownIndex(
  projectDocs: ProjectDocumentation,
  options: DocumentationOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push('# Test Documentation');
  lines.push('');
  lines.push(
    `> Automatically generated from test code on ${projectDocs.generatedAt.toISOString()}`
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Test Files | ${projectDocs.summary.totalFiles} |`);
  lines.push(`| Total Test Cases | ${projectDocs.summary.totalTests} |`);
  lines.push('');

  // Tests by type
  if (Object.keys(projectDocs.summary.testsByType).length > 0) {
    lines.push('### Tests by Type');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    for (const [type, count] of Object.entries(projectDocs.summary.testsByType)) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
  }

  // Tests by status
  if (Object.keys(projectDocs.summary.testsByStatus).length > 0) {
    lines.push('### Tests by Status');
    lines.push('');
    lines.push('| Status | Count |');
    lines.push('|--------|-------|');
    for (const [status, count] of Object.entries(projectDocs.summary.testsByStatus)) {
      lines.push(`| ${status} | ${count} |`);
    }
    lines.push('');
  }

  // Tags
  if (projectDocs.summary.allTags.length > 0) {
    lines.push('### Tags');
    lines.push('');
    for (const tag of projectDocs.summary.allTags) {
      const count = projectDocs.tagIndex.get(tag)?.length || 0;
      lines.push(`- \`${tag}\` (${count} tests)`);
    }
    lines.push('');
  }

  // Coverage areas
  if (projectDocs.summary.allCoverage.length > 0) {
    lines.push('### Coverage Areas');
    lines.push('');
    for (const coverage of projectDocs.summary.allCoverage) {
      const count = projectDocs.coverageIndex.get(coverage)?.length || 0;
      lines.push(`- ${coverage} (${count} tests)`);
    }
    lines.push('');
  }

  // Test files
  lines.push('## Test Files');
  lines.push('');
  for (const file of projectDocs.files) {
    const fileName = file.fileName.replace('.ts', '');
    lines.push(`### [${file.fileName}](${fileName}.md)`);
    lines.push('');
    lines.push(`- **Type**: ${file.testType}`);
    lines.push(`- **Tests**: ${file.testCount}`);
    if (file.tags.size > 0) {
      lines.push(`- **Tags**: ${Array.from(file.tags).map((t) => `\`${t}\``).join(', ')}`);
    }
    if (file.coverage.size > 0) {
      lines.push(`- **Coverage**: ${Array.from(file.coverage).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate markdown for a single test file
 */
function generateMarkdownForFile(
  file: TestFileDocumentation,
  options: DocumentationOptions
): string {
  const lines: string[] = [];

  // Header
  const typeEmoji = getTypeEmoji(file.testType);
  lines.push(`# ${typeEmoji} ${file.fileName}`);
  lines.push('');
  lines.push(`> **File**: \`${file.relativePath}\``);
  lines.push(`> **Type**: ${file.testType}`);
  lines.push(`> **Tests**: ${file.testCount}`);
  lines.push(`> **Generated**: ${file.generatedAt.toISOString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // File-level tags and coverage
  if (file.tags.size > 0 || file.coverage.size > 0) {
    lines.push('## Overview');
    lines.push('');
    if (file.tags.size > 0) {
      lines.push(`**Tags**: ${Array.from(file.tags).map((t) => `\`${t}\``).join(', ')}`);
      lines.push('');
    }
    if (file.coverage.size > 0) {
      lines.push(`**Coverage**: ${Array.from(file.coverage).join(', ')}`);
      lines.push('');
    }
    lines.push('');
  }

  const fileName = file.fileName.replace('.ts', '');

  // Test suites
  for (const suite of file.suites) {
    generateSuiteMarkdown(lines, suite, [], options, fileName);
  }

  // Standalone tests (not in suites)
  const standaloneTests = file.tests.filter((t) => !t.suite);
  if (standaloneTests.length > 0) {
    lines.push('## Tests');
    lines.push('');
    for (const test of standaloneTests) {
      generateTestMarkdown(lines, test, options, fileName);
    }
  }

  return lines.join('\n');
}

/**
 * Generate markdown for a test suite
 */
function generateSuiteMarkdown(
  lines: string[],
  suite: { name: string; description?: string; tests: TestCaseMetadata[]; suites: any[] },
  path: string[],
  options: DocumentationOptions,
  fileName: string
): void {
  const currentPath = [...path, suite.name];
  const indent = '#'.repeat(Math.min(currentPath.length + 1, 6));

  lines.push(`${indent} ${suite.name}`);
  lines.push('');
  if (suite.description) {
    lines.push(suite.description);
    lines.push('');
  }

  // Tests in this suite
  if (suite.tests.length > 0) {
    for (const test of suite.tests) {
      generateTestMarkdown(lines, test, options, fileName);
    }
  }

  // Nested suites
  for (const nestedSuite of suite.suites) {
    generateSuiteMarkdown(lines, nestedSuite, currentPath, options, fileName);
  }
}

/**
 * Generate markdown for a single test
 */
function generateTestMarkdown(
  lines: string[],
  test: TestCaseMetadata,
  options: DocumentationOptions,
  fileName: string
): void {
  const statusEmoji = getStatusEmoji(test.status);
  lines.push(`### ${statusEmoji} ${test.name}`);
  lines.push('');

  // Test metadata
  lines.push('**Test ID**: `' + test.id + '`  ');
  if (test.description) {
    lines.push('');
    lines.push(test.description);
    lines.push('');
  }

  // Tags
  if (test.tags.length > 0) {
    lines.push('**Tags**: ' + test.tags.map((t) => `\`${t}\``).join(', ') + '  ');
  }

  // Coverage
  if (test.coverage.length > 0 && options.includeCoverage) {
    lines.push('**Coverage**: ' + test.coverage.join(', ') + '  ');
  }

  // Frequency
  if (test.frequency) {
    lines.push('**Frequency**: ' + test.frequency + '  ');
  }

  // Type
  lines.push('**Type**: ' + test.type + '  ');
  lines.push('**Location**: [' + fileName + '](' + fileName + ':L' + test.line + ')  ');

  lines.push('');

  // Test steps
  if (options.includeSteps && test.steps.length > 0) {
    lines.push('**Test Steps**:');
    lines.push('');
    for (const step of test.steps) {
      if (step.type) {
        lines.push(`- [${step.type}] ${step.description}`);
      } else {
        lines.push(`- ${step.description}`);
      }
      if (step.expected) {
        lines.push(`  - Expected: ${step.expected}`);
      }
    }
    lines.push('');
  }
}

/**
 * Generate tag index markdown
 */
function generateMarkdownTagIndex(projectDocs: ProjectDocumentation): string {
  const lines: string[] = [];

  lines.push('# Test Documentation - Tag Index');
  lines.push('');
  lines.push(`> Generated on ${projectDocs.generatedAt.toISOString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const sortedTags = Array.from(projectDocs.tagIndex.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [tag, tests] of sortedTags) {
    lines.push(`## \`${tag}\` (${tests.length} tests)`);
    lines.push('');

    for (const test of tests) {
      const testFileName = test.filePath.split('/').pop()!.replace('.ts', '');
      lines.push(
        `- [${test.name}](${testFileName}.md#${test.id.replace(/\//g, '-').toLowerCase()})`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate coverage index markdown
 */
function generateMarkdownCoverageIndex(projectDocs: ProjectDocumentation): string {
  const lines: string[] = [];

  lines.push('# Test Documentation - Coverage Index');
  lines.push('');
  lines.push(`> Generated on ${projectDocs.generatedAt.toISOString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const sortedCoverage = Array.from(projectDocs.coverageIndex.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [coverage, tests] of sortedCoverage) {
    lines.push(`## ${coverage} (${tests.length} tests)`);
    lines.push('');

    for (const test of tests) {
      const testFileName = test.filePath.split('/').pop()!.replace('.ts', '');
      lines.push(
        `- [${test.name}](${testFileName}.md#${test.id.replace(/\//g, '-').toLowerCase()})`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate JSON documentation
 */
async function generateJsonDocumentation(
  projectDocs: ProjectDocumentation,
  options: DocumentationOptions,
  outputPaths: string[]
): Promise<void> {
  const { outputDir } = options;

  await mkdir(outputDir, { recursive: true });

  // Main documentation file
  const mainPath = join(outputDir, 'test-documentation.json');
  await writeFile(mainPath, JSON.stringify(projectDocs, null, 2), 'utf-8');
  outputPaths.push(mainPath);
}

/**
 * Generate HTML documentation
 */
async function generateHtmlDocumentation(
  projectDocs: ProjectDocumentation,
  options: DocumentationOptions,
  outputPaths: string[]
): Promise<void> {
  const { outputDir } = options;

  await mkdir(outputDir, { recursive: true });

  // Generate a simple HTML file
  const htmlPath = join(outputDir, 'index.html');
  const html = generateHtmlContent(projectDocs);
  await writeFile(htmlPath, html, 'utf-8');
  outputPaths.push(htmlPath);
}

/**
 * Generate HTML content
 */
function generateHtmlContent(projectDocs: ProjectDocumentation): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Documentation - ${projectDocs.projectName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .metric { background: #f5f5f5; padding: 15px; border-radius: 8px; }
    .metric-value { font-size: 2em; font-weight: bold; color: #0066cc; }
    .metric-label { color: #666; }
    .test-file { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; }
    .test-file h3 { margin-top: 0; }
    .tag { background: #e1f5fe; color: #0277bd; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .coverage { background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .test-case { border-left: 3px solid #0066cc; padding-left: 10px; margin: 10px 0; }
    .status-active { color: #2e7d32; }
    .status-skip { color: #f57c00; }
    .status-only { color: #c62828; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>🧪 Test Documentation</h1>
  <p><em>Generated on ${projectDocs.generatedAt.toISOString()}</em></p>

  <div class="summary">
    <div class="metric">
      <div class="metric-value">${projectDocs.summary.totalFiles}</div>
      <div class="metric-label">Test Files</div>
    </div>
    <div class="metric">
      <div class="metric-value">${projectDocs.summary.totalTests}</div>
      <div class="metric-label">Test Cases</div>
    </div>
  </div>

  <h2>Tests by Type</h2>
  <table>
    <tr><th>Type</th><th>Count</th></tr>
    ${Object.entries(projectDocs.summary.testsByType)
      .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
      .join('')}
  </table>

  <h2>Tests by Status</h2>
  <table>
    <tr><th>Status</th><th>Count</th></tr>
    ${Object.entries(projectDocs.summary.testsByStatus)
      .map(([status, count]) => `<tr><td><span class="status-${status}">${status}</span></td><td>${count}</td></tr>`)
      .join('')}
  </table>

  <h2>Test Files</h2>
  ${projectDocs.files
    .map(
      (file) => `
  <div class="test-file">
    <h3>${file.fileName}</h3>
    <p><strong>Type:</strong> ${file.testType} | <strong>Tests:</strong> ${file.testCount}</p>
    ${file.tags.size > 0 ? `<p>Tags: ${Array.from(file.tags).map((t) => `<span class="tag">${t}</span>`).join(' ')}</p>` : ''}
    ${file.coverage.size > 0 ? `<p>Coverage: ${Array.from(file.coverage).map((c) => `<span class="coverage">${c}</span>`).join(' ')}</p>` : ''}
  </div>`
    )
    .join('')}

</body>
</html>`;
}

/**
 * Get emoji for test type
 */
function getTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    unit: '🔬',
    integration: '🔗',
    e2e: '🎯',
    api: '🌐',
    visual: '👁️',
    accessibility: '♿',
    artifact: '📦',
  };
  return emojis[type] || '📝';
}

/**
 * Get emoji for test status
 */
function getStatusEmoji(status?: string): string {
  const emojis: Record<string, string> = {
    active: '✅',
    skip: '⏭️',
    only: '🔴',
    todo: '📋',
  };
  return status ? emojis[status] || '📝' : '✅';
}
