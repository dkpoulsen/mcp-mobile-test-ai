/**
 * Port allocation utilities for Appium servers
 */

import { createServer, Server } from 'node:net';
import { Logger } from '../../utils/logger.js';

/**
 * Default port range for auto-allocation
 */
const DEFAULT_PORT_RANGE = {
  min: 4723,
  max: 4900,
};

/**
 * Used ports tracking
 */
const usedPorts = new Set<number>();

/**
 * Find an available port within a range
 */
export async function findAvailablePort(options: {
  min?: number;
  max?: number;
  preferredPort?: number;
  logger?: Logger;
} = {}): Promise<number> {
  const { min = DEFAULT_PORT_RANGE.min, max = DEFAULT_PORT_RANGE.max, preferredPort, logger } = options;

  // If a preferred port is specified, try it first
  if (preferredPort) {
    if (preferredPort < min || preferredPort > max) {
      throw new Error(`Preferred port ${preferredPort} is outside valid range ${min}-${max}`);
    }

    const isAvailable = await isPortAvailable(preferredPort);
    if (isAvailable && !usedPorts.has(preferredPort)) {
      usedPorts.add(preferredPort);
      logger?.debug(`Using preferred port: ${preferredPort}`);
      return preferredPort;
    }

    logger?.info(`Preferred port ${preferredPort} is not available, finding alternative...`);
  }

  // Find an available port in the range
  for (let port = min; port <= max; port++) {
    if (!usedPorts.has(port) && (await isPortAvailable(port))) {
      usedPorts.add(port);
      logger?.debug(`Allocated port: ${port}`);
      return port;
    }
  }

  throw new Error(`No available ports in range ${min}-${max}`);
}

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Release a previously allocated port
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}

/**
 * Release all ports
 */
export function releaseAllPorts(): void {
  usedPorts.clear();
}

/**
 * Get the number of currently allocated ports
 */
export function getAllocatedPortCount(): number {
  return usedPorts.size;
}

/**
 * Check if a port is currently allocated
 */
export function isPortAllocated(port: number): boolean {
  return usedPorts.has(port);
}
