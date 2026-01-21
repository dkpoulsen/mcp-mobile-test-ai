/**
 * Coverage Mapper
 * Maps test files to source files they cover based on imports and patterns
 */

import { createModuleLogger } from '../../utils/logger.js';
import { getPrismaClient } from '../../database/client.js';
import type {
  TestToSourceMapping,
  DependencyNode,
  TestFailureHistory,
} from './types.js';

const logger = createModuleLogger('coverage-mapper');

/**
 * Coverage Mapper class
 * Maps tests to source files for intelligent test selection
 */
export class CoverageMapper {
  private mappingsCache: Map<string, TestToSourceMapping> = new Map();
  private failureHistoryCache: Map<string, TestFailureHistory> = new Map();

  constructor(private projectRoot: string = process.cwd()) {}

  /**
   * Build test-to-source mappings for all test files
   */
  async buildMappings(
    dependencyGraph: Map<string, DependencyNode>
  ): Promise<Map<string, TestToSourceMapping>> {
    logger.info('Building test-to-source coverage mappings');

    const testNodes = Array.from(dependencyGraph.values()).filter(
      (node) => node.isTestFile
    );

    for (const testNode of testNodes) {
      const mapping = await this.createMappingForTest(testNode, dependencyGraph);
      if (mapping) {
        this.mappingsCache.set(mapping.testPath, mapping);
      }
    }

    // Load historical failure data
    await this.loadFailureHistory();

    logger.info(
      { mappingsCount: this.mappingsCache.size },
      'Built test-to-source mappings'
    );

    return this.mappingsCache;
  }

  /**
   * Create mapping for a single test file
   */
  private async createMappingForTest(
    testNode: DependencyNode,
    dependencyGraph: Map<string, DependencyNode>
  ): Promise<TestToSourceMapping | null> {
    // Extract source files from test's imports
    const sourceFiles = this.extractSourceFiles(testNode, dependencyGraph);

    // Determine tags from test path
    const tags = this.extractTestTags(testNode.path);

    // Get test statistics from database
    const stats = await this.getTestStatistics(testNode.path);

    return {
      testPath: testNode.path,
      sourceFiles,
      coverageConfidence: this.calculateConfidence(testNode, sourceFiles),
      tags,
      lastRun: stats?.lastRun,
      avgDuration: stats?.avgDuration,
      isFlaky: stats?.isFlaky || false,
    };
  }

  /**
   * Extract source files covered by a test
   */
  private extractSourceFiles(
    testNode: DependencyNode,
    dependencyGraph: Map<string, DependencyNode>
  ): string[] {
    const sourceFiles: string[] = [];

    // Direct imports
    for (const importPath of testNode.imports) {
      const node = dependencyGraph.get(importPath);
      if (node && !node.isTestFile) {
        sourceFiles.push(importPath);
      }
    }

    // Infer additional source files based on test path patterns
    const inferredSources = this.inferSourcesFromTestPath(testNode.path);
    for (const source of inferredSources) {
      if (!sourceFiles.includes(source)) {
        sourceFiles.push(source);
      }
    }

    return sourceFiles;
  }

