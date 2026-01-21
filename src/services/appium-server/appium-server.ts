/**
 * Appium Server - manages a single Appium server instance
 */

import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Logger } from '../../utils/logger.js';
import type {
  AppiumServerConfig,
  AppiumServerInfo,
  AppiumServerStatus,
  HealthCheckOptions,
  HealthCheckResult,
} from './types.js';
import {
  AppiumStartupError,
  AppiumShutdownError,
  AppiumHealthCheckError,
} from './types.js';
import { findAvailablePort, isPortAvailable, releasePort } from './port-allocator.js';
import { createLogCaptureStream, LogCaptureStream } from './log-capture.js';

/**
 * Default configuration values
 */
const DEFAULTS = {
  host: '127.0.0.1',
  basePath: '/',
  appiumPath: 'appium',
  logLevel: 'info' as const,
  startupTimeout: 60000,
  shutdownTimeout: 30000,
  healthCheckRetries: 30,
  healthCheckRetryDelay: 1000,
  healthCheckTimeout: 5000,
};

/**
 * Appium server class - manages a single server instance
 */
export class AppiumServer {
  private id: string;
  private config: Required<AppiumServerConfig>;
  private process: ChildProcess | null = null;
  private status: AppiumServerStatus = 'stopped';
  private port: number = 0;
  private isPortAutoAllocated: boolean = false;
  private startedAt: Date | null = null;
  private logger: Logger;
  private logCapture: LogCaptureStream | null = null;
  private restartCount: number = 0;

  constructor(config: AppiumServerConfig = {}, parentLogger?: Logger) {
    this.id = randomUUID();
    this.logger = parentLogger?.child({ component: 'appium-server', serverId: this.id }) || new Logger({ name: 'appium-server' });

    // Merge config with defaults
    this.config = {
      host: config.host || DEFAULTS.host,
      basePath: config.basePath || DEFAULTS.basePath,
      appiumPath: config.appiumPath || DEFAULTS.appiumPath,
      args: config.args || [],
      sessionTimeout: config.sessionTimeout,
      logLevel: config.logLevel || DEFAULTS.logLevel,
      logFile: config.logFile,
      debug: config.debug || false,
      startupTimeout: config.startupTimeout || DEFAULTS.startupTimeout,
      shutdownTimeout: config.shutdownTimeout || DEFAULTS.shutdownTimeout,
      env: config.env || {},
      autoRestart: config.autoRestart || false,
      maxRestartAttempts: config.maxRestartAttempts || 3,
      port: config.port,
    };
  }

