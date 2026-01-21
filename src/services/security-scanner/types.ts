/**
 * Security Scanner Types
 *
 * Type definitions for the security scanning service.
 */

/**
 * Security issue severity levels
 */
export enum SecuritySeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

/**
 * Security issue categories
 */
export enum SecurityCategory {
  INSECURE_STORAGE = 'insecure_storage',
  EXPOSED_API_KEY = 'exposed_api_key',
  INSECURE_NETWORK = 'insecure_network',
  WEAK_CRYPTO = 'weak_crypto',
  AUTH_ISSUE = 'auth_issue',
  DATA_LEAK = 'data_leak',
}

/**
 * Base security finding interface
 */
export interface SecurityFinding {
  id: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  title: string;
  description: string;
  location: string;
  evidence?: string;
  recommendation: string;
  references?: string[];
  cwe?: string; // Common Weakness Enumeration ID
  timestamp: Date;
}

/**
 * Insecure storage finding
 */
export interface InsecureStorageFinding extends SecurityFinding {
  category: SecurityCategory.INSECURE_STORAGE;
  storageType: 'localStorage' | 'sessionStorage' | 'cookie' | 'file' | 'database' | 'memory';
  dataSensitivity: 'high' | 'medium' | 'low';
}

/**
 * Exposed API key finding
 */
export interface ExposedAPIKeyFinding extends SecurityFinding {
  category: SecurityCategory.EXPOSED_API_KEY;
  keyType: string;
  keyProvider: string;
  keyPrefix?: string;
  keyLocation: 'code' | 'config' | 'environment' | 'logs';
  isRevocable: boolean;
}

/**
 * Insecure network configuration finding
 */
export interface InsecureNetworkFinding extends SecurityFinding {
  category: SecurityCategory.INSECURE_NETWORK;
  protocol: string;
  issue: 'plaintext' | 'weak_tls' | 'self_signed_cert' | 'expired_cert' | 'missing_cert_validation';
  affectedUrl?: string;
}

/**
 * Union type of all security findings
 */
export type AnySecurityFinding =
  | InsecureStorageFinding
  | ExposedAPIKeyFinding
  | InsecureNetworkFinding
  | SecurityFinding;

/**
 * Security scan options
 */
export interface SecurityScanOptions {
  /**
   * Scan for insecure data storage patterns
   */
  checkInsecureStorage?: boolean;

  /**
   * Scan for exposed API keys
   */
  checkExposedKeys?: boolean;

  /**
   * Scan for insecure network configurations
   */
  checkInsecureNetwork?: boolean;

  /**
   * Paths to include in the scan
   */
  includePaths?: string[];

  /**
   * Paths to exclude from the scan
   */
  excludePaths?: string[];

  /**
   * File patterns to scan (glob patterns)
   */
  filePatterns?: string[];

  /**
   * Maximum depth for directory traversal
   */
  maxDepth?: number;

  /**
   * Whether to follow symlinks
   */
  followSymlinks?: boolean;
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  scanId: string;
  timestamp: Date;
  duration: number; // in milliseconds
  options: SecurityScanOptions;
  findings: AnySecurityFinding[];
  summary: SecurityScanSummary;
  scannedPaths: string[];
  scannedFiles: number;
}

/**
 * Security scan summary
 */
export interface SecurityScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  byCategory: Record<SecurityCategory, number>;
}

/**
 * Security report format options
 */
export enum SecurityReportFormat {
  JSON = 'json',
  TEXT = 'text',
  HTML = 'html',
  MARKDOWN = 'markdown',
}

/**
 * Security report options
 */
export interface SecurityReportOptions {
  format: SecurityReportFormat;
  includeSummary?: boolean;
  includeDetails?: boolean;
  includeRecommendations?: boolean;
  sortBy?: 'severity' | 'category' | 'location';
  severityFilter?: SecuritySeverity[];
  categoryFilter?: SecurityCategory[];
  outputPath?: string;
}

/**
 * Security report
 */
export interface SecurityReport {
  scanResult: SecurityScanResult;
  format: SecurityReportFormat;
  generatedAt: Date;
  content: string;
}

/**
 * Pattern for detecting API keys
 */
export interface APIKeyPattern {
  name: string;
  provider: string;
  pattern: RegExp;
  description: string;
  revocable: boolean;
}

/**
 * Insecure storage pattern
 */
export interface InsecureStoragePattern {
  type: 'localStorage' | 'sessionStorage' | 'cookie' | 'file';
  pattern: RegExp;
  sensitivity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Network security check
 */
export interface NetworkSecurityCheck {
  name: string;
  pattern: RegExp;
  severity: SecuritySeverity;
  issue: InsecureNetworkFinding['issue'];
  description: string;
}
