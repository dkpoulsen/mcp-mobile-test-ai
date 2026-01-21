/**
 * MCP Client for connecting to MCP servers
 *
 * This client provides a high-level interface for interacting with Model Context Protocol servers.
 * It handles connection management, reconnection logic, and provides methods for listing and calling tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool, ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { createModuleLogger } from '../utils/logger.js';

/**
 * Connection state of the MCP client
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Options for configuring the MCP client
 */
export interface McpClientOptions {
  /**
   * Server name for identification
   */
  name: string;

  /**
   * Command to start the server
   */
  command: string;

  /**
   * Arguments for the command
   */
  args?: string[];

  /**
   * Environment variables to pass to the server process
   */
  env?: Record<string, string>;

  /**
   * Working directory for the server process
   */
  cwd?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  requestTimeout?: number;

  /**
   * Maximum number of reconnection attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Delay between reconnection attempts in milliseconds
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Enable automatic reconnection on connection loss
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Optional logger instance
   */
  logger?: Logger;
}

/**
 * Result of calling a tool
 */
export interface McpToolResult {
  /**
   * Content returned by the tool
   */
  content: Array<{
    type: 'text' | 'image' | 'resource' | 'audio';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: {
      uri: string;
      text?: string;
      blob?: string;
      mimeType?: string;
    };
  }>;

  /**
   * Whether the result is an error
   */
  isError?: boolean;

  /**
   * Structured content if the tool returned structured output
   */
  structuredContent?: Record<string, unknown>;

  /**
   * Raw metadata from the response
   */
  _meta?: Record<string, unknown>;
}

/**
 * Simplified tool representation
 */
export interface McpTool {
  /**
   * Tool name
   */
  name: string;

  /**
   * Tool description
   */
  description?: string;

  /**
   * JSON Schema for tool input
   */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };

  /**
   * JSON Schema for tool output (if specified)
   */
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };

  /**
   * Tool annotations
   */
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };

  /**
   * Execution hints for the tool
   */
  execution?: {
    taskSupport?: 'optional' | 'required' | 'forbidden';
  };
}

/**
 * Resource provided by the MCP server
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Prompt provided by the MCP server
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Error thrown when MCP operations fail
 */
