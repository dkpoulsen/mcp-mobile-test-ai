/**
 * Driver Session - Manages a single WebDriverIO/Appium session lifecycle
 */

import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '../../utils/logger.js';
import {
  type DriverSessionConfig,
  type DriverSessionInfo,
  type DriverSessionStatus,
  type SessionHealthCheckResult,
  type SessionEvent,
  type SessionEventListener,
  type SessionEventType,
} from './types.js';
import {
  SessionCreationError,
  SessionTerminationError,
  SessionReconnectError,
  SessionStateError,
} from './errors.js';

/**
 * Remote session response from Appium server
 */
interface RemoteSessionResponse {
  sessionId: string;
  capabilities: Record<string, unknown>;
}

/**
 * Driver Session class - manages a single WebDriverIO/Appium session
 */
export class DriverSession {
  private info: DriverSessionInfo;
  private logger: Logger;
  private eventListeners: Set<SessionEventListener> = new Set();
  private abortController: AbortController | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: DriverSessionConfig, logger: Logger) {
    const sessionId = config.sessionId || randomUUID();
    const now = new Date();

    this.logger = logger.child({ sessionId });
    this.info = {
      id: sessionId,
      status: 'idle',
      serverUrl: config.serverUrl,
      capabilities: config.capabilities,
      tags: config.tags || [],
      metadata: config.metadata || {},
      createdAt: now,
      lastActivityAt: now,
      reconnectAttempts: 0,
      config,
    };
  }

  /**
   * Get the session ID
   */
  getId(): string {
    return this.info.id;
  }

  /**
   * Get the current session status
   */
  getStatus(): DriverSessionStatus {
    return this.info.status;
  }

  /**
   * Get session info
   */
  getInfo(): Readonly<DriverSessionInfo> {
    return { ...this.info };
  }

  /**
   * Get the remote session ID (from Appium server)
   */
  getRemoteSessionId(): string | undefined {
    return this.info.remoteSessionId;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.info.status === 'active';
  }

  /**
   * Check if session can be started
   */
  canStart(): boolean {
    return this.info.status === 'idle' || this.info.status === 'stopped' || this.info.status === 'error';
  }

  /**
   * Check if session can be stopped
   */
  canStop(): boolean {
    return this.info.status === 'starting' || this.info.status === 'active' || this.info.status === 'error';
  }

  /**
   * Update the last activity timestamp
   */
  private updateActivity(): void {
    this.info.lastActivityAt = new Date();
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(type: SessionEventType, data?: SessionEvent['data']): void {
    const event: SessionEvent = {
      type,
      sessionId: this.info.id,
      timestamp: new Date(),
      data,
    };

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error('Event listener error', { error, eventType: type });
      }
    }
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: SessionEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Remove all event listeners
   */
  removeAllEventListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Create a session on the Appium server
   */
  async start(): Promise<DriverSessionInfo> {
    if (!this.canStart()) {
      throw new SessionStateError(
        `Cannot start session in current state: ${this.info.status}`,
        this.info.id,
        this.info.status
      );
    }

    this.updateStatus('starting');
    this.emitEvent('creating');

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      const sessionTimeout = this.info.config.sessionTimeout || 60000;
      const startTime = Date.now();

      this.logger.info('Starting driver session', {
        serverUrl: this.info.serverUrl,
        platform: this.info.capabilities.platformName,
        udid: this.info.capabilities.udid,
      });

      // Build session creation request
      const sessionUrl = this.buildSessionUrl();
      const body = JSON.stringify({
        capabilities: {
          firstMatch: [this.info.capabilities],
          alwaysMatch: {},
        },
      });

      // Create the session with timeout
      const response = await this.withTimeout(
        fetch(sessionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal,
        }),
        sessionTimeout
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new SessionCreationError(
          `Failed to create session: ${response.status} ${response.statusText} - ${errorText}`,
          this.info.id
        );
      }

      const data = (await response.json()) as RemoteSessionResponse;
      this.info.remoteSessionId = data.sessionId;
      this.info.actualCapabilities = data.capabilities;

      const duration = Date.now() - startTime;
      this.logger.info('Driver session created', {
        remoteSessionId: this.info.remoteSessionId,
        duration,
      });

      this.updateStatus('active');
      this.updateActivity();
      this.emitEvent('created');

      // Start periodic health checks if auto-reconnect is enabled
      if (this.info.config.autoReconnect) {
        this.startHealthCheckMonitoring();
      }

      return this.getInfo();
    } catch (error) {
      if (error instanceof SessionCreationError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus('error', message);
      this.emitEvent('error', { error: error instanceof Error ? error : new Error(message) });
      throw new SessionCreationError(
        `Failed to create session: ${message}`,
        this.info.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Stop the session
   */
  async stop(): Promise<void> {
    if (!this.canStop()) {
      throw new SessionStateError(
        `Cannot stop session in current state: ${this.info.status}`,
        this.info.id,
        this.info.status
      );
    }

    this.updateStatus('stopping');
    this.emitEvent('stopping');

    // Stop health check monitoring
    this.stopHealthCheckMonitoring();

    // Abort any pending requests
    this.abortController?.abort();
    this.abortController = null;

    try {
      if (this.info.remoteSessionId) {
        const sessionUrl = this.buildSessionUrl(this.info.remoteSessionId);

        this.logger.info('Deleting driver session', {
          remoteSessionId: this.info.remoteSessionId,
        });

        const response = await fetch(sessionUrl, {
          method: 'DELETE',
        });

        if (!response.ok && response.status !== 404) {
          // 404 is acceptable - session might already be gone
          this.logger.warn('Failed to delete session cleanly', {
            status: response.status,
            statusText: response.statusText,
          });
        }
      }

      this.updateStatus('stopped');
      this.info.remoteSessionId = undefined;
      this.info.actualCapabilities = undefined;
      this.info.reconnectAttempts = 0;
      this.updateActivity();
      this.emitEvent('stopped');

      this.logger.info('Driver session stopped');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus('error', message);
      this.emitEvent('error', { error: error instanceof Error ? error : new Error(message) });
      throw new SessionTerminationError(
        `Failed to stop session: ${message}`,
        this.info.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Perform a health check on the session
   */
  async healthCheck(): Promise<SessionHealthCheckResult> {
    const startTime = Date.now();

    if (this.info.status !== 'active') {
      return {
        healthy: false,
        sessionId: this.info.id,
        error: `Session is not active (status: ${this.info.status})`,
        details: { remoteSessionExists: false, deviceConnected: false },
      };
    }

    if (!this.info.remoteSessionId) {
      return {
        healthy: false,
        sessionId: this.info.id,
        error: 'No remote session ID',
        details: { remoteSessionExists: false, deviceConnected: false },
      };
    }

    try {
      const sessionUrl = this.buildSessionUrl(this.info.remoteSessionId);

      const response = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 404) {
        // Session no longer exists on server
        this.logger.warn('Remote session not found', {
          remoteSessionId: this.info.remoteSessionId,
        });

        return {
          healthy: false,
          sessionId: this.info.id,
          responseTime,
          error: 'Remote session not found on server',
          details: { remoteSessionExists: false, deviceConnected: false },
        };
      }

      if (!response.ok) {
        return {
          healthy: false,
          sessionId: this.info.id,
          responseTime,
          error: `Health check failed: ${response.status} ${response.statusText}`,
          details: { remoteSessionExists: true, deviceConnected: false },
        };
      }

      // Session is healthy
      this.updateActivity();
      this.emitEvent('health-check', {
        healthResult: {
          healthy: true,
          sessionId: this.info.id,
          responseTime,
        },
      });

      return {
        healthy: true,
        sessionId: this.info.id,
        responseTime,
        details: { remoteSessionExists: true, deviceConnected: true },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Health check error', { error: message });

      return {
        healthy: false,
        sessionId: this.info.id,
        responseTime: Date.now() - startTime,
        error: message,
        details: { remoteSessionExists: false, deviceConnected: false },
      };
    }
  }

  /**
   * Attempt to reconnect the session
   */
  async reconnect(): Promise<DriverSessionInfo> {
    if (this.info.status === 'starting' || this.info.status === 'stopping') {
      throw new SessionStateError(
        `Cannot reconnect session while ${this.info.status}`,
        this.info.id,
        this.info.status
      );
    }

    const maxAttempts = this.info.config.maxReconnectAttempts || 3;
    if (this.info.reconnectAttempts >= maxAttempts) {
      throw new SessionReconnectError(
        `Max reconnection attempts (${maxAttempts}) reached`,
        this.info.id
      );
    }

    this.emitEvent('reconnecting');

    // Clean up existing session if any
    if (this.info.remoteSessionId) {
      try {
        await this.stop();
      } catch {
        // Ignore errors during stop, we're trying to reconnect anyway
      }
    }

    this.info.reconnectAttempts++;
    this.logger.info('Attempting to reconnect session', {
      attempt: this.info.reconnectAttempts,
      maxAttempts,
    });

    try {
      const info = await this.start();
      this.info.reconnectAttempts = 0;
      this.emitEvent('reconnected');
      return info;
    } catch (error) {
      throw new SessionReconnectError(
        `Reconnection failed: ${error instanceof Error ? error.message : String(error)}`,
        this.info.id,
        error as Error
      );
    }
  }

  /**
   * Start periodic health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    this.stopHealthCheckMonitoring();

    const interval = 30000; // 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      if (this.info.status !== 'active') {
        return;
      }

      const result = await this.healthCheck();

      if (!result.healthy && this.info.config.autoReconnect) {
        this.logger.warn('Health check failed, attempting reconnection', {
          error: result.error,
        });

        try {
          await this.reconnect();
        } catch (error) {
          this.logger.error('Reconnection failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          this.updateStatus('error', result.error || 'Reconnection failed');
          this.emitEvent('error', {
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }, interval);
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Build the session URL
   */
  private buildSessionUrl(remoteSessionId?: string): string {
    const baseUrl = this.info.serverUrl.replace(/\/$/, '');
    const basePath = this.info.config.basePath || '/wd/hub';
    const path = remoteSessionId
      ? `${basePath}/session/${remoteSessionId}`
      : `${basePath}/session`;

    return `${baseUrl}${path}`;
  }

  /**
   * Update session status
   */
  private updateStatus(status: DriverSessionStatus, error?: string): void {
    const previous = this.info.status;
    this.info.status = status;
    if (error) {
      this.info.error = error;
    } else if (status !== 'error') {
      this.info.error = undefined;
    }
    this.emitEvent('starting', { previousStatus: previous, newStatus: status });
  }

  /**
   * Wrap a promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeout = sleep(timeoutMs).then(() => {
      throw new Error(`Operation timed out after ${timeoutMs}ms`);
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopHealthCheckMonitoring();
    this.removeAllEventListeners();
    this.abortController?.abort();
    this.abortController = null;
  }
}
