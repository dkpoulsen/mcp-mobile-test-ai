/**
 * Network Capture Service
 *
 * Captures and validates HTTP network traffic during mobile tests.
 * Provides functionality to record, analyze, and validate network requests.
 */

/**
 * HTTP methods enum
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

/**
 * Network request entry
 */
export interface NetworkRequest {
  /**
   * Unique identifier for the request
   */
  id: string;

  /**
   * HTTP method
   */
  method: HttpMethod;

  /**
   * Request URL
   */
  url: string;

  /**
   * Request headers
   */
  headers: Record<string, string>;

  /**
   * Request body (if present)
   */
  body?: unknown;

  /**
   * Timestamp when request was initiated
   */
  timestamp: Date;

  /**
   * Response received (if completed)
   */
  response?: NetworkResponse;

  /**
   * Error that occurred (if failed)
   */
  error?: string;

  /**
   * Request duration in milliseconds
   */
  duration?: number;
}

/**
 * Network response entry
 */
export interface NetworkResponse {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Status text
   */
  statusText: string;

  /**
   * Response headers
   */
  headers: Record<string, string>;

  /**
   * Response body
   */
  body?: unknown;

  /**
   * Timestamp when response was received
   */
  timestamp: Date;
}

/**
 * Network traffic capture options
 */
export interface NetworkCaptureOptions {
  /**
   * Maximum number of requests to capture
   */
  maxRequests?: number;

  /**
   * Whether to capture request bodies
   */
  captureBodies?: boolean;

  /**
   * Whether to capture response bodies
   */
  captureResponseBodies?: boolean;

  /**
   * Filter URLs by pattern
   */
  urlFilter?: RegExp | string;

  /**
   * Filter by HTTP methods
   */
  methodFilter?: HttpMethod[];
}

/**
 * Network validation rule
 */
export interface NetworkValidationRule {
  /**
   * Rule name/identifier
   */
  name: string;

  /**
   * URL pattern to match
   */
  urlPattern: RegExp | string;

  /**
   * Expected HTTP method
   */
  method?: HttpMethod;

  /**
   * Expected status code
   */
  expectedStatus?: number;

  /**
   * Validator function for custom validation
   */
  validator?: (request: NetworkRequest) => boolean;

  /**
   * Custom error message
   */
  errorMessage?: string;
}

/**
 * Network validation result
 */
export interface NetworkValidationResult {
  /**
   * Whether validation passed
   */
  passed: boolean;

  /**
   * Number of rules checked
   */
  totalRules: number;

  /**
   * Number of rules that passed
   */
  passedRules: number;

  /**
   * Failed validations
   */
  failures: NetworkValidationFailure[];

  /**
   * All captured requests
   */
  capturedRequests: NetworkRequest[];
}

/**
 * Network validation failure
 */
export interface NetworkValidationFailure {
  /**
   * Rule name that failed
   */
  rule: string;

  /**
   * Error message
   */
  error: string;

  /**
   * Request that caused the failure (if applicable)
   */
  request?: NetworkRequest;
}

/**
 * Request filter options
 */
export interface RequestFilter {
  /**
   * Filter by method
   */
  method?: HttpMethod | HttpMethod[];

  /**
   * Filter by URL pattern
   */
  urlPattern?: RegExp | string;

  /**
   * Filter by status code
   */
  statusCode?: number | number[];

  /**
   * Filter by success status
   */
  successful?: boolean;

  /**
   * Minimum duration
   */
  minDuration?: number;

  /**
   * Maximum duration
   */
  maxDuration?: number;
}

/**
 * Network capture statistics
 */
export interface NetworkStatistics {
  /**
   * Total number of requests captured
   */
  totalRequests: number;

  /**
   * Number of successful requests
   */
  successfulRequests: number;

  /**
   * Number of failed requests
   */
  failedRequests: number;

  /**
   * Average request duration
   */
  averageDuration: number;

  /**
   * Minimum request duration
   */
  minDuration: number;

  /**
   * Maximum request duration
   */
  maxDuration: number;

  /**
   * Requests by method
   */
  requestsByMethod: Partial<Record<HttpMethod, number>>;

  /**
   * Requests by status code
   */
  requestsByStatus: Partial<Record<number, number>>;
}

/**
 * Network Capture Service class
 */
export class NetworkCapture {
  private requests: Map<string, NetworkRequest> = new Map();
  private options: Required<NetworkCaptureOptions>;
  private requestCounter = 0;

