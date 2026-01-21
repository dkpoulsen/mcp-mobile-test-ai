/**
 * Registry Client
 *
 * Handles communication with npm registry to check for
 * outdated packages and security vulnerabilities.
 */

import { readFile } from 'node:fs/promises';
import type {
  PackageDependency,
  RegistryPackageInfo,
  DependencyCategory,
  SecurityVulnerability,
} from './types.js';
import {
  PackageDependencyType,
  UpdateSeverity,
  PackageNotFoundError,
  RegistryError,
} from './types.js';
import { categorizeDependency, shouldCheckSecurity } from './category-matcher.js';

/**
 * Default npm registry URL
 */
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * npm advisory API URL
 */
const ADVISORY_API = 'https://registry.npmjs.org/-/npm/v1/security';

/**
 * Cache for registry queries to reduce API calls
 */
const registryCache = new Map<string, { data: RegistryPackageInfo; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch package information from npm registry
 */
export async function fetchPackageInfo(
  packageName: string,
  registry: string = DEFAULT_REGISTRY
): Promise<RegistryPackageInfo> {
  const cacheKey = `${registry}:${packageName}`;
  const cached = registryCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = `${registry}/${packageName.replace(/\//g, '%2F')}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'mcp-mobile-test-ai-dependency-updater',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new PackageNotFoundError(packageName);
      }
      throw new RegistryError(
        `Failed to fetch package info for ${packageName}: ${response.statusText}`
      );
    }

    const data: RegistryPackageInfo = await response.json();

    registryCache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  } catch (error) {
    if (error instanceof PackageNotFoundError || error instanceof RegistryError) {
      throw error;
    }
    throw new RegistryError(
      `Network error fetching package info for ${packageName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetch security advisories for a package
 */
export async function fetchSecurityAdvisories(
  packageName: string
): Promise<SecurityVulnerability[]> {
  try {
    const url = `${ADVISORY_API}/advisories?package=${encodeURIComponent(packageName)}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'mcp-mobile-test-ai-dependency-updater',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      // Security advisories are optional - don't fail on error
      return [];
    }

    const data = await response.json();

    if (!data.advisories || !Array.isArray(data.advisories)) {
      return [];
    }

    return data.advisories.map((adv: any) => ({
      id: adv.id || adv.GHSA || adv.CVE || 'unknown',
      severity: adv.severity || 'moderate',
      title: adv.title || adv.title_of_advisory || 'Security Advisory',
      description: adv.overview || adv.description || '',
      patchedVersions: adv.patched_versions?.split(', '),
      vulnerableVersions: adv.vulnerable_versions?.split(', '),
      url: adv.url || adv.recommendation || '',
    }));
  } catch {
    // Security advisories are optional
    return [];
  }
}

/**
 * Parse version to determine update severity
 */
function determineUpdateSeverity(
  currentVersion: string,
  latestVersion: string
): UpdateSeverity {
  const current = currentVersion.replace(/^[\^~]/, '').split('.').map(Number);
  const latest = latestVersion.replace(/^[\^~]/, '').split('.').map(Number);

  // Handle cases where version parsing might fail
  if (current.length < 2 || latest.length < 2) {
    return UpdateSeverity.PATCH;
  }

  const [currentMajor, currentMinor = 0] = current;
  const [latestMajor, latestMinor = 0] = latest;

  if (latestMajor > currentMajor) {
    return UpdateSeverity.MAJOR;
  }
  if (latestMinor > currentMinor) {
    return UpdateSeverity.MINOR;
  }
  return UpdateSeverity.PATCH;
}

/**
 * Check if a package is outdated
 */
export async function checkPackageOutdated(
  packageName: string,
  currentVersion: string,
  type: PackageDependencyType
): Promise<PackageDependency | null> {
  try {
    const info = await fetchPackageInfo(packageName);
    const latestVersion = info['dist-tags']?.latest || info.version;

    // Normalize current version (remove ^ or ~ prefix for comparison)
    const normalizedCurrent = currentVersion.replace(/^[\^~]/, '');
    const normalizedLatest = latestVersion.replace(/^[\^~]/, '');

    // Compare versions (simple string comparison for semver)
    const currentParts = normalizedCurrent.split('.').map((v) => parseInt(v, 10) || 0);
    const latestParts = normalizedLatest.split('.').map((v) => parseInt(v, 10) || 0);

    let isOutdated = false;
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const c = currentParts[i] || 0;
      const l = latestParts[i] || 0;
      if (l > c) {
        isOutdated = true;
        break;
      }
      if (l < c) {
        break;
      }
    }

    if (!isOutdated) {
      return null;
    }

    const category = categorizeDependency(packageName);
    const severity = determineUpdateSeverity(currentVersion, latestVersion);

    // Fetch security advisories for critical packages
    let vulnerabilities: SecurityVulnerability[] = [];
    if (shouldCheckSecurity(packageName)) {
      vulnerabilities = await fetchSecurityAdvisories(packageName);
    }

    return {
      name: packageName,
      currentVersion,
      latestVersion,
      type,
      severity,
      category,
      homepage: info.homepage || info.bugs?.url,
      repository: info.repository?.url,
      releaseUrl: `https://github.com/${packageName.replace(/@.+?\//, '')}/releases/tag/v${latestVersion}`,
      isDirect: true,
      vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : undefined,
    };
  } catch (error) {
    if (error instanceof PackageNotFoundError) {
      console.warn(`Package not found in registry: ${packageName}`);
      return null;
    }
    throw error;
  }
}

/**
 * Read and parse package.json file
 */
export async function readPackageJson(packageJsonPath: string): Promise<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}> {
  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new RegistryError(
      `Failed to read package.json at ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all dependencies from package.json
 */
export function getAllDependencies(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}): Map<string, { version: string; type: PackageDependencyType }> {
  const dependencies = new Map<string, { version: string; type: PackageDependencyType }>();

  const addDeps = (
    deps: Record<string, string> | undefined,
    type: PackageDependencyType
  ) => {
    if (!deps) return;
    for (const [name, version] of Object.entries(deps)) {
      dependencies.set(name, { version, type });
    }
  };

  addDeps(packageJson.dependencies, PackageDependencyType.DEPENDENCIES);
  addDeps(packageJson.devDependencies, PackageDependencyType.DEV_DEPENDENCIES);
  addDeps(packageJson.peerDependencies, PackageDependencyType.PEER_DEPENDENCIES);
  addDeps(packageJson.optionalDependencies, PackageDependencyType.OPTIONAL_DEPENDENCIES);

  return dependencies;
}

/**
 * Find all outdated dependencies in package.json
 */
export async function findOutdatedDependencies(
  packageJsonPath: string,
  options: {
    categories?: DependencyCategory[];
    includeDev?: boolean;
    includePeer?: boolean;
    includeOptional?: boolean;
    includeMajor?: boolean;
    includeMinor?: boolean;
    includePatch?: boolean;
  } = {}
): Promise<PackageDependency[]> {
  const packageJson = await readPackageJson(packageJsonPath);
  const allDependencies = getAllDependencies(packageJson);
  const outdated: PackageDependency[] = [];

  for (const [name, { version, type }] of allDependencies) {
    // Skip based on type
    if (type === PackageDependencyType.PEER_DEPENDENCIES && !options.includePeer) {
      continue;
    }
    if (type === PackageDependencyType.OPTIONAL_DEPENDENCIES && !options.includeOptional) {
      continue;
    }

    const result = await checkPackageOutdated(name, version, type);
    if (result) {
      // Filter by severity
      if (result.severity === UpdateSeverity.MAJOR && !options.includeMajor) {
        continue;
      }
      if (result.severity === UpdateSeverity.MINOR && !options.includeMinor) {
        continue;
      }
      if (result.severity === UpdateSeverity.PATCH && !options.includePatch) {
        continue;
      }

      // Filter by category if specified
      if (options.categories && options.categories.length > 0) {
        if (!options.categories.includes(result.category)) {
          continue;
        }
      }

      outdated.push(result);
    }
  }

  return outdated;
}

/**
 * Clear the registry cache
 */
export function clearRegistryCache(): void {
  registryCache.clear();
}
