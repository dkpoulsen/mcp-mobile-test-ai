/**
 * Error types for Driver Session Management
 */

/**
 * Base error class for driver session errors
 */
export class DriverSessionError extends Error {
  constructor(
    message: string,
    public code: string,
    public sessionId?: string
  ) {
    super(message);
    this.name = 'DriverSessionError';
  }
}

/**
 * Error thrown when session creation fails
 */
export class SessionCreationError extends DriverSessionError {
  constructor(message: string, sessionId?: string, public cause?: Error) {
    super(message, 'SESSION_CREATION_ERROR', sessionId);
    this.name = 'SessionCreationError';
  }
}

/**
 * Error thrown when session termination fails
 */
export class SessionTerminationError extends DriverSessionError {
  constructor(message: string, sessionId?: string, public cause?: Error) {
    super(message, 'SESSION_TERMINATION_ERROR', sessionId);
    this.name = 'SessionTerminationError';
  }
}

/**
 * Error thrown when session connection is lost
 */
export class SessionConnectionError extends DriverSessionError {
  constructor(message: string, sessionId?: string, public cause?: Error) {
    super(message, 'SESSION_CONNECTION_ERROR', sessionId);
    this.name = 'SessionConnectionError';
  }
}

/**
 * Error thrown when session reconnection fails
 */
export class SessionReconnectError extends DriverSessionError {
  constructor(message: string, sessionId?: string, public cause?: Error) {
    super(message, 'SESSION_RECONNECT_ERROR', sessionId);
    this.name = 'SessionReconnectError';
  }
}

/**
 * Error thrown when session health check fails
 */
export class SessionHealthCheckError extends DriverSessionError {
  constructor(message: string, sessionId?: string, public cause?: Error) {
    super(message, 'SESSION_HEALTH_CHECK_ERROR', sessionId);
    this.name = 'SessionHealthCheckError';
  }
}

/**
 * Error thrown when session is not found
 */
export class SessionNotFoundError extends DriverSessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', sessionId);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when session operation is invalid for current state
 */
export class SessionStateError extends DriverSessionError {
  constructor(message: string, sessionId: string, public currentState: string) {
    super(message, 'SESSION_STATE_ERROR', sessionId);
    this.name = 'SessionStateError';
  }
}

/**
 * Error thrown when device is not available
 */
export class DeviceUnavailableError extends DriverSessionError {
  constructor(udid: string, sessionId?: string) {
    super(`Device unavailable: ${udid}`, 'DEVICE_UNAVAILABLE', sessionId);
    this.name = 'DeviceUnavailableError';
  }
}

/**
 * Error thrown when Appium server is not available
 */
export class ServerUnavailableError extends DriverSessionError {
  constructor(serverUrl: string, sessionId?: string) {
    super(`Appium server unavailable: ${serverUrl}`, 'SERVER_UNAVAILABLE', sessionId);
    this.name = 'ServerUnavailableError';
  }
}

/**
 * Error thrown when batch session creation fails
 */
export class BatchSessionError extends DriverSessionError {
  constructor(
    message: string,
    public results: Array<{ config: unknown; error: string }>,
    public successful: number
  ) {
    super(message, 'BATCH_SESSION_ERROR');
    this.name = 'BatchSessionError';
  }
}

/**
 * Error thrown when capabilities are invalid
 */
export class InvalidCapabilitiesError extends DriverSessionError {
  constructor(message: string, public capabilities: unknown) {
    super(message, 'INVALID_CAPABILITIES');
    this.name = 'InvalidCapabilitiesError';
  }
}