  constructor(options: NetworkCaptureOptions = {}) {
    this.options = {
      maxRequests: options.maxRequests ?? 1000,
      captureBodies: options.captureBodies ?? true,
      captureResponseBodies: options.captureResponseBodies ?? true,
      urlFilter: options.urlFilter ? this.patternToRegex(options.urlFilter) : undefined,
      methodFilter: options.methodFilter,
    };
  }

  /**
   * Start capturing network traffic
   */
  start(): void {
    this.requests.clear();
    this.requestCounter = 0;
  }

  /**
   * Stop capturing network traffic
   */
  stop(): void {
    // Capture is stopped - no more requests will be recorded
  }

  /**
   * Record a network request
   */
  recordRequest(request: Omit<NetworkRequest, 'id' | 'timestamp'>): string {
    // Check if we should filter this request
    if (!this.shouldCaptureRequest(request)) {
      return '';
    }

    // Check max limit
    if (this.requests.size >= this.options.maxRequests) {
      return '';
    }

    const id = `req-${++this.requestCounter}`;
    const networkRequest: NetworkRequest = {
      id,
      timestamp: new Date(),
      ...request,
    };

    this.requests.set(id, networkRequest);
    return id;
  }

  /**
   * Record a response for a request
   */
  recordResponse(requestId: string, response: NetworkResponse): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.response = response;
      request.duration = response.timestamp.getTime() - request.timestamp.getTime();
    }
  }

  /**
   * Record an error for a request
   */
  recordError(requestId: string, error: string): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.error = error;
      request.duration = Date.now() - request.timestamp.getTime();
    }
  }

  /**
   * Get all captured requests
   */
  getAllRequests(): NetworkRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Get a request by ID
   */
  getRequest(id: string): NetworkRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Find requests matching a filter
   */
  findRequests(filter: RequestFilter): NetworkRequest[] {
    return this.getAllRequests().filter((req) => this.matchesFilter(req, filter));
  }

  /**
   * Find a request by URL pattern
   */
  findByUrl(pattern: RegExp | string): NetworkRequest[] {
    const regex = this.patternToRegex(pattern);
    return this.getAllRequests().filter((req) => regex.test(req.url));
  }

  /**
   * Find a request by method and URL pattern
   */
  findByMethodAndUrl(method: HttpMethod, pattern: RegExp | string): NetworkRequest[] {
    const regex = this.patternToRegex(pattern);
    return this.getAllRequests().filter(
      (req) => req.method === method && regex.test(req.url)
    );
  }

  /**
   * Get network statistics
   */
  getStatistics(): NetworkStatistics {
    const allRequests = this.getAllRequests();
    const successfulRequests = allRequests.filter((r) => r.response && r.response.status < 400);
    const failedRequests = allRequests.filter((r) => !r.response || r.response.status >= 400);

    const durations = allRequests
      .map((r) => r.duration)
      .filter((d): d is number => d !== undefined);

    const requestsByMethod: Partial<Record<HttpMethod, number>> = {};
    const requestsByStatus: Partial<Record<number, number>> = {};

    for (const req of allRequests) {
      if (requestsByMethod[req.method] === undefined) {
        requestsByMethod[req.method] = 0;
      }
      requestsByMethod[req.method]++;

      if (req.response) {
        const status = req.response.status;
        if (requestsByStatus[status] === undefined) {
          requestsByStatus[status] = 0;
        }
        requestsByStatus[status]++;
      }
    }

    return {
      totalRequests: allRequests.length,
      successfulRequests: successfulRequests.length,
      failedRequests: failedRequests.length,
      averageDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      requestsByMethod,
      requestsByStatus,
    };
  }

  /**
   * Validate captured requests against rules
   */
  validate(rules: NetworkValidationRule[]): NetworkValidationResult {
    const failures: NetworkValidationFailure[] = [];
    let passedRules = 0;

    for (const rule of rules) {
      const urlRegex = this.patternToRegex(rule.urlPattern);
      const matchingRequests = this.getAllRequests().filter((req) => {
        if (!urlRegex.test(req.url)) return false;
        if (rule.method && req.method !== rule.method) return false;
        return true;
      });

      let rulePassed = false;

      if (rule.validator) {
        // Use custom validator
        for (const req of matchingRequests) {
          if (rule.validator!(req)) {
            rulePassed = true;
            break;
          }
        }
        if (!rulePassed && matchingRequests.length === 0) {
          failures.push({
            rule: rule.name,
            error: rule.errorMessage || `No matching request found for ${rule.urlPattern}`,
          });
        }
      } else if (rule.expectedStatus !== undefined) {
        // Validate expected status
        const matchingStatus = matchingRequests.find(
          (req) => req.response && req.response.status === rule.expectedStatus
        );
        if (matchingStatus) {
          rulePassed = true;
        } else {
          failures.push({
            rule: rule.name,
            error: rule.errorMessage ||
              `Expected status ${rule.expectedStatus} not found for ${rule.urlPattern}`,
            request: matchingRequests[0],
          });
        }
      } else {
        // Just check if request was made
        rulePassed = matchingRequests.length > 0;
        if (!rulePassed) {
          failures.push({
            rule: rule.name,
            error: rule.errorMessage || `No request found matching ${rule.urlPattern}`,
          });
        }
      }

      if (rulePassed) {
        passedRules++;
      }
    }

    return {
      passed: failures.length === 0,
      totalRules: rules.length,
      passedRules,
      failures,
      capturedRequests: this.getAllRequests(),
    };
  }

  /**
   * Clear all captured requests
   */
  clear(): void {
    this.requests.clear();
    this.requestCounter = 0;
  }

  /**
   * Export captured requests as JSON
   */
  exportJson(): string {
    return JSON.stringify(this.getAllRequests(), null, 2);
  }

  /**
   * Export captured requests as HAR (HTTP Archive) format
   */
  exportHar(): string {
    const har = {
      log: {
        version: '1.2',
        creator: { name: 'MCP Mobile Test AI Network Capture', version: '1.0.0' },
        entries: this.getAllRequests().map((req) => ({
          startedDateTime: req.timestamp.toISOString(),
          request: {
            method: req.method,
            url: req.url,
            headers: Object.entries(req.headers).map(([name, value]) => ({ name, value })),
            postData: req.body ? { text: JSON.stringify(req.body) } : undefined,
          },
          response: req.response ? {
            status: req.response.status,
            statusText: req.response.statusText,
            headers: Object.entries(req.response.headers).map(([name, value]) => ({ name, value })),
            content: req.response.body ? { size: JSON.stringify(req.response.body).length } : undefined,
          } : undefined,
          time: req.duration ?? 0,
        })),
      },
    };
    return JSON.stringify(har, null, 2);
  }

  /**
   * Get the number of captured requests
   */
  getCount(): number {
    return this.requests.size;
  }

  /**
   * Check if a request should be captured based on filters
   */
  private shouldCaptureRequest(request: Omit<NetworkRequest, 'id' | 'timestamp'>): boolean {
    // Check URL filter
    if (this.options.urlFilter) {
      const regex = this.options.urlFilter instanceof RegExp
        ? this.options.urlFilter
        : new RegExp(this.options.urlFilter);
      if (!regex.test(request.url)) {
        return false;
      }
    }

    // Check method filter
    if (this.options.methodFilter && this.options.methodFilter.length > 0) {
      if (!this.options.methodFilter.includes(request.method)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a request matches a filter
   */
  private matchesFilter(request: NetworkRequest, filter: RequestFilter): boolean {
    // Method filter
    if (filter.method) {
      const methods = Array.isArray(filter.method) ? filter.method : [filter.method];
      if (!methods.includes(request.method)) {
        return false;
      }
    }

    // URL pattern filter
    if (filter.urlPattern) {
      const regex = this.patternToRegex(filter.urlPattern);
      if (!regex.test(request.url)) {
        return false;
      }
    }

    // Status code filter
    if (filter.statusCode !== undefined) {
      const codes = Array.isArray(filter.statusCode) ? filter.statusCode : [filter.statusCode];
      if (!request.response || !codes.includes(request.response.status)) {
        return false;
      }
    }

    // Success filter
    if (filter.successful !== undefined) {
      const isSuccessful = request.response && request.response.status < 400;
      if (filter.successful !== isSuccessful) {
        return false;
      }
    }

    // Duration filters
    if (filter.minDuration !== undefined && (request.duration === undefined || request.duration < filter.minDuration)) {
      return false;
    }
    if (filter.maxDuration !== undefined && (request.duration === undefined || request.duration > filter.maxDuration)) {
      return false;
    }

    return true;
  }

  /**
   * Convert a pattern string or RegExp to RegExp
   */
  private patternToRegex(pattern: RegExp | string): RegExp {
    return pattern instanceof RegExp ? pattern : new RegExp(pattern);
  }
}

/**
 * Create a new network capture instance
 */
export function createNetworkCapture(options?: NetworkCaptureOptions): NetworkCapture {
  return new NetworkCapture(options);
}

/**
 * Default export
 */
export default NetworkCapture;