export class McpClientError extends Error {
  constructor(
    message: string,
    public code?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

/**
 * MCP Client implementation
 *
 * This class provides a high-level interface for interacting with MCP servers.
 * It uses the official MCP SDK under the hood and adds connection management,
 * reconnection logic, and simplified APIs.
 *
 * @example
 * ```typescript
 * const client = new McpClient({
 *   name: 'filesystem',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/files']
 * });
 *
 * await client.connect();
 * const tools = await client.listTools();
 * const result = await client.callTool('read_file', { path: '/tmp/test.txt' });
 * await client.disconnect();
 * ```
 */
export class McpClient {
  private readonly options: Required<Pick<McpClientOptions, 'requestTimeout' | 'maxRetries' | 'retryDelay' | 'autoReconnect'>> & Omit<McpClientOptions, 'requestTimeout' | 'maxRetries' | 'retryDelay' | 'autoReconnect'>;
  private readonly logger: Logger;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(options: McpClientOptions) {
    this.options = {
      ...options,
      requestTimeout: options.requestTimeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      autoReconnect: options.autoReconnect ?? true,
    };
    this.logger = options.logger ?? createModuleLogger('mcp');
  }

  /**
   * Connect to the MCP server
   *
   * Spawns the server process and establishes communication.
   * Will attempt reconnection if enabled and the initial connection fails.
   *
   * @throws {McpClientError} if connection fails after all retry attempts
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      this.logger.warn('Already connected to MCP server');
      return;
    }

    if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.RECONNECTING) {
      this.logger.debug('Connection already in progress');
      return;
    }

    this.setConnectionState(ConnectionState.CONNECTING);
    this.reconnectAttempts = 0;

    try {
      await this.connectWithRetry();
    } catch (error) {
      this.setConnectionState(ConnectionState.FAILED);
      throw error;
    }
  }

  /**
   * Internal method to handle connection with retry logic
   */
  private async connectWithRetry(): Promise<void> {
    while (this.reconnectAttempts < this.options.maxRetries) {
      try {
        this.clearReconnectTimer();

        this.logger.info(
          `Connecting to MCP server "${this.options.name}" (attempt ${this.reconnectAttempts + 1}/${this.options.maxRetries})`,
          {
            command: this.options.command,
            args: this.options.args,
          }
        );

        // Create the MCP client
        this.client = new Client(
          {
            name: `mcp-mobile-test-ai-${this.options.name}`,
            version: '0.1.0',
          },
          {
            capabilities: {},
          }
        );

        // Create the stdio transport
        this.transport = new StdioClientTransport({
          command: this.options.command,
          args: this.options.args,
          env: this.options.env,
          cwd: this.options.cwd,
          stderr: 'inherit',
        });

        // Set up transport event handlers
        this.transport.onclose = () => this.handleTransportClose();
        this.transport.onerror = (error) => this.handleTransportError(error);

        // Connect the client to the transport
        await this.client.connect(this.transport, {
          timeout: this.options.requestTimeout,
        });

        this.setConnectionState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;

        const serverInfo = this.client.getServerVersion();
        this.logger.info('Successfully connected to MCP server', {
          name: this.options.name,
          serverName: serverInfo?.name,
          serverVersion: serverInfo?.version,
        });

        return;
      } catch (error) {
        this.reconnectAttempts++;
        const isLastAttempt = this.reconnectAttempts >= this.options.maxRetries;

        this.logger.error(
          `Failed to connect to MCP server${isLastAttempt ? '' : ` (will retry in ${this.options.retryDelay}ms)`}`,
          error instanceof Error ? error : new Error(String(error))
        );

        if (isLastAttempt) {
          throw new McpClientError(
            `Failed to connect to MCP server "${this.options.name}" after ${this.options.maxRetries} attempts`,
            'CONNECTION_FAILED',
            error instanceof Error ? error : new Error(String(error))
          );
        }

        // Wait before retrying
        await this.delay(this.options.retryDelay);
      }
    }
  }

  /**
   * Handle transport close event
   */
  private handleTransportClose(): void {
    this.logger.warn('MCP server transport closed');

    if (this.connectionState === ConnectionState.CONNECTED && this.options.autoReconnect) {
      this.setConnectionState(ConnectionState.RECONNECTING);
      this.scheduleReconnect();
    } else {
      this.setConnectionState(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * Handle transport error event
   */
  private handleTransportError(error: Error): void {
    this.logger.error('MCP server transport error', error);

    if (this.connectionState === ConnectionState.CONNECTED && this.options.autoReconnect) {
      this.setConnectionState(ConnectionState.RECONNECTING);
      this.scheduleReconnect();
    } else {
      this.setConnectionState(ConnectionState.FAILED);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(async () => {
      try {
        this.logger.info('Attempting to reconnect to MCP server');
        this.reconnectAttempts = 0;

        // Clean up existing client/transport
        await this.cleanup();

        await this.connectWithRetry();
      } catch (error) {
        this.logger.error('Reconnection attempt failed', error);
        if (this.reconnectAttempts < this.options.maxRetries) {
          this.scheduleReconnect();
        } else {
          this.setConnectionState(ConnectionState.FAILED);
        }
      }
    }, this.options.retryDelay);
  }

  /**
   * Clear any pending reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Set the connection state
   */
  private setConnectionState(state: ConnectionState): void {
    const oldState = this.connectionState;
    this.connectionState = state;
    this.logger.debug('Connection state changed', { from: oldState, to: state });
  }

  /**
   * Disconnect from the MCP server
   *
   * Closes the connection and terminates the server process.
   * Any pending reconnection attempts are cancelled.
   */
  async disconnect(): Promise<void> {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    await this.cleanup();
    this.setConnectionState(ConnectionState.DISCONNECTED);
    this.logger.info('Disconnected from MCP server', { name: this.options.name });
  }

  /**
   * Clean up client and transport resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
    } catch (error) {
      this.logger.error('Error closing MCP client', error);
    }

    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
    } catch (error) {
      this.logger.error('Error closing MCP transport', error);
    }
  }

  /**
   * List available tools from the server
   *
   * @returns Array of available tools
   * @throws {McpClientError} if not connected or the request fails
   */
  async listTools(): Promise<McpTool[]> {
    this.ensureConnected();

    try {
      this.logger.debug('Listing tools from MCP server');

      const response = await this.client!.listTools(
        {},
        { timeout: this.options.requestTimeout }
      );

      const tools = response.tools.map(this.convertToolToMcpTool);
      this.logger.debug(`Received ${tools.length} tools from server`);

      return tools;
    } catch (error) {
      throw this.wrapError('Failed to list tools', error);
    }
  }

  /**
   * Convert SDK Tool to McpTool
   */
  private convertToolToMcpTool(tool: Tool): McpTool {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as McpTool['inputSchema'],
      outputSchema: tool.outputSchema as McpTool['outputSchema'],
      annotations: tool.annotations,
      execution: tool.execution,
    };
  }

  /**
   * Call a tool on the server
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool execution result
   * @throws {McpClientError} if not connected or the request fails
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    this.ensureConnected();

    this.logger.debug(`Calling tool "${name}" on MCP server`, { args });

    try {
      const response = await this.client!.callTool(
        {
          name,
          arguments: args,
        },
        undefined,
        { timeout: this.options.requestTimeout }
      );

      // Handle different response formats
      if ('toolResult' in response) {
        return {
          content: [],
          structuredContent: response.toolResult as Record<string, unknown>,
          _meta: response._meta,
        };
      }

      return {
        content: response.content as McpToolResult['content'],
        isError: response.isError,
        structuredContent: response.structuredContent,
        _meta: response._meta,
      };
    } catch (error) {
      throw this.wrapError(`Failed to call tool "${name}"`, error);
    }
  }

  /**
   * List available resources from the server
   *
   * @returns Array of available resources
   * @throws {McpClientError} if not connected or the request fails
   */
  async listResources(): Promise<McpResource[]> {
    this.ensureConnected();

    try {
      this.logger.debug('Listing resources from MCP server');

      const response = await this.client!.listResources(
        {},
        { timeout: this.options.requestTimeout }
      );

      return response.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
    } catch (error) {
      throw this.wrapError('Failed to list resources', error);
    }
  }

  /**
   * Read a resource from the server
   *
   * @param uri - Resource URI
   * @returns Resource contents
   * @throws {McpClientError} if not connected or the request fails
   */
  async readResource(uri: string): Promise<{
    contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>;
  }> {
    this.ensureConnected();

    try {
      this.logger.debug(`Reading resource "${uri}" from MCP server`);

      const response = await this.client!.readResource(
        { uri },
        { timeout: this.options.requestTimeout }
      );

      return {
        contents: response.contents.map((content) => ({
          uri: content.uri,
          text: 'text' in content ? content.text : undefined,
          blob: 'blob' in content ? content.blob : undefined,
          mimeType: content.mimeType,
        })),
      };
    } catch (error) {
      throw this.wrapError(`Failed to read resource "${uri}"`, error);
    }
  }

  /**
   * List available prompts from the server
   *
   * @returns Array of available prompts
   * @throws {McpClientError} if not connected or the request fails
   */
  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected();

    try {
      this.logger.debug('Listing prompts from MCP server');

      const response = await this.client!.listPrompts(
        {},
        { timeout: this.options.requestTimeout }
      );

      return response.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments?.map((arg) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        })),
      }));
    } catch (error) {
      throw this.wrapError('Failed to list prompts', error);
    }
  }

  /**
   * Get a prompt from the server
   *
   * @param name - Prompt name
   * @param args - Prompt arguments (must be string values)
   * @returns Prompt messages
   * @throws {McpClientError} if not connected or the request fails
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<{
    messages: unknown[];
    description?: string;
    _meta?: Record<string, unknown>;
  }> {
    this.ensureConnected();

    try {
      this.logger.debug(`Getting prompt "${name}" from MCP server`);

      const response = await this.client!.getPrompt(
        {
          name,
          arguments: args,
        },
        { timeout: this.options.requestTimeout }
      );

      return {
        messages: response.messages,
        description: response.description,
        _meta: response._meta as Record<string, unknown> | undefined,
      };
    } catch (error) {
      throw this.wrapError(`Failed to get prompt "${name}"`, error);
    }
  }

  /**
   * Ping the server to check connectivity
   *
   * @returns true if the server is responsive
   */
  async ping(): Promise<boolean> {
    this.ensureConnected();

    try {
      await this.client!.ping({ timeout: this.options.requestTimeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the server capabilities
   *
   * @returns Server capabilities or undefined if not connected
   */
  getServerCapabilities(): ServerCapabilities | undefined {
    return this.client?.getServerCapabilities();
  }

  /**
   * Get the server version information
   *
   * @returns Server version info or undefined if not connected
   */
  getServerVersion(): { name: string; version: string } | undefined {
    const version = this.client?.getServerVersion();
    if (!version) {
      return undefined;
    }
    return {
      name: version.name,
      version: version.version,
    };
  }

  /**
   * Get the server instructions (if provided)
   *
   * @returns Server instructions or undefined
   */
  getServerInstructions(): string | undefined {
    return this.client?.getInstructions();
  }

  /**
   * Check if connected to the server
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get the server name
   */
  getServerName(): string {
    return this.options.name;
  }

  /**
   * Ensure the client is connected
   *
   * @throws {McpClientError} if not connected
   */
  private ensureConnected(): void {
    if (!this.isConnected() || !this.client) {
      throw new McpClientError(
        `Not connected to MCP server "${this.options.name}". Current state: ${this.connectionState}`,
        'NOT_CONNECTED'
      );
    }
  }

  /**
   * Wrap an error with additional context
   */
  private wrapError(message: string, error: unknown): McpClientError {
    const cause = error instanceof Error ? error : new Error(String(error));
    return new McpClientError(message, 'OPERATION_FAILED', cause);
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close method for cleanup
   */
  async close(): Promise<void> {
    await this.disconnect();
  }
}