  /**
   * Start the Appium server
   */
  async start(): Promise<AppiumServerInfo> {
    if (this.status === 'running' || this.status === 'starting') {
      throw new AppiumStartupError('Server is already running or starting', this.id);
    }

    this.status = 'starting';
    this.logger.info('Starting Appium server', { config: this.sanitizeConfig() });

    try {
      // Allocate port if not specified
      if (this.config.port) {
        const available = await isPortAvailable(this.config.port);
        if (!available) {
          throw new AppiumStartupError(
            `Port ${this.config.port} is already in use`,
            this.id
          );
        }
        this.port = this.config.port;
        this.isPortAutoAllocated = false;
      } else {
        this.port = await findAvailablePort({
          logger: this.logger,
        });
        this.isPortAutoAllocated = true;
      }

      // Build command arguments
      const args = this.buildCommandArgs();

      // Setup log capture
      this.logCapture = createLogCaptureStream({
        logFile: this.config.logFile,
        logger: (entry) => this.handleLogEntry(entry),
      });

      // Spawn the process
      this.process = spawn(this.config.appiumPath, args, {
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      // Setup process event handlers
      this.setupProcessHandlers();

      // Pipe output to log capture
      this.process.stdout?.pipe(this.logCapture);
      this.process.stderr?.pipe(this.logCapture);

      // Wait for server to be ready
      await this.waitForReady();

      this.status = 'running';
      this.startedAt = new Date();
      this.restartCount = 0;

      this.logger.info('Appium server started successfully', {
        port: this.port,
        url: this.getServerUrl(),
        pid: this.process.pid,
      });

      return this.getInfo();
    } catch (error) {
      this.status = 'error';

      // Cleanup on failure
      if (this.isPortAutoAllocated) {
        releasePort(this.port);
      }

      await this.cleanup();

      const message = error instanceof Error ? error.message : String(error);
      throw new AppiumStartupError(`Failed to start Appium server: ${message}`, this.id);
    }
  }

  /**
   * Stop the Appium server
   */
  async stop(): Promise<void> {
    if (this.status === 'stopped') {
      return;
    }

    this.status = 'stopping';
    this.logger.info('Stopping Appium server', { pid: this.process?.pid });

    const startTime = Date.now();

    try {
      if (this.process) {
        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Wait for process to exit
        await this.waitForExit(this.config.shutdownTimeout);

        // Force kill if still running
        if (this.process && this.process.exitCode === null) {
          this.logger.warn('Process did not exit gracefully, forcing shutdown');
          this.process.kill('SIGKILL');
          await this.waitForExit(5000);
        }
      }

      // Cleanup resources
      await this.cleanup();

      const duration = Date.now() - startTime;
      this.logger.info('Appium server stopped', { duration });
    } catch (error) {
      this.status = 'error';
      throw new AppiumShutdownError(
        `Failed to stop Appium server: ${error instanceof Error ? error.message : String(error)}`,
        this.id
      );
    }
  }

  /**
   * Restart the Appium server
   */
  async restart(): Promise<AppiumServerInfo> {
    this.logger.info('Restarting Appium server');
    await this.stop();
    return this.start();
  }

  /**
   * Check if the server is healthy
   */
  async healthCheck(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
    const { timeout = DEFAULTS.healthCheckTimeout, retries = 3, retryDelay = 1000 } = options;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.performHealthCheck(timeout);
        if (result.healthy) {
          return result;
        }
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    return { healthy: false, error: 'Health check failed after retries' };
  }

  /**
   * Get server information
   */
  getInfo(): AppiumServerInfo {
    return {
      id: this.id,
      status: this.status,
      host: this.config.host,
      port: this.port,
      basePath: this.config.basePath,
      serverUrl: this.getServerUrl(),
      pid: this.process?.pid,
      isPortAutoAllocated: this.isPortAutoAllocated,
      startedAt: this.startedAt || undefined,
      config: this.sanitizeConfig(),
    };
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return `http://${this.config.host}:${this.port}${this.config.basePath}`;
  }

  /**
   * Get the server ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the current status
   */
  getStatus(): AppiumServerStatus {
    return this.status;
  }

  /**
   * Get the port number
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.status === 'running' && this.process !== null && this.process.exitCode === null;
  }

  /**
   * Build command arguments for Appium
   */
  private buildCommandArgs(): string[] {
    const args = [...this.config.args];

    // Add host and port
    args.push('--host', this.config.host);
    args.push('--port', this.port.toString());

    // Add base path if not default
    if (this.config.basePath !== '/') {
      args.push('--base-path', this.config.basePath);
    }

    // Add log level
    const logLevelMap = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' };
    args.push('--log-level', logLevelMap[this.config.logLevel]);

    // Allow-collision is important for parallel testing
    if (!args.includes('--allow-cors')) {
      args.push('--allow-cors');
    }

    // Use relaxed security for testing
    if (!args.includes('--relaxed-security')) {
      args.push('--relaxed-security');
    }

    // Add session timeout if specified
    if (this.config.sessionTimeout) {
      args.push('--session-override');

      // Session timeout is in seconds
      const timeoutSeconds = Math.floor(this.config.sessionTimeout / 1000);
      args.push('--default-capabilities', JSON.stringify({
        'appium:newCommandTimeout': timeoutSeconds,
      }));
    }

    return args;
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('error', (error) => {
      this.logger.error('Appium process error', { error: error.message });
      this.status = 'error';

      if (this.config.autoRestart && this.restartCount < this.config.maxRestartAttempts) {
        this.logger.info('Attempting to restart server', { attempt: this.restartCount + 1 });
        this.restartCount++;
        setTimeout(() => {
          this.start().catch((err) => {
            this.logger.error('Auto-restart failed', { error: err.message });
          });
        }, 1000);
      }
    });

    this.process.on('exit', (code, signal) => {
      this.logger.info('Appium process exited', { code, signal });

      if (this.status === 'running') {
        this.status = 'stopped';
      }

      // Release port if it was auto-allocated
      if (this.isPortAutoAllocated) {
        releasePort(this.port);
      }
    });
  }

  /**
   * Wait for the server to be ready
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.startupTimeout;

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.performHealthCheck(2000);
        if (result.healthy) {
          return;
        }
      } catch {
        // Server not ready yet, continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, DEFAULTS.healthCheckRetryDelay));
    }

    throw new Error(`Server did not become ready within ${timeout}ms`);
  }

  /**
   * Perform the actual health check
   */
  private performHealthCheck(timeout: number): Promise<HealthCheckResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const url = new URL(this.getServerUrl());
      url.pathname = '/status';

      const options = {
        hostname: url.hostname,
        port: url.port || parseInt(this.port.toString()),
        path: url.pathname,
        method: 'GET',
        timeout,
      };

      const req = request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const responseTime = Date.now() - startTime;

          try {
            const json = JSON.parse(data);
            const ready = json.value?.ready === true;

            resolve({
              healthy: ready,
              status: json.value,
              responseTime,
            });
          } catch {
            // Some Appium versions return different format
            resolve({
              healthy: res.statusCode === 200,
              responseTime,
            });
          }
        });
      });

      req.on('error', (err) => {
        reject(new AppiumHealthCheckError(`Health check failed: ${err.message}`, this.id));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new AppiumHealthCheckError('Health check timed out', this.id));
      });

      req.end();
    });
  }

  /**
   * Wait for process to exit
   */
  private waitForExit(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.exitCode !== null) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Process did not exit within timeout'));
      }, timeout);

      this.process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.status = 'stopped';
    this.startedAt = null;

    if (this.logCapture) {
      await this.logCapture.close();
      this.logCapture = null;
    }

    if (this.isPortAutoAllocated && this.port > 0) {
      releasePort(this.port);
    }

    this.process = null;
  }

  /**
   * Handle log entries
   */
  private handleLogEntry(entry: { level: string; message: string }): void {
    if (!this.config.debug) return;

    const logMethod = entry.level === 'error' ? 'error' :
      entry.level === 'warn' ? 'warn' :
      entry.level === 'debug' ? 'debug' : 'info';

    this.logger[logMethod](entry.message);
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  private sanitizeConfig(): AppiumServerConfig {
    const { env, ...safeConfig } = this.config;

    // Redact sensitive environment variables
    if (env) {
      const safeEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        if (key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('password')) {
          safeEnv[key] = '[REDACTED]';
        } else {
          safeEnv[key] = value;
        }
      }
      return { ...safeConfig, env: safeEnv };
    }

    return safeConfig;
  }
}
