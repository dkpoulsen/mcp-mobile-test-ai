/**
 * Change Analyzer
 * Analyzes code changes to determine impact and affected tests
 */

import { createModuleLogger } from '../../utils/logger.js';
import type {
  ChangedFile,
  ChangeImpact,
  DependencyNode,
} from './types.js';

const logger = createModuleLogger('change-analyzer');

/**
 * Change Analyzer class
 * Analyzes code changes and determines their impact
 */
export class ChangeAnalyzer {
  private dependencyCache: Map<string, DependencyNode> = new Map();
  private fileContentCache: Map<string, string> = new Map();

  constructor(
    private projectRoot: string = process.cwd(),
    private excludePatterns: string[] = []
  ) {}

  /**
   * Analyze a list of changed files
   */
  async analyzeChanges(changedFiles: ChangedFile[]): Promise<ChangeImpact[]> {
    const impacts: ChangeImpact[] = [];

    logger.debug(
      { fileCount: changedFiles.length },
      'Analyzing code changes'
    );

    // Build dependency graph for relevant files
    await this.buildDependencyGraph(
      changedFiles.map((f) => f.path)
    );

    for (const file of changedFiles) {
      if (this.shouldExclude(file.path)) {
        logger.debug({ path: file.path }, 'Skipping excluded file');
        continue;
      }

      const impact = await this.analyzeFileChange(file);
      impacts.push(impact);
    }

    logger.info(
      { analyzedCount: impacts.length, totalFiles: changedFiles.length },
      'Change analysis complete'
    );

    return impacts;
  }

  /**
   * Analyze a single file change
   */
  async analyzeFileChange(file: ChangedFile): Promise<ChangeImpact> {
    const node = this.dependencyCache.get(file.path);
    const importedBy = node?.importedBy || new Set<string>();
    const imports = node?.imports || new Set<string>();

    // Determine impact level based on change type and extent
    const impactLevel = this.determineImpactLevel(file, importedBy);

    // Determine affected modules
    const affectedModules = this.extractAffectedModules(file);

    // Generate reason for impact
    const reason = this.generateImpactReason(file, impactLevel, importedBy);

    return {
      file,
      impactLevel,
      affectedModules,
      reason,
      importedBy: Array.from(importedBy),
      imports: Array.from(imports),
    };
  }

  /**
   * Determine the impact level of a change
   */
  private determineImpactLevel(
    file: ChangedFile,
    importedBy: Set<string>
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: Core framework files, types, config
    if (
      file.path.includes('/core/') ||
      file.path.includes('/types/') ||
      file.path.endsWith('tsconfig.json') ||
      file.path.endsWith('package.json')
    ) {
      return 'critical';
    }

    // High: Files imported by many other files, or significant changes
    if (importedBy.size >= 5) {
      return 'high';
    }

    // High: Large changes (many additions/deletions)
    if (file.additions + file.deletions > 200) {
      return 'high';
    }

    // Medium: Moderate changes or files with some importers
    if (importedBy.size >= 2 || file.additions + file.deletions > 50) {
      return 'medium';
    }

    // Low: Small changes with minimal impact
    return 'low';
  }

  /**
   * Extract affected module names from file path
   */
  private extractAffectedModules(file: ChangedFile): string[] {
    const modules: string[] = [];
    const parts = file.path.split('/');

    // Extract service/module name
    if (parts.includes('src')) {
      const srcIndex = parts.indexOf('src');
      if (srcIndex >= 0 && srcIndex + 1 < parts.length) {
        modules.push(parts[srcIndex + 1]!);
      }
    }

    if (parts.includes('services')) {
      const serviceIndex = parts.indexOf('services');
      if (serviceIndex >= 0 && serviceIndex + 1 < parts.length) {
        modules.push(`services/${parts[serviceIndex + 1]!}`);
      }
    }

    return modules;
  }

