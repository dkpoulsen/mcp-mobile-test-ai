/**
 * Appium Server Manager - manages multiple Appium server instances
 */

import { Logger, createModuleLogger } from '../../utils/logger.js';
import { AppiumServer } from './appium-server.js';
import type { AppiumServerConfig, AppiumServerInfo, AppiumServerStatus } from './types.js';
import { releaseAllPorts } from './port-allocator.js';

/**
 * Manager for multiple Appium server instances
 */
export class AppiumServerManager {
  private servers: Map<string, AppiumServer> = new Map();
  private logger: Logger;
  private isShuttingDown: boolean = false;

  constructor(logger?: Logger) {
    this.logger = logger?.child({ component: 'appium-manager' }) || createModuleLogger('appium-manager');
  }

  /**
   * Start a new Appium server
   */
  async startServer(config: AppiumServerConfig = {}): Promise<AppiumServerInfo> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start server while manager is shutting down');
    }

    const server = new AppiumServer(config, this.logger);
    const info = await server.start();

    this.servers.set(server.getId(), server);

    this.logger.info('Server started', {
      serverId: server.getId(),
      url: info.serverUrl,
    });

    return info;
  }

  /**
   * Stop a specific server by ID
   */
  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    await server.stop();
    this.servers.delete(serverId);

    this.logger.info('Server stopped', { serverId });
  }

  /**
   * Stop all running servers
   */
  async stopAll(): Promise<void> {
    this.logger.info('Stopping all servers', { count: this.servers.size });

    const stopPromises = Array.from(this.servers.values()).map((server) => server.stop());
    await Promise.allSettled(stopPromises);

    this.servers.clear();
    this.logger.info('All servers stopped');
  }

  /**
   * Get a server by ID
   */
  getServer(serverId: string): AppiumServer | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get info for a specific server
   */
  getServerInfo(serverId: string): AppiumServerInfo | undefined {
    const server = this.servers.get(serverId);
    return server?.getInfo();
  }

  /**
   * Get info for all servers
   */
  getAllServers(): AppiumServerInfo[] {
    return Array.from(this.servers.values()).map((server) => server.getInfo());
  }

  /**
   * Get servers filtered by status
   */
  getServersByStatus(status: AppiumServerStatus): AppiumServerInfo[] {
    return this.getAllServers().filter((info) => info.status === status);
  }

  /**
   * Get running servers only
   */
  getRunningServers(): AppiumServerInfo[] {
    return this.getServersByStatus('running');
  }

  /**
   * Get the count of servers
   */
  getServerCount(): number {
    return this.servers.size;
  }

  /**
   * Get the count of running servers
   */
  getRunningCount(): number {
    return this.getRunningServers().length;
  }

  /**
   * Restart a specific server
   */
  async restartServer(serverId: string): Promise<AppiumServerInfo> {
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    this.logger.info('Restarting server', { serverId });
    return server.restart();
  }

  /**
   * Health check for a specific server
   */
  async healthCheck(serverId: string) {
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    return server.healthCheck();
  }

  /**
   * Health check for all running servers
   */
  async healthCheckAll(): Promise<Map<string, Awaited<ReturnType<typeof AppiumServer.prototype.healthCheck>>>> {
    const results = new Map<string, Awaited<ReturnType<typeof AppiumServer.prototype.healthCheck>>>();

    const entries = Array.from(this.servers.entries());
    for (const [id, server] of entries) {
      try {
        const result = await server.healthCheck();
        results.set(id, result);
      } catch (error) {
        results.set(id, {
          healthy: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down Appium server manager');

    await this.stopAll();
    releaseAllPorts();

    this.logger.info('Appium server manager shutdown complete');
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down...`);
      await this.shutdown();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdownHandler('SIGINT'));
    process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
  }
}

/**
 * Default singleton instance
 */
let defaultManager: AppiumServerManager | null = null;

/**
 * Get the default manager instance
 */
export function getAppiumManager(logger?: Logger): AppiumServerManager {
  if (!defaultManager) {
    defaultManager = new AppiumServerManager(logger);
    defaultManager.setupSignalHandlers();
  }
  return defaultManager;
}

/**
 * Reset the default manager (useful for testing)
 */
export function resetAppiumManager(): void {
  if (defaultManager) {
    defaultManager.shutdown().catch(() => {
      // Ignore errors during reset
    });
    defaultManager = null;
  }
}
