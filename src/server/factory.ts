/**
 * Server factory function
 */

import type { ServerConfig, ServerDependencies } from './types.js';
import { ExpressServer } from './express-server.js';

/**
 * Create and configure a new Express server instance
 */
export function createServer(
  config: ServerConfig,
  dependencies: ServerDependencies
): ExpressServer {
  return new ExpressServer(config, dependencies);
}
