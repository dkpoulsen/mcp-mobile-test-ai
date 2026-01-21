/**
 * Log capture utilities for Appium server output
 */

import { Writable } from 'node:stream';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppiumLogEntry, AppiumLogLevel } from './types.js';

/**
 * Parse log level from a log line
 */
function parseLogLevel(line: string): AppiumLogLevel {
  const lowerLine = line.toLowerCase();

  if (lowerLine.includes('[error]') || lowerLine.includes('error:') || lowerLine.includes('err:')) {
    return 'error';
  }
  if (lowerLine.includes('[warn]') || lowerLine.includes('warning:') || lowerLine.includes('warn:')) {
    return 'warn';
  }
  if (lowerLine.includes('[debug]') || lowerLine.includes('debug:')) {
    return 'debug';
  }
  return 'info';
}

/**
 * Parse a log line into structured data
 */
function parseLogLine(line: string): AppiumLogEntry {
  return {
    timestamp: new Date(),
    level: parseLogLevel(line),
    message: line.trim(),
    raw: line,
  };
}

/**
 * Log buffer for in-memory log storage
 */
export class LogBuffer {
  private entries: AppiumLogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add a log entry
   */
  add(entry: AppiumLogEntry): void {
    this.entries.push(entry);

    // Keep buffer size under limit
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  /**
   * Add a raw log line
   */
  addLine(line: string): void {
    this.add(parseLogLine(line));
  }

  /**
   * Get all log entries
   */
  getAll(): AppiumLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get log entries filtered by level
   */
  getByLevel(level: AppiumLogLevel): AppiumLogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /**
   * Get log entries from a time range
   */
  getTimeRange(start: Date, end: Date): AppiumLogEntry[] {
    return this.entries.filter((e) => e.timestamp >= start && e.timestamp <= end);
  }

  /**
   * Get the most recent log entries
   */
  getRecent(count: number): AppiumLogEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get the current buffer size
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Search for log entries containing text
   */
  search(text: string): AppiumLogEntry[] {
    const lowerText = text.toLowerCase();
    return this.entries.filter((e) =>
      e.message.toLowerCase().includes(lowerText) || e.raw.toLowerCase().includes(lowerText)
    );
  }
}

/**
 * Writable stream that captures and optionally writes to file
 */
export class LogCaptureStream extends Writable {
  private buffer: LogBuffer;
  private fileStream?: Writable;
  private logger?: (entry: AppiumLogEntry) => void;

  constructor(options: {
    buffer?: LogBuffer;
    logFile?: string;
    logger?: (entry: AppiumLogEntry) => void;
  } = {}) {
    super({ decodeStrings: false });

    this.buffer = options.buffer || new LogBuffer();
    this.logger = options.logger;

    // Create file stream if log file is specified
    if (options.logFile) {
      const logDir = dirname(options.logFile);

      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      this.fileStream = createWriteStream(options.logFile, { flags: 'a' });

      this.fileStream.on('error', (err) => {
        console.error('Log file stream error:', err);
      });
    }
  }

  _write(chunk: string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseLogLine(line);

      // Add to buffer
      this.buffer.add(entry);

      // Write to file if configured
      this.fileStream?.write(line + '\n');

      // Call logger if configured
      this.logger?.(entry);
    }

    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    // Close file stream
    this.fileStream?.end(() => {
      callback();
    });
  }

  /**
   * Get the log buffer
   */
  getBuffer(): LogBuffer {
    return this.buffer;
  }

  /**
   * Close the stream and cleanup resources
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.fileStream?.end(() => {
        resolve();
      });

      if (!this.fileStream) {
        resolve();
      }
    });
  }
}

/**
 * Create a log capture stream
 */
export function createLogCaptureStream(options: {
  logFile?: string;
  maxBufferSize?: number;
  logger?: (entry: AppiumLogEntry) => void;
}): LogCaptureStream {
  const buffer = new LogBuffer(options.maxBufferSize);
  return new LogCaptureStream({
    buffer,
    logFile: options.logFile,
    logger: options.logger,
  });
}
