/**
 * API Server Module
 *
 * Exports the main ExpressServer class and related types.
 */

export { ExpressServer } from './express-server.js';
export { createServer } from './factory.js';
export type {
  ServerConfig,
  ServerErrorHandler,
  NotFoundHandler,
} from './types.js';
export * from './middleware/index.js';
