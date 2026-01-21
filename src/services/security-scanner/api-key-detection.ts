/**
 * API Key Detection Module
 *
 * Detects exposed API keys and credentials in code and configuration files.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  APIKeyPattern,
  ExposedAPIKeyFinding,
  SecurityCategory,
  SecuritySeverity,
} from './types.js';

/**
 * Common API key patterns for detection
 */
export const API_KEY_PATTERNS: APIKeyPattern[] = [
  // OpenAI
  {
    name: 'OpenAI API Key',
    provider: 'openai',
    pattern: /(?:sk-|OPENAI_API_KEY|openai\.api_key)[\s=:']*[a-zA-Z0-9]{48}/gi,
    description: 'OpenAI API key',
    revocable: true,
  },
  // Anthropic
  {
    name: 'Anthropic API Key',
    provider: 'anthropic',
    pattern: /(?:sk-ant-|ANTHROPIC_API_KEY|anthropic\.api_key)[\s=:']*[a-zA-Z0-9_-]{40,}/gi,
    description: 'Anthropic Claude API key',
    revocable: true,
  },
  // AWS
  {
    name: 'AWS Access Key',
    provider: 'aws',
    pattern: /(?:AKIA|AWS_ACCESS_KEY_ID|aws_access_key_id)[\s=:']*[A-Z0-9]{16,20}/gi,
    description: 'AWS Access Key ID',
    revocable: true,
  },
  {
    name: 'AWS Secret Key',
    provider: 'aws',
    pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)[\s=:']*[a-zA-Z0-9/+=]{40}/gi,
    description: 'AWS Secret Access Key',
    revocable: true,
  },
  // Google Cloud
  {
    name: 'Google Cloud API Key',
    provider: 'google',
    pattern: /(?:GOOGLE_API_KEY|googleApiKey|gcloud_api_key)[\s=:']*[A-Za-z0-9_-]{39}/gi,
    description: 'Google Cloud API key',
    revocable: true,
  },
  {
    name: 'Google Cloud Service Account',
    provider: 'google',
    pattern: /"?private_key"?:\s*"-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----"/gi,
    description: 'Google Cloud Service Account private key',
    revocable: true,
  },
  // GitHub
  {
    name: 'GitHub Personal Access Token',
    provider: 'github',
    pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}/gi,
    description: 'GitHub personal access token',
    revocable: true,
  },
  {
    name: 'GitHub OAuth Token',
    provider: 'github',
    pattern: /(?:GITHUB_TOKEN|github_token)[\s=:']*[a-zA-Z0-9]{40}/gi,
    description: 'GitHub OAuth token',
    revocable: true,
  },
  // Stripe
  {
    name: 'Stripe API Key',
    provider: 'stripe',
    pattern: /(?:sk_live_|sk_test_|pk_live_|pk_test_)[a-zA-Z0-9]{24,}/gi,
    description: 'Stripe API key',
    revocable: true,
  },
  // Slack
  {
    name: 'Slack Bot Token',
    provider: 'slack',
    pattern: /xoxb-[a-zA-Z0-9-]{10,}/gi,
    description: 'Slack bot token',
    revocable: true,
  },
  {
    name: 'Slack User Token',
    provider: 'slack',
    pattern: /xoxp-[a-zA-Z0-9-]{10,}/gi,
    description: 'Slack user token',
    revocable: true,
  },
  // Twilio
  {
    name: 'Twilio API Key',
    provider: 'twilio',
    pattern: /AC[a-z0-9]{32}/gi,
    description: 'Twilio account SID',
    revocable: true,
  },
  // SendGrid
  {
    name: 'SendGrid API Key',
    provider: 'sendgrid',
    pattern: /SG\.[a-zA-Z0-9_-]{22,}\.[a-zA-Z0-9_-]{43,}/gi,
    description: 'SendGrid API key',
    revocable: true,
  },
  // Firebase
  {
    name: 'Firebase Private Key',
    provider: 'firebase',
    pattern: /firebase.*private[_-]?key["']?\s*[:=]\s*["'].*-----BEGIN/gi,
    description: 'Firebase private key',
    revocable: true,
  },
  // Database URLs (often contain credentials)
  {
    name: 'Database URL',
    provider: 'database',
    pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:\s]+:[^@\s]+@/gi,
    description: 'Database connection string with embedded credentials',
    revocable: true,
  },
  // Generic API keys
  {
    name: 'Generic API Key',
    provider: 'generic',
    pattern: /(?:api[_-]?key|apikey|api-key)["']?\s*[:=]\s*["']?[a-zA-Z0-9_\-]{20,}/gi,
    description: 'Generic API key pattern',
    revocable: true,
  },
  // Generic Secret
  {
    name: 'Generic Secret',
    provider: 'generic',
    pattern: /(?:secret|password|passwd|pwd)["']?\s*[:=]\s*["']?[a-zA-Z0-9_\-]{10,}/gi,
    description: 'Generic secret or password pattern',
    revocable: true,
  },
  // JWT tokens
  {
    name: 'JWT Token',
    provider: 'jwt',
    pattern: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
    description: 'JWT (JSON Web Token)',
    revocable: false,
  },
];

/**
 * Extensions that are safe to ignore (less likely to contain real keys)
 */
export const SAFE_EXTENSIONS = new Set([
  '.lock',
  '.md',
  '.txt',
  '.log',
  '.map',
  '.min.js',
  '.min.css',
  'package-lock.json',
  'yarn.lock',
]);

/**
 * Check if a file should be scanned for API keys
 */
function shouldScanFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return !SAFE_EXTENSIONS.has(ext);
}

/**
 * Extract key prefix for masking
 */
function extractKeyPrefix(key: string): string {
  if (key.length <= 8) return '***';
  return key.substring(0, 4) + '***' + key.substring(key.length - 4);
}

/**
 * Detect API keys in file content
 */
export function detectAPIKeysInContent(
  content: string,
  filePath: string
): ExposedAPIKeyFinding[] {
  const findings: ExposedAPIKeyFinding[] = [];
  const lines = content.split('\n');

  for (const keyPattern of API_KEY_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.matchAll(keyPattern.pattern);

      for (const match of matches) {
        const matchedText = match[0];
        const keyMatch = matchedText.match(/[a-zA-Z0-9_-]{10,}/);

        if (keyMatch) {
          findings.push({
            id: uuidv4(),
            category: SecurityCategory.EXPOSED_API_KEY,
            severity: determineSeverity(filePath, keyPattern.provider),
            title: `${keyPattern.provider.toUpperCase()} API Key Exposed`,
            description: `A potential ${keyPattern.description} was found in the source code.`,
            location: `${filePath}:${i + 1}`,
            evidence: `${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`,
            keyType: keyPattern.name,
            keyProvider: keyPattern.provider,
            keyPrefix: extractKeyPrefix(keyMatch[0]),
            keyLocation: determineKeyLocation(filePath),
            isRevocable: keyPattern.revocable,
            recommendation: `Remove the ${keyPattern.name} from source code and move it to environment variables or a secure secret management system. Rotate the key if it has been committed to version control.`,
            references: [
              'https://cwe.mitre.org/data/definitions/798.html',
            ],
            cwe: 'CWE-798',
            timestamp: new Date(),
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Determine the severity based on file location and key type
 */
function determineSeverity(filePath: string, provider: string): SecuritySeverity {
  // Files in version control are critical
  if (filePath.includes('.git')) {
    return SecuritySeverity.CRITICAL;
  }

  // Public repositories or shared code
  if (filePath.includes('src/') || filePath.includes('lib/')) {
    return SecuritySeverity.HIGH;
  }

  // Config files
  if (filePath.includes('config/') || filePath.endsWith('.config.js')) {
    return SecuritySeverity.HIGH;
  }

  // Example files are lower severity
  if (filePath.includes('example') || filePath.includes('sample')) {
    return SecuritySeverity.LOW;
  }

  // Default to high for most API keys
  return SecuritySeverity.HIGH;
}

/**
 * Determine the location type of the exposed key
 */
function determineKeyLocation(filePath: string): ExposedAPIKeyFinding['keyLocation'] {
  if (filePath.includes('.env') || filePath.includes('secrets')) {
    return 'environment';
  }
  if (filePath.includes('logs') || filePath.endsWith('.log')) {
    return 'logs';
  }
  if (filePath.includes('config')) {
    return 'config';
  }
  return 'code';
}

/**
 * API Key Detector class
 */
export class APIKeyDetector {
  private patterns: APIKeyPattern[];

  constructor(customPatterns?: APIKeyPattern[]) {
    this.patterns = customPatterns || API_KEY_PATTERNS;
  }

  /**
   * Scan a single file for exposed API keys
   */
  async scanFile(filePath: string, content: string): Promise<ExposedAPIKeyFinding[]> {
    if (!shouldScanFile(filePath)) {
      return [];
    }

    return detectAPIKeysInContent(content, filePath);
  }

  /**
   * Add a custom API key pattern
   */
  addPattern(pattern: APIKeyPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): APIKeyPattern[] {
    return [...this.patterns];
  }

  /**
   * Check if a string matches any API key pattern
   */
  matchesAnyPattern(input: string): boolean {
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(input)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate and sanitize potential API keys from a string
   */
  sanitizeString(input: string): string {
    let sanitized = input;

    for (const pattern of this.patterns) {
      sanitized = sanitized.replace(pattern.pattern, '[REDACTED_KEY]');
    }

    return sanitized;
  }
}