  /**
   * Infer source files from test file path
   */
  private inferSourcesFromTestPath(testPath: string): string[] {
    const sources: string[] = [];

    // Convert test path to source path
    // tests/unit/notification-service.test.ts -> src/services/notification/service.ts
    // tests/api/health.spec.ts -> src/server/routes/health.ts

    let sourcePath = testPath
      .replace(/^tests\//, 'src/')
      .replace(/\/(unit|api|integration|e2e)\//, '/')
      .replace(/\.test\.(ts|js)$/, '.$1')
      .replace(/\.spec\.(ts|js)$/, '.$1');

    // Adjust for common patterns
    if (sourcePath.includes('/api/')) {
      sourcePath = sourcePath.replace('/src/api/', '/src/server/routes/');
    }

    // Check if inferred source exists
    const { existsSync } = require('fs');
    if (existsSync(`${this.projectRoot}/${sourcePath}`)) {
      sources.push(sourcePath);
    }

    // Also try service path variations
    const serviceMatch = testPath.match(/(\w+)(?:-service)?\.test\.(ts|js)$/);
    if (serviceMatch) {
      const serviceName = serviceMatch[1];
      const possiblePaths = [
        `src/services/${serviceName}/index.ts`,
        `src/services/${serviceName}.ts`,
        `src/${serviceName}.ts`,
      ];
      for (const path of possiblePaths) {
        if (existsSync(`${this.projectRoot}/${path}`)) {
          sources.push(path);
        }
      }
    }

    return sources;
  }

  /**
   * Extract test tags from path
   */
  private extractTestTags(testPath: string): string[] {
    const tags: string[] = [];

    if (testPath.includes('/unit/')) tags.push('unit');
    if (testPath.includes('/api/')) tags.push('api');
    if (testPath.includes('/integration/')) tags.push('integration');
    if (testPath.includes('/e2e/')) tags.push('e2e');
    if (testPath.includes('/android/')) tags.push('android');
    if (testPath.includes('/ios/')) tags.push('ios');

    return tags;
  }

  /**
   * Calculate confidence in coverage mapping
   */
  private calculateConfidence(
    testNode: DependencyNode,
    sourceFiles: string[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence if test has imports
    if (testNode.imports.size > 0) {
      confidence += 0.2;
    }

    // Higher confidence if we found source files
    if (sourceFiles.length > 0) {
      confidence += 0.2;
    }

    // Higher confidence for explicitly named tests
    if (testNode.path.match(/[\w-]+\.test\.(ts|js)$/)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get test statistics from database
   */
  private async getTestStatistics(testPath: string): Promise<{
    lastRun?: Date;
    avgDuration?: number;
    isFlaky?: boolean;
  } | null> {
    try {
      const prisma = getPrismaClient();

      // Try to find test case by name (extract from path)
      const testName = testPath.split('/').pop()?.replace(/\.(test|spec)\.(ts|js)$/, '');

      if (!testName) {
        return null;
      }

      const testCase = await prisma.testCase.findFirst({
        where: {
          name: { contains: testName, mode: 'insensitive' },
        },
        include: {
          testResults: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          flakyTest: true,
        },
      });

      if (!testCase) {
        return null;
      }

      const durations = testCase.testResults.map((r) => r.duration);
      const avgDuration =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : undefined;

      const lastRun =
        testCase.testResults.length > 0
          ? testCase.testResults[0]?.createdAt
          : undefined;

      return {
        lastRun,
        avgDuration,
        isFlaky: !!testCase.flakyTest,
      };
    } catch (error) {
      logger.debug({ testPath, error }, 'Failed to get test statistics');
      return null;
    }
  }

  /**
   * Load historical failure data for all tests
   */
  private async loadFailureHistory(): Promise<void> {
    try {
      const prisma = getPrismaClient();

      // Get recent test failures
      const failedResults = await prisma.testResult.findMany({
        where: {
          status: 'FAILED',
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // Last 90 days
        },
        include: {
          testCase: {
            include: {
              testSuite: true,
            },
          },
          failureAnalysis: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Group by test case
      const byTestCase = new Map<string, typeof failedResults>();
      for (const result of failedResults) {
        const key = `${result.testCase.testSuiteId}/${result.testCase.id}`;
        if (!byTestCase.has(key)) {
          byTestCase.set(key, []);
        }
        byTestCase.get(key)!.push(result);
      }

      // Create failure history entries
      for (const [key, results] of byTestCase) {
        const firstResult = results[0];
        if (!firstResult) continue;

        const totalRuns = await prisma.testResult.count({
          where: {
            testCaseId: firstResult.testCaseId,
            createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
        });

        const failureCategories = new Set<string>();
        const relatedFiles = new Set<string>();

        for (const result of results) {
          if (result.failureAnalysis) {
            failureCategories.add(result.failureAnalysis.category);
          }
        }

        this.failureHistoryCache.set(key, {
          testPath: firstResult.testCase.name,
          totalRuns,
          failureCount: results.length,
          failureRate: results.length / totalRuns,
          recentFailures: results.filter(
            (r) => r.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          ).length,
          failureCategories: Array.from(failureCategories),
          relatedFiles: Array.from(relatedFiles),
        });
      }

      logger.info(
        { historyCount: this.failureHistoryCache.size },
        'Loaded test failure history'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to load failure history');
    }
  }

  /**
   * Get mappings for source files
   */
  getTestsForSource(sourcePath: string): TestToSourceMapping[] {
    const tests: TestToSourceMapping[] = [];

    for (const mapping of this.mappingsCache.values()) {
      if (mapping.sourceFiles.includes(sourcePath)) {
        tests.push(mapping);
      }

      // Check partial path matches
      for (const sourceFile of mapping.sourceFiles) {
        if (
          sourceFile.includes(sourcePath) ||
          sourcePath.includes(sourceFile)
        ) {
          if (!tests.includes(mapping)) {
            tests.push(mapping);
          }
        }
      }
    }

    return tests;
  }

  /**
   * Get mapping for a specific test
   */
  getMapping(testPath: string): TestToSourceMapping | undefined {
    return this.mappingsCache.get(testPath);
  }

  /**
   * Get failure history for a test
   */
  getFailureHistory(testPath: string): TestFailureHistory | undefined {
    return this.failureHistoryCache.get(testPath);
  }

  /**
   * Get all mappings
   */
  getAllMappings(): Map<string, TestToSourceMapping> {
    return this.mappingsCache;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.mappingsCache.clear();
    this.failureHistoryCache.clear();
  }
}

/**
 * Global coverage mapper instance
 */
let globalMapper: CoverageMapper | null = null;

/**
 * Get the global coverage mapper instance
 */
export function getGlobalCoverageMapper(projectRoot?: string): CoverageMapper {
  if (!globalMapper) {
    globalMapper = new CoverageMapper(projectRoot);
  }
  return globalMapper;
}

/**
 * Reset the global mapper
 */
export function resetGlobalCoverageMapper(): void {
  globalMapper = null;
}
