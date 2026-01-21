/**
 * Type definitions for Appium Server Wrapper
 */

/**
 * Appium server status
 */
export type AppiumServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Appium log level
 */
export type AppiumLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuration for starting an Appium server
 */
export interface AppiumServerConfig {
  /**
   * Host address to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Port to run the server on
   * If not specified, an available port will be automatically allocated
   */
  port?: number;

  /**
   * Base path for the Appium server
   * @default '/'
   */
  basePath?: string;

  /**
   * Path to the Appium executable
   * If not specified, uses 'appium' from PATH
   */
  appiumPath?: string;

  /**
   * Additional CLI arguments to pass to Appium
   */
  args?: string[];

  /**
   * Session timeout in milliseconds
   */
  sessionTimeout?: number;

  /**
   * Log level for the Appium server
   * @default 'info'
   */
  logLevel?: AppiumLogLevel;

  /**
   * Path to log file for Appium output
   * If not specified, logs to console only
   */
  logFile?: string;

  /**
   * Enable debug logging in the wrapper
   * @default false
   */
  debug?: boolean;

  /**
   * Maximum time to wait for server to start (ms)
   * @default 60000
   */
  startupTimeout?: number;

  /**
   * Maximum time to wait for server to stop (ms)
   * @default 30000
   */
  shutdownTimeout?: number;

  /**
   * Custom environment variables for the Appium process
   */
  env?: Record<string, string>;

  /**
   * Whether to automatically restart the server if it crashes
   * @default false
   */
  autoRestart?: boolean;

  /**
   * Number of restart attempts before giving up
   * @default 3
   */
  maxRestartAttempts?: number;
}

/**
 * Information about a running Appium server
 */
export interface AppiumServerInfo {
  /**
   * Server instance ID
   */
  id: string;

  /**
   * Current status
   */
  status: AppiumServerStatus;

  /**
   * Host address
   */
  host: string;

  /**
   * Port number
   */
  port: number;

  /**
   * Base path
   */
  basePath: string;

  /**
   * Full URL to the server
   */
  serverUrl: string;

  /**
   * Process ID (if running)
   */
  pid?: number;

  /**
   * Whether port was automatically allocated
   */
  isPortAutoAllocated: boolean;

  /**
   * When the server was started
   */
  startedAt?: Date;

  /**
   * Configuration used to start the server
   */
  config: AppiumServerConfig;
}

/**
 * Options for health check
 */
export interface HealthCheckOptions {
  /**
   * Timeout for health check request (ms)
   * @default 5000
   */
  timeout?: number;

  /**
   * Number of retry attempts
   * @default 3
   */
  retries?: number;

  /**
   * Delay between retries (ms)
   * @default 1000
   */
  retryDelay?: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /**
   * Whether the server is healthy
   */
  healthy: boolean;

  /**
   * Server status endpoint response
   */
  status?: {
    ready: boolean;
    build: {
      version: string;
    };
    uptime?: number;
  };

  /**
   * Response time in milliseconds
   */
  responseTime?: number;

  /**
   * Error message if health check failed
   */
  error?: string;
}

/**
 * Log entry from Appium server output
 */
export interface AppiumLogEntry {
  /**
   * Timestamp of the log entry
   */
  timestamp: Date;

  /**
   * Log level
   */
  level: AppiumLogLevel;

  /**
   * Log message
   */
  message: string;

  /**
   * Raw log line
   */
  raw: string;
}

/**
 * Error thrown when Appium server operations fail
 */
export class AppiumServerError extends Error {
  constructor(
    message: string,
    public code: string,
    public serverId?: string
  ) {
    super(message);
    this.name = 'AppiumServerError';
  }
}

/**
 * Error thrown when server fails to start
 */
export class AppiumStartupError extends AppiumServerError {
  constructor(message: string, serverId?: string) {
    super(message, 'STARTUP_ERROR', serverId);
    this.name = 'AppiumStartupError';
  }
}

/**
 * Error thrown when server fails to stop
 */
export class AppiumShutdownError extends AppiumServerError {
  constructor(message: string, serverId?: string) {
    super(message, 'SHUTDOWN_ERROR', serverId);
    this.name = 'AppiumShutdownError';
  }
}

/**
 * Error thrown when health check fails
 */
export class AppiumHealthCheckError extends AppiumServerError {
  constructor(message: string, serverId?: string) {
    super(message, 'HEALTH_CHECK_ERROR', serverId);
    this.name = 'AppiumHealthCheckError';
  }
}

/**
 * Error thrown when port allocation fails
 */
export class PortAllocationError extends AppiumServerError {
  constructor(message: string) {
    super(message, 'PORT_ALLOCATION_ERROR');
    this.name = 'PortAllocationError';
  }
}
