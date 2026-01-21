/**
 * Test Documentation Service Types
 * Types for test documentation generation and metadata extraction
 */

/**
 * Represents a single test case with its metadata
 */
export interface TestCaseMetadata {
  /** Unique identifier for the test */
  id: string;
  /** Test name/title */
  name: string;
  /** Full test description */
  description?: string;
  /** Source file path */
  filePath: string;
  /** Line number in source file */
  line: number;
  /** Parent suite/describe block */
  suite?: string;
  /** Full suite path (e.g., "API > Health > GET /health") */
  suitePath: string[];
  /** Test tags/categories */
  tags: string[];
  /** Estimated execution frequency */
  frequency?: 'always' | 'often' | 'sometimes' | 'rarely';
  /** Coverage areas this test addresses */
  coverage: string[];
  /** Test steps extracted from test body */
  steps: TestStep[];
  /** Related files/components */
  dependencies?: string[];
  /** Test type */
  type: 'unit' | 'integration' | 'e2e' | 'api' | 'visual' | 'accessibility' | 'artifact';
  /** Timeout configuration */
  timeout?: number;
  /** Whether test is skipped or only */
  status?: 'active' | 'skip' | 'only' | 'todo';
}

/**
 * Represents a single step within a test
 */
export interface TestStep {
  /** Step description */
  description: string;
  /** Step type/category */
  type?: string;
  /** Expected outcome */
  expected?: string;
}

/**
 * Represents a test suite/describe block
 */
export interface TestSuiteMetadata {
  /** Suite name */
  name: string;
  /** Suite description from JSDoc */
  description?: string;
  /** Full suite path */
  path: string[];
  /** Nested test suites */
  suites: TestSuiteMetadata[];
  /** Test cases in this suite */
  tests: TestCaseMetadata[];
  /** Source file path */
  filePath: string;
  /** Line number */
  line: number;
}

/**
 * Complete test file documentation
 */
export interface TestFileDocumentation {
  /** Source file path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Relative path from project root */
  relativePath: string;
  /** Test type based on location */
  testType: 'unit' | 'api' | 'visual' | 'artifact' | 'integration';
  /** All test suites in file */
  suites: TestSuiteMetadata[];
  /** All test cases in file */
  tests: TestCaseMetadata[];
  /** Total test count */
  testCount: number;
  /** Tags found in file */
  tags: Set<string>;
  /** Coverage areas found in file */
  coverage: Set<string>;
  /** Documentation generated at */
  generatedAt: Date;
}

/**
 * Documentation generation options
 */
export interface DocumentationOptions {
  /** Output directory for documentation */
  outputDir: string;
  /** Output format */
  format: 'markdown' | 'json' | 'html';
  /** Whether to include test steps */
  includeSteps: boolean;
  /** Whether to include coverage analysis */
  includeCoverage: boolean;
  /** Whether to group by tags */
  groupByTags: boolean;
  /** Custom header content */
  header?: string;
  /** Custom footer content */
  footer?: string;
  /** Test directory to scan */
  testDir: string;
  /** File patterns to include */
  patterns: string[];
  /** File patterns to exclude */
  excludePatterns: string[];
}

/**
 * Complete project documentation
 */
export interface ProjectDocumentation {
  /** Project name from package.json */
  projectName: string;
  /** Project version */
  projectVersion: string;
  /** Documentation generation timestamp */
  generatedAt: Date;
  /** All test files documented */
  files: TestFileDocumentation[];
  /** Summary statistics */
  summary: DocumentationSummary;
  /** Index by tags */
  tagIndex: Map<string, TestCaseMetadata[]>;
  /** Index by coverage area */
  coverageIndex: Map<string, TestCaseMetadata[]>;
}

/**
 * Documentation summary statistics
 */
export interface DocumentationSummary {
  /** Total number of test files */
  totalFiles: number;
  /** Total number of test cases */
  totalTests: number;
  /** Tests by type */
  testsByType: Record<string, number>;
  /** Tests by status */
  testsByStatus: Record<string, number>;
  /** All unique tags */
  allTags: string[];
  /** All unique coverage areas */
  allCoverage: string[];
  /** Test files by directory */
  filesByDirectory: Record<string, number>;
}

/**
 * Parsed comment with metadata
 */
export interface ParsedComment {
  /** Main description text */
  description: string;
  /** Extracted tags */
  tags: Record<string, string>;
  /** @coverage tag values */
  coverage?: string[];
  /** @frequency tag value */
  frequency?: TestCaseMetadata['frequency'];
  /** @type tag value */
  type?: TestCaseMetadata['type'];
}

/**
 * Documentation generation result
 */
export interface DocumentationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Number of files processed */
  filesProcessed: number;
  /** Number of documentation files created */
  docsCreated: number;
  /** Output paths */
  outputPaths: string[];
  /** Error message if failed */
  error?: string;
  /** Warnings during generation */
  warnings: string[];
}