  /**
   * Generate a human-readable reason for the impact
   */
  private generateImpactReason(
    file: ChangedFile,
    _impactLevel: string,
    importedBy: Set<string>
  ): string {
    const reasons: string[] = [];

    switch (file.changeType) {
      case 'added':
        reasons.push('New file added');
        break;
      case 'deleted':
        reasons.push('File deleted');
        break;
      case 'renamed':
        reasons.push('File renamed');
        break;
      case 'modified':
        reasons.push('File modified');
        break;
    }

    if (file.additions + file.deletions > 100) {
      reasons.push('significant changes');
    } else if (file.additions + file.deletions > 20) {
      reasons.push('moderate changes');
    } else {
      reasons.push('minor changes');
    }

    if (importedBy.size > 0) {
      reasons.push(`imported by ${importedBy.size} file(s)`);
    }

    return reasons.join(', ');
  }

  /**
   * Build dependency graph for specified files
   */
  private async buildDependencyGraph(filePaths: string[]): Promise<void> {
    const { readFile } = await import('fs/promises');
    const { existsSync } = await import('fs');

    for (const filePath of filePaths) {
      const fullPath = this.resolvePath(filePath);

      if (!existsSync(fullPath)) {
        continue;
      }

      // Skip non-TypeScript/JavaScript files
      if (!this.isSourceFile(filePath)) {
        continue;
      }

      try {
        const content = await readFile(fullPath, 'utf-8');
        this.fileContentCache.set(filePath, content);

        const imports = this.extractImports(content, filePath);
        const isTestFile = this.isTestFile(filePath);

        this.dependencyCache.set(filePath, {
          path: filePath,
          importedBy: new Set(),
          imports: new Set(imports),
          isTestFile,
        });

        logger.debug(
          { path: filePath, importsCount: imports.length, isTestFile },
          'Analyzed file dependencies'
        );
      } catch (error) {
        logger.warn({ path: filePath, error }, 'Failed to read file');
      }
    }

    // Build reverse dependencies (importedBy)
    for (const [path, node] of this.dependencyCache) {
      for (const importPath of node.imports) {
        const importedNode = this.dependencyCache.get(importPath);
        if (importedNode) {
          importedNode.importedBy.add(path);
        }
      }
    }

    logger.debug(
      { graphSize: this.dependencyCache.size },
      'Built dependency graph'
    );
  }

