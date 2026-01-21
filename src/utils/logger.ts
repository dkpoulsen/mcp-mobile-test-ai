/**
 * Structured logging utility using Pino
 * Features:
 * - JSON format for production, pretty-print for development
 * - Configurable log levels
 * - File output with rotation
 * - Sensitive data redaction
 */

import pino from 'pino';
import * as rfs from 'rotating-file-stream';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Log levels compatible with Pino
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent',
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   */
  level?: LogLevel | string;

  /**
   * Path to log file (if omitted, logs only to stdout)
   */
  file?: string;

  /**
   * Enable pretty printing (default: true in development, false in production)
   */
  pretty?: boolean;

  /**
   * Enable file output with rotation
   */
  enableFileRotation?: boolean;

  /**
   * Maximum size of each log file before rotation (e.g., '10M', '100M')
   */
  maxSize?: string;

  /**
   * Maximum number of rotated log files to keep
   */
  maxFiles?: number;

  /**
   * Additional redaction paths for sensitive data
   * Format: 'path.to.property' or wildcard 'path.to.*'
   */
  redactPaths?: string[];

  /**
   * Service/module name for log context
   */
  name?: string;
}

/**
 * Default paths to redact (sensitive data)
 */
const DEFAULT_REDACT_PATHS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'apiKeySecret',
  'api_key_secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  // Nested paths
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'config.apiKey',
  'config.apiSecret',
  'llm.apiKey',
  'llm.api_key',
  // Wildcard patterns for arrays/objects
  '*.password',
  '*.token',
  '*.apiKey',
  '*.*.password',
  '*.*.token',
];

/**
 * Map string level to Pino level
 */
