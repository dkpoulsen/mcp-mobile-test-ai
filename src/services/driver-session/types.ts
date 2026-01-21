/**
 * Type definitions for WebDriverIO/Appium Driver Session Management
 */

/**
 * Driver session status
 */
export type DriverSessionStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'stopped' | 'error';

/**
 * Platform type for driver sessions
 */
export type DriverPlatform = 'android' | 'ios';

/**
 * Automation name for Appium/WebDriverIO
 */
export type AutomationName = 'UiAutomator2' | 'XCUITest' | 'Espresso' | 'Appium';

/**
 * Base capabilities for driver session creation
 */
export interface BaseDriverCapabilities {
  /**
   * Platform name
   */
  platformName: DriverPlatform;

  /**
   * Automation name to use
   */
  automationName?: AutomationName;

  /**
   * App package (Android) or bundle ID (iOS)
   */
  app?: string;

  /**
   * App activity (Android)
   */
  appActivity?: string;

  /**
   * App package (Android)
   */
  appPackage?: string;

  /**
   * Bundle ID (iOS)
   */
  bundleId?: string;

  /**
   * Device UDID
   */
  udid?: string;

  /**
   * Device name
   */
  deviceName?: string;

  /**
   * Platform version
   */
  platformVersion?: string;

  /**
   * Locale for the device
   */
  locale?: string;

  /**
   * Language for the device
   */
  language?: string;

  /**
   * New command timeout in seconds
   */
  newCommandTimeout?: number;

  /**
   * Whether this is an automation session
   */
  autoWebview?: boolean;

  /**
   * Whether to skip device capabilities check
   */
  skipServerCaps?: boolean;

  /**
   * No reset app state between sessions
   */
  noReset?: boolean;

  /**
   * Full reset app state between sessions
   */
  fullReset?: boolean;

  /**
   * Custom capabilities
   */
  [key: string]: unknown;
}

/**
 * Session configuration options
 */
export interface DriverSessionConfig {
  /**
   * Appium server URL to connect to
   */
  serverUrl: string;

  /**
   * Base path for the Appium server
   * @default '/wd/hub'
   */
  basePath?: string;

  /**
   * Capabilities for the session
   */
  capabilities: BaseDriverCapabilities;

  /**
   * Session timeout in milliseconds
   * @default 60000
   */
  sessionTimeout?: number;

  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Whether to automatically reconnect on connection loss
   * @default false
   */
  autoReconnect?: boolean;

  /**
   * Maximum reconnection attempts
   * @default 3
   */
  maxReconnectAttempts?: number;

  /**
   * Delay between reconnection attempts in milliseconds
   * @default 5000
   */
  reconnectDelay?: number;

  /**
   * Custom session ID (auto-generated if not provided)
   */
  sessionId?: string;

  /**
   * Tags for session identification and grouping
   */
  tags?: string[];

  /**
   * Metadata for the session
   */
  metadata?: Record<string, unknown>;
}

/**
 * Driver session information
 */
export interface DriverSessionInfo {
  /**
   * Unique session identifier
   */
  id: string;

  /**
   * Current session status
   */
  status: DriverSessionStatus;

  /**
   * Appium server URL
   */
  serverUrl: string;

  /**
   * WebDriverIO/Appium session ID (returned from server)
   */
  remoteSessionId?: string;

  /**
   * Capabilities used to create the session
   */
  capabilities: BaseDriverCapabilities;

  /**
   * Actual capabilities returned by the server
   */
  actualCapabilities?: Record<string, unknown>;

  /**
   * Tags for session identification
   */
  tags: string[];

  /**
   * Metadata for the session
   */
  metadata: Record<string, unknown>;

  /**
   * When the session was created
   */
  createdAt: Date;

  /**
   * Last activity timestamp
   */
  lastActivityAt: Date;

  /**
   * Session error if in error state
   */
  error?: string;

  /**
   * Number of reconnection attempts
   */
  reconnectAttempts: number;

  /**
   * Configuration used to create the session
   */
  config: DriverSessionConfig;
}

/**
 * Health check result for a session
 */
export interface SessionHealthCheckResult {
  /**
   * Whether the session is healthy
   */
  healthy: boolean;

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Response time in milliseconds
   */
  responseTime?: number;

  /**
   * Error message if health check failed
   */
  error?: string;

  /**
   * Additional health information
   */
  details?: {
    /**
     * Whether the remote session still exists
     */
    remoteSessionExists?: boolean;

    /**
     * Device connection status
     */
    deviceConnected?: boolean;
  };
}

/**
 * Session statistics
 */
export interface SessionStatistics {
  /**
   * Total sessions created
   */
  totalCreated: number;

  /**
   * Total sessions destroyed
   */
  totalDestroyed: number;

  /**
   * Currently active sessions
   */
  activeSessions: number;

  /**
   * Sessions in error state
   */
  errorSessions: number;

  /**
   * Total reconnection attempts
   */
  totalReconnectAttempts: number;

  /**
   * Successful reconnections
   */
  successfulReconnections: number;

  /**
   * Average session lifetime in milliseconds
   */
  averageSessionLifetime: number;
}

/**
 * Filter options for listing sessions
 */
export interface SessionFilterOptions {
  /**
   * Filter by status
   */
  status?: DriverSessionStatus;

  /**
   * Filter by platform
   */
  platform?: DriverPlatform;

  /**
   * Filter by tags (sessions must have all specified tags)
   */
  tags?: string[];

  /**
   * Filter by server URL
   */
  serverUrl?: string;

  /**
   * Filter by device UDID
   */
  udid?: string;
}

/**
 * Batch session creation options
 */
export interface BatchSessionOptions {
  /**
   * Number of sessions to create in parallel
   * @default 3
   */
  parallelism?: number;

  /**
   * Whether to continue on error
   * @default true
   */
  continueOnError?: boolean;

  /**
   * Delay between batch creation attempts in milliseconds
   * @default 1000
   */
  batchDelay?: number;
}

/**
 * Batch session creation result
 */
export interface BatchSessionResult {
  /**
   * Successfully created sessions
   */
  successful: DriverSessionInfo[];

  /**
   * Failed session creation attempts
   */
  failed: Array<{
    config: DriverSessionConfig;
    error: string;
  }>;

  /**
   * Total number of sessions attempted
   */
  total: number;
}

/**
 * Event types for session lifecycle events
 */
export type SessionEventType =
  | 'creating'
  | 'created'
  | 'starting'
  | 'started'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'reconnecting'
  | 'reconnected'
  | 'health-check';

/**
 * Session event payload
 */
export interface SessionEvent {
  /**
   * Event type
   */
  type: SessionEventType;

  /**
   * Session ID
   */
  sessionId: string;

  /**
   * Timestamp of the event
   */
  timestamp: Date;

  /**
   * Event data
   */
  data?: {
    error?: Error;
    previousStatus?: DriverSessionStatus;
    newStatus?: DriverSessionStatus;
    healthResult?: SessionHealthCheckResult;
    [key: string]: unknown;
  };
}

/**
 * Session event listener
 */
export type SessionEventListener = (event: SessionEvent) => void;