  /**
   * Extract import statements from source code
   */
  private extractImports(content: string, filePath: string): string[] {
    const imports: string[] = [];

    // Match ES6 imports
    const es6ImportRegex =
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = es6ImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath && !this.isExternalModule(importPath)) {
        imports.push(this.resolveImportPath(importPath, filePath));
      }
    }

    // Match CommonJS require
    const requireRegex = /require\(['"`]([^'"`]+)['"`]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath && !this.isExternalModule(importPath)) {
        imports.push(this.resolveImportPath(importPath, filePath));
      }
    }

    return imports;
  }

  /**
   * Check if import path is an external module (node_modules)
   */
  private isExternalModule(importPath: string): boolean {
    return (
      importPath.startsWith('@') ||
      !importPath.startsWith('.') ||
      importPath.includes('node_modules')
    );
  }

  /**
   * Resolve relative import path to absolute
   */
  private resolveImportPath(importPath: string, currentFile: string): string {
    if (importPath.startsWith('.')) {
      const currentDir = currentFile.substring(
        0,
        currentFile.lastIndexOf('/')
      );
      // Remove .js, .ts extensions if present in import
      const cleanImport = importPath.replace(/\.(js|ts|json)$/, '');
      // Add .ts for internal module resolution
      const resolved = `${currentDir}/${cleanImport}.ts`;
      return resolved;
    }
    return importPath;
  }

  /**
   * Check if file is a source file (TS/JS)
   */
  private isSourceFile(filePath: string): boolean {
    return (
      filePath.endsWith('.ts') ||
      filePath.endsWith('.js') ||
      filePath.endsWith('.tsx') ||
      filePath.endsWith('.jsx')
    );
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    return (
      filePath.includes('/tests/') ||
      filePath.includes('/test/') ||
      filePath.endsWith('.test.ts') ||
      filePath.endsWith('.test.js') ||
      filePath.endsWith('.spec.ts') ||
      filePath.endsWith('.spec.js')
    );
  }

  /**
   * Check if file should be excluded from analysis
   */
  private shouldExclude(filePath: string): boolean {
    return this.excludePatterns.some((pattern) => this.matchesPattern(filePath, pattern));
  }

  /**
   * Simple glob pattern matcher
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.');

    // Handle directory patterns
    if (!regexPattern.startsWith('^')) {
      regexPattern = '^' + regexPattern;
    }
    if (!regexPattern.endsWith('$')) {
      regexPattern += '$';
    }

    const regex = new RegExp(regexPattern);
    return regex.test(filePath);
  }

  /**
   * Resolve file path relative to project root
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    return `${this.projectRoot}/${filePath}`;
  }

  /**
   * Get dependency node for a file
   */
  getDependencyNode(filePath: string): DependencyNode | undefined {
    return this.dependencyCache.get(filePath);
  }

  /**
   * Get all files that import the given file
   */
  getImporters(filePath: string): Set<string> {
    return this.dependencyCache.get(filePath)?.importedBy || new Set();
  }

  /**
   * Get all files imported by the given file
   */
  getImports(filePath: string): Set<string> {
    return this.dependencyCache.get(filePath)?.imports || new Set();
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.dependencyCache.clear();
    this.fileContentCache.clear();
  }
}

/**
 * Parse changed files from git diff output
 */
export async function parseChangedFilesFromGit(
  baseBranch: string = 'main'
): Promise<ChangedFile[]> {
  const { execSync } = await import('child_process');

  try {
    // Get list of changed files compared to base branch
    const diffOutput = execSync(
      `git diff --name-status ${baseBranch}...HEAD`,
      { encoding: 'utf-8' }
    );

    // Get detailed stats for each file
    const statsOutput = execSync(
      `git diff --numstat ${baseBranch}...HEAD`,
      { encoding: 'utf-8' }
    );

    const statsLines = statsOutput.trim().split('\n');
    const statsMap = new Map<string, { additions: number; deletions: number }>();

    for (const line of statsLines) {
      const [additions, deletions, path] = line.split('\t');
      statsMap.set(path, {
        additions: parseInt(additions, 10) || 0,
        deletions: parseInt(deletions, 10) || 0,
      });
    }

    const files: ChangedFile[] = [];
    const statusLines = diffOutput.trim().split('\n');

    for (const line of statusLines) {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t'); // Handle renamed files with two paths

      if (!path) continue;

      const stats = statsMap.get(path) || { additions: 0, deletions: 0 };

      let changeType: ChangedFile['changeType'];
      let previousPath: string | undefined;

      const firstChar = status?.[0];
      switch (firstChar) {
        case 'A':
          changeType = 'added';
          break;
        case 'D':
          changeType = 'deleted';
          break;
        case 'R':
          changeType = 'renamed';
          previousPath = pathParts[0];
          break;
        case 'M':
        default:
          changeType = 'modified';
          break;
      }

      const fileType = path.split('.').pop() || '';

      files.push({
        path,
        changeType,
        previousPath,
        additions: stats.additions,
        deletions: stats.deletions,
        fileType,
      });
    }

    return files;
  } catch (error) {
    logger.error({ error }, 'Failed to parse git changes');
    return [];
  }
}

/**
 * Global change analyzer instance
 */
let globalAnalyzer: ChangeAnalyzer | null = null;

/**
 * Get the global change analyzer instance
 */
export function getGlobalChangeAnalyzer(
  projectRoot?: string,
  excludePatterns?: string[]
): ChangeAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new ChangeAnalyzer(projectRoot, excludePatterns);
  }
  return globalAnalyzer;
}

/**
 * Reset the global analyzer
 */
export function resetGlobalChangeAnalyzer(): void {
  globalAnalyzer = null;
}