function normalizeLevel(level: string | undefined): pino.LevelWithSilent {
  const validLevels: pino.LevelWithSilent[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
  const normalized = (level || 'info').toLowerCase();
  if (validLevels.includes(normalized as pino.LevelWithSilent)) {
    return normalized as pino.LevelWithSilent;
  }
  return 'info';
}

/**
 * Create a rotating file stream for log output
 */
function createRotatingFileStream(
  filePath: string,
  maxSize: string = '10M',
  maxFiles: number = 5
): rfs.RotatingFileStream {
  const dir = dirname(filePath);

  // Ensure log directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = filePath.split('/').pop() || 'app.log';

  return rfs.createStream(filename, {
    path: dir,
    size: maxSize,
    interval: '1d',
    compress: 'gzip',
    maxFiles: maxFiles,
    history: filename,
  });
}

/**
 * Determine if pretty printing should be enabled
 */
function shouldUsePrettyPrint(config: LoggerConfig): boolean {
  if (config.pretty !== undefined) {
    return config.pretty;
  }
  // Auto-enable in development, disable in production
  return process.env.NODE_ENV === 'development';
}

/**
 * Create a Pino logger with the given configuration
 */
export function createLogger(config: LoggerConfig = {}): pino.Logger {
  const level = normalizeLevel(config.level);
  const isPretty = shouldUsePrettyPrint(config);

  // Build redaction paths (defaults + custom)
  const redactPaths = [...DEFAULT_REDACT_PATHS];
  if (config.redactPaths && config.redactPaths.length > 0) {
    redactPaths.push(...config.redactPaths);
  }

  // Base options for Pino
  const baseOptions: pino.LoggerOptions = {
    level,
    redact: {
      paths: redactPaths,
      remove: true,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  // Add service name if provided
  if (config.name) {
    baseOptions.name = config.name;
  }

  // File transport with rotation
  if (config.file && config.enableFileRotation) {
    const fileStream = createRotatingFileStream(
      config.file,
      config.maxSize,
      config.maxFiles
    );

    // For file rotation, we use a multistream to output to both console and file
    return pino(
      baseOptions,
      pino.multistream([
        { stream: process.stdout },
        { stream: fileStream as unknown as pino.DestinationStream },
      ])
    );
  }

  // Build transports for non-rotation mode
  const transports: pino.TransportTargetOptions[] = [];

  // Console transport
  if (isPretty) {
    transports.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    });
  }

  // File transport (without rotation)
  if (config.file && !config.enableFileRotation) {
    transports.push({
      target: 'pino/file',
      options: { destination: config.file },
    });
  }

  // Apply transport configuration
  if (transports.length > 0) {
    baseOptions.transport = transports.length === 1
      ? transports[0]
      : { targets: transports };
  }

  return pino(baseOptions);
}

/**
 * Logger class that wraps Pino for a familiar API
 */
export class Logger {
  private pinoInstance: pino.Logger;
  private config: LoggerConfig;

  constructor(config: LoggerConfig = {}) {
    this.config = config;
    this.pinoInstance = createLogger(config);
  }

  get pino(): pino.Logger {
    return this.pinoInstance;
  }

  set pino(value: pino.Logger) {
    this.pinoInstance = value;
  }

  /**
   * Log a debug message
   */
  debug(msg: string, ...args: unknown[]): void;
  debug(obj: object, msg?: string, ...args: unknown[]): void;
  debug(msgOrObj: string | object, msg?: string, ...args: unknown[]): void {
    if (typeof msgOrObj === 'string') {
      this.pinoInstance.debug({ args }, msgOrObj);
    } else {
      this.pinoInstance.debug(msgOrObj, msg, ...args);
    }
  }

  /**
   * Log an info message
   */
  info(msg: string, ...args: unknown[]): void;
  info(obj: object, msg?: string, ...args: unknown[]): void;
  info(msgOrObj: string | object, msg?: string, ...args: unknown[]): void {
    if (typeof msgOrObj === 'string') {
      this.pinoInstance.info({ args }, msgOrObj);
    } else {
      this.pinoInstance.info(msgOrObj, msg, ...args);
    }
  }

  /**
   * Log a warning message
   */
  warn(msg: string, ...args: unknown[]): void;
  warn(obj: object, msg?: string, ...args: unknown[]): void;
  warn(msgOrObj: string | object, msg?: string, ...args: unknown[]): void {
    if (typeof msgOrObj === 'string') {
      this.pinoInstance.warn({ args }, msgOrObj);
    } else {
      this.pinoInstance.warn(msgOrObj, msg, ...args);
    }
  }

  /**
   * Log an error message
   */
  error(msg: string, ...args: unknown[]): void;
  error(err: Error, msg?: string, ...args: unknown[]): void;
  error(obj: object, msg?: string, ...args: unknown[]): void;
  error(msgOrErrOrObj: string | Error | object, msg?: string, ...args: unknown[]): void {
    if (msgOrErrOrObj instanceof Error) {
      this.pinoInstance.error({ err: msgOrErrOrObj, args }, msg || msgOrErrOrObj.message);
    } else if (typeof msgOrErrOrObj === 'string') {
      this.pinoInstance.error({ args }, msgOrErrOrObj);
    } else {
      this.pinoInstance.error(msgOrErrOrObj, msg, ...args);
    }
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel | string): void {
    this.pinoInstance.level = normalizeLevel(level);
  }

  /**
   * Get the current log level
   */
  getLevel(): string {
    return this.pinoInstance.level;
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, string>): Logger {
    const childPino = this.pinoInstance.child(bindings);
    const childLogger = new Logger({ ...this.config });
    childLogger.pinoInstance = childPino;
    return childLogger;
  }

  /**
   * Get the underlying Pino instance
   */
  getPino(): pino.Logger {
    return this.pinoInstance;
  }
}

/**
 * Default global logger instance
 * Uses environment variables for configuration
 */
const globalLogger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE,
  pretty: process.env.LOG_FORMAT === 'text' || process.env.NODE_ENV === 'development',
  enableFileRotation: true,
  maxSize: '10M',
  maxFiles: 5,
});

export { globalLogger as logger };

/**
 * Create a new logger with a module name prefix
 */
export function createModuleLogger(moduleName: string): Logger {
  return globalLogger.child({ module: moduleName });
}

/**
 * Re-export types for convenience
 */
export type { pino };

/**
 * Get a logger instance with the given module name
 * Convenience function for creating module-specific loggers
 */
export function getLogger(moduleName: string): Logger {
  return createModuleLogger(moduleName);
}
