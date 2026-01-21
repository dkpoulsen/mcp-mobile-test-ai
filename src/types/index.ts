/**
 * Core type definitions for MCP Mobile Test AI
 */

export interface McpMobileTestOptions {
  /**
   * Path to the configuration file
   */
  configPath?: string;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  /**
   * Maximum number of parallel test executions
   */
  maxParallel?: number;

  /**
   * Timeout for test execution in milliseconds
   */
  timeout?: number;
}

export interface TestResult {
  /**
   * Unique identifier for the test
   */
  id: string;

  /**
   * Test name or description
   */
  name: string;

  /**
   * Whether the test passed
   */
  passed: boolean;

  /**
   * Execution time in milliseconds
   */
  duration: number;

  /**
   * Error message if test failed
   */
  error?: string;

  /**
   * Stack trace if test failed
   */
  stackTrace?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

export interface DeviceInfo {
  /**
   * Unique device identifier
   */
  id: string;

  /**
   * Device platform (ios, android)
   */
  platform: 'ios' | 'android';

  /**
   * Device name
   */
  name: string;

  /**
   * OS version
   */
  osVersion: string;

  /**
   * Whether this is an emulator/simulator or real device
   */
  isEmulator: boolean;

  /**
   * Screen dimensions
   */
  screen?: {
    width: number;
    height: number;
  };
}

export interface TestSuite {
  /**
   * Unique identifier for the suite
   */
  id: string;

  /**
   * Suite name
   */
  name: string;

  /**
   * Test cases in this suite
   */
  tests: TestCase[];

  /**
   * Devices to run tests on
   */
  devices: DeviceInfo[];
}

export interface TestCase {
  /**
   * Unique identifier for the test case
   */
  id: string;

  /**
   * Test name or description
   */
  name: string;

  /**
   * Natural language description of test steps
   */
  description: string;

  /**
   * Expected test outcome
   */
  expectedOutcome: string;

  /**
   * Test timeout in milliseconds
   */
  timeout?: number;

  /**
   * Tags for categorization
   */
  tags?: string[];
}

export interface LlmProvider {
  /**
   * Provider name (openai, anthropic, etc.)
   */
  name: string;

  /**
   * API key
   */
  apiKey: string;

  /**
   * Model to use
   */
  model: string;

  /**
   * API base URL (optional)
   */
  baseUrl?: string;

  /**
   * Maximum tokens for responses
   */
  maxTokens?: number;

  /**
   * Temperature for response randomness
   */
  temperature?: number;
}

export interface McpServerConfig {
  /**
   * Server name
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
   * Environment variables
   */
  env?: Record<string, string>;
}
