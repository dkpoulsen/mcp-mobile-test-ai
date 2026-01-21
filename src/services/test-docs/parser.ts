/**
 * Test Documentation Parser
 * Parses test files to extract test metadata and documentation
 */

import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  ParsedComment,
  TestCaseMetadata,
  TestSuiteMetadata,
  TestFileDocumentation,
} from './types.js';

/**
 * Parse JSDoc-style comments to extract metadata
 */
function parseComment(comment: string): ParsedComment {
  const parsed: ParsedComment = {
    description: '',
    tags: {},
  };

  // Remove JSDoc markers and split into lines
  const lines = comment
    .replace(/\/\*\*|\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0);

  let currentTag = '';
  let currentDescription = '';

  for (const line of lines) {
    // Check for @tags
    const tagMatch = line.match(/^@(\w+)(?:\s+(.+))?$/);
    if (tagMatch) {
      // Save previous tag's description
      if (currentTag) {
        parsed.tags[currentTag] = currentDescription.trim();
      }
      currentTag = tagMatch[1];
      currentDescription = tagMatch[2] || '';
    } else if (currentTag) {
      // Continue building current tag value
      currentDescription += ' ' + line;
    } else {
      // Main description (before any tags)
      parsed.description += (parsed.description ? ' ' : '') + line;
    }
  }

  // Save last tag
  if (currentTag) {
    parsed.tags[currentTag] = currentDescription.trim();
  }

  // Parse special tags
  if (parsed.tags.coverage) {
    parsed.coverage = parsed.tags.coverage
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
  if (parsed.tags.frequency) {
    parsed.frequency = parsed.tags.frequency.trim() as ParsedComment['frequency'];
  }
  if (parsed.tags.type) {
    parsed.type = parsed.tags.type.trim() as ParsedComment['type'];
  }

  return parsed;
}

/**
 * Extract the comment block before a position in source code
 */
function extractPrecedingComment(
  source: string,
  position: number
): string | null {
  // Look backwards from position for a comment block
  let i = position - 1;
  let commentStart = -1;
  let commentEnd = -1;

  // Skip whitespace
  while (i >= 0 && /\s/.test(source[i])) {
    i--;
  }

  // Check if we're at the end of a block comment
  if (i >= 1 && source[i - 1] === '*' && source[i] === '/') {
    commentEnd = i + 1;
    i -= 2;

    // Find the start of the comment
    while (i >= 0) {
      if (i >= 2 && source[i - 2] === '/' && source[i - 1] === '*') {
        commentStart = i - 2;
        break;
      }
      if (source[i] === '\n') {
        // Stop at newline if no comment start found
        break;
      }
      i--;
    }
  }

  if (commentStart >= 0 && commentEnd > commentStart) {
    return source.slice(commentStart, commentEnd);
  }

  return null;
}

/**
 * Determine test type from file path
 */
function getTestTypeFromPath(filePath: string, projectRoot: string): TestFileDocumentation['testType'] {
  const relativePath = relative(projectRoot, filePath).toLowerCase();

  if (relativePath.includes('/api/') || relativePath.includes('\\api\\')) {
    return 'api';
  }
  if (relativePath.includes('/unit/') || relativePath.includes('\\unit\\')) {
    return 'unit';
  }
  if (relativePath.includes('/visual-') || relativePath.includes('\\visual-')) {
    return 'visual';
  }
  if (relativePath.includes('/artifact-') || relativePath.includes('\\artifact-')) {
    return 'artifact';
  }
  return 'integration';
}

/**
 * Simple regex-based test extractor for TypeScript test files
 * This is a lightweight alternative to full AST parsing
 */
export async function parseTestFile(
  filePath: string,
  projectRoot: string
): Promise<TestFileDocumentation | null> {
  try {
    const source = await readFile(filePath, 'utf-8');

    const tests: TestCaseMetadata[] = [];
    const suites: TestSuiteMetadata[] = [];
    const tags = new Set<string>();
    const coverage = new Set<string>();

    // Track the current suite path
    const suitePath: string[] = [];
    const suiteStack: Array<{ name: string; line: number; path: string[] }> = [];

    // Regex patterns for finding test definitions and describe blocks
    const patterns = {
      // Match describe() blocks with optional .skip, .only, .todo
      describe:
        /(?:^|\n)\s*(?:describe|describe\.skip|describe\.only|describe\.todo)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:\([^)]*\)\s*=>?\s*)?{/gm,
      // Match it() test cases with optional modifiers
      it: /(?:^|\n)\s*(?:it|it\.skip|it\.only|it\.todo|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,/gm,
    };

    // Find all describe and test positions with line numbers
    const lines = source.split('\n');

    // First pass: find all describe blocks to build suite hierarchy
    let describeMatch;
    const describeRegex = /(?:^|\n)\s*(?:describe|describe\.(skip|only|todo))\s*\(\s*['"`]([^'"`]+)['"`]/g;

    while ((describeMatch = describeRegex.exec(source)) !== null) {
      const fullMatch = describeMatch[0];
      const modifier = describeMatch[1];
      const suiteName = describeMatch[2];

      // Calculate line number
      const beforeMatch = source.slice(0, describeMatch.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Extract preceding comment
      const comment = extractPrecedingComment(source, describeMatch.index);
      const parsedComment = comment ? parseComment(comment) : { description: '', tags: {} };

      // Add tags from comment
      if (parsedComment.tags.tag) {
        parsedComment.tags.tag.split(',').forEach((t) => tags.add(t.trim()));
      }
      if (parsedComment.coverage) {
        parsedComment.coverage.forEach((c) => coverage.add(c));
      }
    }

    // Second pass: process structure and find tests
    let currentLine = 0;
    let inDescribeBlock = false;
    let currentSuite: TestSuiteMetadata | null = null;
    let braceDepth = 0;
    let suiteBraceStart = 0;

    for (currentLine = 0; currentLine < lines.length; currentLine++) {
      const line = lines[currentLine];

      // Check for describe block
      const describeMatch = line.match(
        /^(.*?)\b(describe|(?:describe)\.(skip|only|todo))\s*\(\s*['"`]([^'"`]+)['"`]/
      );

      if (describeMatch) {
        inDescribeBlock = true;
        const suiteName = describeMatch[4];
        const modifier = describeMatch[3];

        // Find opening brace
        const restOfSource = lines.slice(currentLine).join('\n');
        const braceMatch = restOfSource.match(/\{/);
        if (braceMatch) {
          suiteBraceStart = braceDepth;
        }

        // Extract preceding comment
        const lineStartPos = lines.slice(0, currentLine).join('\n').length + line.length;
        const comment = extractPrecedingComment(source, lineStartPos);
        const parsedComment = comment ? parseComment(comment) : { description: '', tags: {} };

        // Create suite metadata
        const newSuite: TestSuiteMetadata = {
          name: suiteName,
          description: parsedComment.description || undefined,
          path: [...suitePath, suiteName],
          suites: [],
          tests: [],
          filePath,
          line: currentLine + 1,
        };

        suitePath.push(suiteName);
        suiteStack.push({ name: suiteName, line: currentLine + 1, path: [...suitePath] });

        if (currentSuite) {
          currentSuite.suites.push(newSuite);
        } else {
          suites.push(newSuite);
        }
        currentSuite = newSuite;
        continue;
      }

      // Track braces for describe block scope
      if (inDescribeBlock) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;

        // Check if we've exited the describe block
        if (braceDepth <= suiteBraceStart && suiteStack.length > 0) {
          suitePath.pop();
          suiteStack.pop();

          // Update current suite to parent
          if (suiteStack.length > 0) {
            const parentSuite = findSuiteByPath(suites, suiteStack[suiteStack.length - 1].path);
            currentSuite = parentSuite || null;
          } else {
            currentSuite = null;
          }
          inDescribeBlock = false;
        }
      }

      // Check for test/it
      const itMatch = line.match(
        /^(.*?)\b(it|test|(?:it)\.(skip|only|todo))\s*\(\s*['"`]([^'"`]+)['"`]/
      );

      if (itMatch) {
        const testFn = itMatch[2];
        const modifier = itMatch[3];
        const testName = itMatch[4];

        // Determine test status
        let status: TestCaseMetadata['status'] = 'active';
        if (modifier === 'skip' || testFn === 'skip') {
          status = 'skip';
        } else if (modifier === 'only' || testFn === 'only') {
          status = 'only';
        } else if (modifier === 'todo' || testFn === 'todo') {
          status = 'todo';
        }

        // Extract preceding comment
        const lineStartPos = lines.slice(0, currentLine).join('\n').length + line.length;
        const comment = extractPrecedingComment(source, lineStartPos);
        const parsedComment = comment ? parseComment(comment) : { description: '', tags: {} };

        // Extract test steps from the test function body
        const steps = extractTestSteps(source, currentLine, lines);

        // Extract tags from comment
        const testTags: string[] = [];
        if (parsedComment.tags.tag) {
          parsedComment.tags.tag.split(',').forEach((t: string) => {
            const trimmed = t.trim();
            testTags.push(trimmed);
            tags.add(trimmed);
          });
        }

        // Extract coverage
        const testCoverage: string[] = [];
        if (parsedComment.coverage) {
          parsedComment.coverage.forEach((c) => {
            testCoverage.push(c);
            coverage.add(c);
          });
        }

        // Extract dependencies
        let dependencies: string[] | undefined;
        if (parsedComment.tags.dependency) {
          dependencies = parsedComment.tags.dependency
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);
        }

        const testId = `${relative(projectRoot, filePath)
          .replace(/\.ts$/, '')
          .replace(/\\/g, '/')}-${testName.toLowerCase().replace(/\s+/g, '-')}`;

        const testMetadata: TestCaseMetadata = {
          id: testId,
          name: testName,
          description: parsedComment.description || undefined,
          filePath,
          line: currentLine + 1,
          suite: suitePath.length > 0 ? suitePath[suitePath.length - 1] : undefined,
          suitePath: [...suitePath],
          tags: testTags,
          frequency: parsedComment.frequency,
          coverage: testCoverage,
          steps,
          dependencies,
          type: parsedComment.type || getTestTypeFromPath(filePath, projectRoot),
          status,
        };

        tests.push(testMetadata);

        if (currentSuite) {
          currentSuite.tests.push(testMetadata);
        }
      }
    }

    const testType = getTestTypeFromPath(filePath, projectRoot);

    return {
      filePath,
      fileName: filePath.split(sep).pop() || '',
      relativePath: relative(projectRoot, filePath),
      testType,
      suites,
      tests,
      testCount: tests.length,
      tags,
      coverage,
      generatedAt: new Date(),
    };
  } catch (error) {
    // Return null for files that can't be parsed
    return null;
  }
}

/**
 * Extract test steps from a test function body
 */
function extractTestSteps(
  source: string,
  testLine: number,
  lines: string[]
): Array<{ description: string; type?: string; expected?: string }> {
  const steps: Array<{ description: string; type?: string; expected?: string }> = [];

  // Look at the next few lines after the test declaration
  for (let i = testLine + 1; i < Math.min(testLine + 50, lines.length); i++) {
    const line = lines[i].trim();

    // Stop at end of function
    if (line.startsWith('});') || line.startsWith('})') || line === ');') {
      break;
    }

    // Look for assertion patterns and describe them as steps
    if (line.startsWith('assert.') || line.startsWith('expect(')) {
      const step = describeAssertion(line);
      if (step) {
        steps.push(step);
      }
    }

    // Look for API calls
    if (line.includes('await ') && (line.includes('.get(') || line.includes('.post('))) {
      const methodMatch = line.match(/\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (methodMatch) {
        steps.push({
          description: `Make ${methodMatch[1].toUpperCase()} request to ${methodMatch[2]}`,
          type: 'api',
        });
      }
    }

    // Look for click/interaction patterns
    if (line.includes('.click(') || line.includes('.fill(') || line.includes('.type(')) {
      const actionMatch = line.match(/\.(click|fill|type)\s*\(\s*[^)]*\)/);
      if (actionMatch) {
        steps.push({
          description: `User interaction: ${actionMatch[1]}`,
          type: 'interaction',
        });
      }
    }
  }

  return steps;
}

/**
 * Describe an assertion as a test step
 */
function describeAssertion(line: string): { description: string; type?: string } | null {
  if (!line) return null;

  if (line.startsWith('assert.strictEqual')) {
    const match = line.match(/assert\.strictEqual\s*\(\s*([^,]+),\s*([^)]+)\)/);
    if (match) {
      return {
        description: `Assert ${match[1].trim()} equals ${match[2].trim()}`,
        type: 'assertion',
      };
    }
  }

  if (line.startsWith('assert.ok')) {
    const match = line.match(/assert\.ok\s*\(\s*([^)]+)\)/);
    if (match) {
      return {
        description: `Assert ${match[1].trim()} is truthy`,
        type: 'assertion',
      };
    }
  }

  if (line.includes('expect(')) {
    const match = line.match(/expect\s*\(\s*([^)]+)\)\.\s*(\w+)/);
    if (match) {
      return {
        description: `Expect ${match[1].trim()} to ${match[2]}`,
        type: 'assertion',
      };
    }
  }

  return {
    description: line.slice(0, 100),
    type: 'action',
  };
}

/**
 * Find a suite by its path in the suite tree
 */
function findSuiteByPath(
  suites: TestSuiteMetadata[],
  path: string[]
): TestSuiteMetadata | null {
  for (const suite of suites) {
    if (suite.path.join('/') === path.join('/')) {
      return suite;
    }
    const found = findSuiteByPath(suite.suites, path);
    if (found) return found;
  }
  return null;
}

/**
 * Parse all test files in a directory
 */
export async function parseTestFiles(
  testDir: string,
  projectRoot: string,
  patterns: string[] = ['**/*.test.ts', '**/*.spec.ts']
): Promise<TestFileDocumentation[]> {
  const results: TestFileDocumentation[] = [];

  // Use Node.js built-in glob functionality (available in Node 20+)
  const glob = await import('node:fs/promises');

  // Convert patterns to file paths and filter
  const testDirAbsolute = join(projectRoot, testDir);

  // Recursively walk the directory
  async function walkDirectory(dir: string): Promise<string[]> {
    const entries = await glob.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await walkDirectory(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  const allFiles = await walkDirectory(testDirAbsolute);

  // Filter files by patterns
  for (const file of allFiles) {
    const relativePath = relative(projectRoot, file).replace(/\\/g, '/');
    const matchesPattern = patterns.some((pattern) => {
      // Convert glob pattern to regex
      let regexPattern = pattern;

      // Escape special regex characters (except * and ?)
      regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

      // Handle ** (matches any number of directories including none)
      regexPattern = regexPattern.replace(/\*\*/g, '.*');

      // Handle * (matches any characters except /)
      regexPattern = regexPattern.replace(/(?<!\.)\*(?!\*)/g, '[^/]*');

      // Handle ? (matches exactly one character except /)
      regexPattern = regexPattern.replace(/\?/g, '[^/]');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(relativePath);
    });

    if (matchesPattern) {
      const doc = await parseTestFile(file, projectRoot);
      if (doc && doc.testCount > 0) {
        results.push(doc);
      }
    }
  }

  return results;
}
