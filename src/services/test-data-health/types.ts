/**
 * Test Data Health Service Types
 * Types for detecting and handling stale/corrupted test data
 */

/**
 * Health status of test data
 */
export enum DataHealthStatus {
  /** Data is fresh and valid */
  HEALTHY = 'healthy',
  /** Data is old and may need refresh */
  STALE = 'stale',
  /** Data is corrupted or inconsistent */
  CORRUPTED = 'corrupted',
  /** Data has broken foreign key relationships */
  ORPHANED = 'orphaned',
  /** Data violates constraints */
  CONSTRAINT_VIOLATED = 'constraint_violated',
}

/**
 * Health check result for a specific table/model
 */
export interface DataHealthResult {
  /** The model/table name */
  model: string;

  /** Health status */
  status: DataHealthStatus;

  /** Number of records checked */
  recordCount: number;

  /** Number of unhealthy records found */
  unhealthyCount: number;

  /** Details about issues found */
  issues: DataIssue[];

  /** When the data was created (if trackable) */
  oldestRecord?: Date;

  /** When the data was last updated (if trackable) */
  newestRecord?: Date;

  /** Whether data needs regeneration */
  needsRegeneration: boolean;
}

/**
 * Specific data issue found during health check
 */
export interface DataIssue {
  /** Type of issue */
  type: IssueType;

  /** Description of the issue */
  description: string;

  /** Record ID (if available) */
  recordId?: string;

  /** Field name that has the issue */
  field?: string;

  /** Expected value/constraint */
  expected?: string;

  /** Actual value found */
  actual?: unknown;
}

/**
 * Types of issues that can be detected
 */
export enum IssueType {
  /** Record is too old (stale) */
  STALE = 'stale',
  /** Foreign key reference is missing (orphan) */
  ORPHAN = 'orphan',
  /** Required field is null */
  NULL_REQUIRED = 'null_required',
  /** Unique constraint violated */
  NOT_UNIQUE = 'not_unique',
  /** Invalid enum value */
  INVALID_ENUM = 'invalid_enum',
  /** Invalid data format */
  INVALID_FORMAT = 'invalid_format',
  /** Missing relationship data */
  MISSING_RELATION = 'missing_relation',
  /** Circular dependency */
  CIRCULAR_DEPENDENCY = 'circular_dependency',
  /** Inconsistent state */
  INCONSISTENT_STATE = 'inconsistent_state',
  /** Database connection error */
  DB_ERROR = 'db_error',
}

/**
 * Overall health check configuration
 */
export interface HealthCheckConfig {
  /** Maximum age of test data before considered stale (ms) */
  maxDataAge?: number;

  /** Whether to check foreign key integrity */
  checkForeignKeys?: boolean;

  /** Whether to check for orphaned records */
  checkOrphans?: boolean;

  /** Whether to validate field constraints */
  validateConstraints?: boolean;

  /** Models to skip during health checks */
  skipModels?: string[];

  /** Custom health checks for specific models */
  customChecks?: Record<string, CustomHealthCheck>;
}

/**
 * Custom health check function for a model
 */
export interface CustomHealthCheck {
  /** Check function */
  check: (records: unknown[]) => DataIssue[];

  /** Whether to skip default checks for this model */
  skipDefault?: boolean;
}

/**
 * Result of a full database health check
 */
export interface DatabaseHealthResult {
  /** Overall health status */
  overallStatus: DataHealthStatus;

  /** Health results per model */
  modelResults: Map<string, DataHealthResult>;

  /** Total number of issues found */
  totalIssues: number;

  /** Timestamp of the health check */
  checkedAt: Date;

  /** Duration of health check in ms */
  duration: number;

  /** Whether regeneration is recommended */
  needsRegeneration: boolean;
}

/**
 * Configuration for test data regeneration
 */
export interface RegenerationConfig {
  /** Models to regenerate (empty = all) */
  models?: string[];

  /** Number of records to generate per model */
  recordCounts?: Record<string, number>;

  /** Whether to preserve certain records */
  preserveRecords?: Record<string, string[]>;

  /** Whether to use transactions */
  useTransaction?: boolean;

  /** Whether to validate generated data */
  validate?: boolean;

  /** Callback for progress updates */
  onProgress?: (progress: RegenerationProgress) => void;
}

/**
 * Progress update during regeneration
 */
export interface RegenerationProgress {
  /** Current model being processed */
  currentModel: string;

  /** Number of models completed */
  completed: number;

  /** Total number of models to process */
  total: number;

  /** Current operation */
  operation: 'validating' | 'deleting' | 'generating' | 'inserting';
}

/**
 * Result of data regeneration
 */
export interface RegenerationResult {
  /** Whether regeneration was successful */
  success: boolean;

  /** Number of records created per model */
  recordsCreated: Record<string, number>;

  /** Any errors that occurred */
  errors: Array<{
    model: string;
    error: string;
  }>;

  /** Duration in ms */
  duration: number;

  /** Timestamp of regeneration */
  regeneratedAt: Date;
}
