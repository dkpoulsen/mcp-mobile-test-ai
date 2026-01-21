import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
// Priority: .env.production > .env.test > .env.development > .env
const env = process.env.NODE_ENV || "development";
const envFiles = [
  `.env.${env}.local`,
  `.env.${env}`,
  ".env.local",
  ".env",
];

for (const file of envFiles) {
  dotenv.config({ path: file });
}

// Define the environment variable schema
const envSchema = z
  .object({
    // Application
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // LLM Configuration
    LLM_PROVIDER: z.enum(["openai", "anthropic", "openrouter"]).default("openai"),
    LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
    LLM_MODEL: z.string().default("gpt-4"),
    LLM_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
    LLM_API_BASE: z.string().url().optional(),

    // MCP Configuration
    MCP_SERVER_URL: z.string().url().optional(),
    MCP_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
    MCP_TIMEOUT: z.coerce.number().int().positive().default(30000),

    // Device Configuration
    DEVICE_TYPE: z.enum(["ios", "android", "both"]).default("both"),
    APPIUM_SERVER: z.string().url().optional(),
    APPIUM_PORT: z.coerce.number().int().positive().max(65535).default(4723),

    // Execution Configuration
    MAX_PARALLEL: z.coerce.number().int().positive().default(1),
    EXECUTION_TIMEOUT: z.coerce.number().int().positive().default(30000),
    RETRY_COUNT: z.coerce.number().int().min(0).default(0),

    // Logging Configuration
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_FILE: z.string().default("logs/mcp-mobile-test.log"),
    LOG_FORMAT: z.enum(["json", "text"]).default("text"),

    // Feature Flags
    ENABLE_TRACING: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    ENABLE_METRICS: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    ENABLE_SMART_RETRY: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    SMART_RETRY_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    SMART_RETRY_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
    SMART_RETRY_ENABLE_LEARNING: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    SMART_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(1000),
    SMART_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).default(30000),
    SMART_RETRY_BACKOFF_MULTIPLIER: z.coerce.number().positive().default(2),
    SMART_RETRY_ENABLE_DEVICE_SWITCHING: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    SMART_RETRY_ENABLE_LOCATOR_ALTERNATIVES: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    SMART_RETRY_MIN_LEARNING_DATA_POINTS: z.coerce.number().int().min(1).default(3),
    SMART_RETRY_LEARNED_STRATEGY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),

    // API Server Configuration
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    API_HOST: z.string().default("0.0.0.0"),
    API_ENABLE_CORS: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    API_ENABLE_HELMET: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    API_KEY: z.string().optional(),
    API_BEARER_TOKEN: z.string().optional(),
    API_ENABLE_REQUEST_LOGGING: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    API_REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
    API_MAX_BODY_SIZE: z.string().default("1mb"),
    API_TRUST_PROXY: z.union([z.boolean(), z.string()]).default(false),
    API_CORS_ORIGINS: z.string().default("*"),

    // Redis Configuration
    REDIS_URL: z.string().default("redis://localhost:6379"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().max(65535).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    REDIS_TLS: z
      .string()
      .default("false")
      .transform((v) => v === "true"),

    // Job Queue Configuration
    QUEUE_NAME: z.string().default("mobile-test-execution"),
    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(3),
    QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
    QUEUE_RETRY_DELAY: z.coerce.number().int().min(0).default(5000),
    QUEUE_BACKOFF_TYPE: z.enum(["fixed", "exponential"]).default("exponential"),
    QUEUE_JOB_TIMEOUT: z.coerce.number().int().positive().default(300000),
    QUEUE_REMOVE_ON_COMPLETE: z.coerce.number().int().min(0).default(100),
    QUEUE_REMOVE_ON_FAIL: z.coerce.number().int().min(0).default(500),
    QUEUE_DEFAULT_PRIORITY: z.coerce.number().int().min(1).max(10).default(5),
    QUEUE_SCHEDULER_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v === "true"),

    // Notification Configuration - Slack
    SLACK_WEBHOOK_URL: z.string().url().optional(),
    SLACK_CHANNEL: z.string().optional(),
    SLACK_USERNAME: z.string().optional(),
    SLACK_ICON_EMOJI: z.string().optional(),

    // Notification Configuration - Email
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((v) => v === "true")
      .optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    EMAIL_FROM_NAME: z.string().optional(),
    EMAIL_TO: z.string().optional(),
    EMAIL_CC: z.string().optional(),
    EMAIL_BCC: z.string().optional(),

    // Notification Configuration - Webhooks
    // WEBHOOK_<NAME>_URL, WEBHOOK_<NAME>_TOKEN, WEBHOOK_<NAME>_HEADERS

    // Notification Settings
    NOTIFICATION_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    NOTIFICATION_CHANNELS: z
      .string()
      .default("slack")
      .transform((v) => v.split(",").map((c) => c.trim()))
      .optional(),
    NOTIFICATION_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(0).default(3),
    NOTIFICATION_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(1000),
    NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

    // Maintenance Configuration
    MAINTENANCE_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    MAINTENANCE_WINDOW_START: z.coerce.number().int().min(0).max(23).default(2),
    MAINTENANCE_WINDOW_END: z.coerce.number().int().min(0).max(23).default(6),
    MAINTENANCE_SCHEDULE: z.string().default("0 3 * * *"), // Daily at 3 AM
    ARTIFACT_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
    ARTIFACT_MAX_SIZE_MB: z.coerce.number().int().min(0).default(5120),
    ARTIFACT_PATHS: z
      .string()
      .default("test-artifacts,test-screenshots,playwright-report")
      .transform((v) => v.split(",").map((p) => p.trim())),
    SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(0).default(30),
    SESSION_ERROR_TIMEOUT_MINUTES: z.coerce.number().int().min(0).default(10),
    SESSION_MAX_COUNT: z.coerce.number().int().min(0).default(50),
    DB_ANALYZE_ENABLED: z
      .string()
      .default("true")
      .transform((v) => v === "true"),
    DB_VACUUM_ENABLED: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    DB_REINDEX_ENABLED: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    QUEUE_COMPLETED_RETENTION_DAYS: z.coerce.number().int().min(0).default(7),
    QUEUE_FAILED_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
    QUEUE_MAX_COMPLETED_JOBS: z.coerce.number().int().min(0).default(1000),
    QUEUE_MAX_FAILED_JOBS: z.coerce.number().int().min(0).default(500),
  })
  .passthrough();

// Type for validated environment variables
export type Env = z.infer<typeof envSchema>;

// Parse and validate environment variables
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors: string[] = [];

    // Format Zod errors - iterate through each issue
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "unknown";
      formattedErrors.push(`  - ${path}: ${issue.message}`);
    }

    const errors = formattedErrors.length > 0 ? formattedErrors.join("\n") : "  - Unknown validation error";

    throw new Error(
      `Environment variable validation failed:\n${errors}\n\n` +
        `Please check your .env file or set the required environment variables.`
    );
  }

  return result.data;
}

// Export validated configuration
export const config = parseEnv();

// Export helper function to reload configuration (useful for testing)
export function reloadConfig(): Env {
  return parseEnv();
}

// Export config for specific environments
export const isDevelopment = config.NODE_ENV === "development";
export const isTest = config.NODE_ENV === "test";
export const isProduction = config.NODE_ENV === "production";
