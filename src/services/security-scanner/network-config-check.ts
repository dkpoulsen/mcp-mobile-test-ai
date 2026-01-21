/**
 * Network Configuration Check Module
 *
 * Detects insecure network configurations in code.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  InsecureNetworkFinding,
  NetworkSecurityCheck,
  SecurityCategory,
  SecuritySeverity,
} from './types.js';

/**
 * Patterns for detecting insecure network configurations
 */
export const NETWORK_SECURITY_PATTERNS: NetworkSecurityCheck[] = [
  // HTTP (non-HTTPS) URLs
  {
    name: 'HTTP URL',
    pattern: /http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi,
    severity: SecuritySeverity.INFO,
    issue: 'plaintext',
    description: 'HTTP URL for localhost (acceptable for development)',
  },
  {
    name: 'HTTP URL',
    pattern: /http:\/\/(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0))/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'plaintext',
    description: 'HTTP URL without TLS/SSL encryption',
  },
  // TLS/SSL misconfigurations
  {
    name: 'TLS Disabled',
    pattern: /rejectUnauthorized\s*:\s*false/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'missing_cert_validation',
    description: 'TLS certificate validation disabled',
  },
  {
    name: 'TLS Disabled',
    pattern: /strictSSL\s*:\s*false/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'missing_cert_validation',
    description: 'Strict SSL checking disabled',
  },
  {
    name: 'TLS Disabled',
    pattern: /checkServerIdentity\s*:\s*\(\)\s*=>\s*(?:undefined|null|true)/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'missing_cert_validation',
    description: 'Server identity checking bypassed',
  },
  // Weak cipher suites
  {
    name: 'Weak Cipher',
    pattern: /cipher\s*[:=]\s*['"`](?:DES|RC4|MD5|SHA1|anon|EXP|NULL)['"`]/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'weak_tls',
    description: 'Weak cipher suite detected',
  },
  {
    name: 'Weak TLS Version',
    pattern: /(?:minVersion|minimumVersion|tlsVersion)\s*[:=]\s*['"`](?:TLSv1|SSLv3|SSLv2)['"`]/gi,
    severity: SecuritySeverity.CRITICAL,
    issue: 'weak_tls',
    description: 'Weak or deprecated TLS version',
  },
  // WebSocket without WS
  {
    name: 'Insecure WebSocket',
    pattern: /ws:\/\/(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0))/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'plaintext',
    description: 'WebSocket without encryption (should use wss://)',
  },
  // FTP without encryption
  {
    name: 'FTP Protocol',
    pattern: /ftp:\/\/.*/gi,
    severity: SecuritySeverity.MEDIUM,
    issue: 'plaintext',
    description: 'FTP protocol without encryption (should use FTPS or SFTP)',
  },
  // API endpoints without https
  {
    name: 'API Base URL',
    pattern: /(?:API_BASE_URL|BASE_URL|apiUrl|baseUrl)\s*[:=]\s*['"`]http:\/\/(?!localhost)/gi,
    severity: SecuritySeverity.HIGH,
    issue: 'plaintext',
    description: 'API base URL configured with HTTP instead of HTTPS',
  },
  // CORS misconfiguration
  {
    name: 'Permissive CORS',
    pattern: /origin\s*:\s*['"`]\*['"`](?![^]*credentials)/gi,
    severity: SecuritySeverity.MEDIUM,
    issue: 'plaintext',
    description: 'Overly permissive CORS origin configuration',
  },
];

/**
 * Detect insecure network configurations in code content
 */
export function detectNetworkSecurityIssuesInContent(
  content: string,
  filePath: string
): InsecureNetworkFinding[] {
  const findings: InsecureNetworkFinding[] = [];
  const lines = content.split('\n');

  for (const networkPattern of NETWORK_SECURITY_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (networkPattern.pattern.test(line)) {
        const urlMatch = line.match(/(https?:\/\/[^\s'"`]+)/);
        const affectedUrl = urlMatch ? urlMatch[1] : undefined;

        findings.push({
          id: uuidv4(),
          category: SecurityCategory.INSECURE_NETWORK,
          severity: networkPattern.severity,
          title: `Insecure Network Configuration: ${networkPattern.name}`,
          description: networkPattern.description,
          location: `${filePath}:${i + 1}`,
          evidence: `${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`,
          protocol: extractProtocol(line),
          issue: networkPattern.issue,
          affectedUrl,
          recommendation: getRecommendation(networkPattern.issue, affectedUrl),
          references: [
            'https://cwe.mitre.org/data/definitions/319.html',
            'https://cwe.mitre.org/data/definitions/295.html',
          ],
          cwe: 'CWE-319',
          timestamp: new Date(),
        });
      }
    }
  }

  return findings;
}

/**
 * Extract protocol from a line
 */
function extractProtocol(line: string): string {
  const urlMatch = line.match(/(https?|wss?|ftp|tls|ssl):\/\//i);
  if (urlMatch) {
    return urlMatch[1].toUpperCase();
  }
  return 'UNKNOWN';
}

/**
 * Get recommendation based on network issue type
 */
function getRecommendation(issue: InsecureNetworkFinding['issue'], url?: string): string {
  const recommendations: Record<string, string> = {
    plaintext: url
      ? `Replace the HTTP endpoint with HTTPS. All network communication should use TLS/SSL encryption to prevent data interception. Change "${url}" to use https:// protocol.`
      : 'Replace HTTP endpoints with HTTPS. All network communication should use TLS/SSL encryption to prevent data interception.',
    weak_tls: 'Update to use strong TLS configurations. Use TLS 1.2 or higher with strong cipher suites. Disable weak ciphers like DES, RC4, and MD5.',
    self_signed_cert: 'Use valid certificates from a trusted certificate authority. Self-signed certificates should only be used in development environments.',
    expired_cert: 'Update expired certificates. Use automated certificate management tools like Let\'s Encrypt with auto-renewal.',
    missing_cert_validation: 'Enable certificate validation. Never disable rejectUnauthorized or strictSSL in production. If you need to handle specific cases, add exceptions for specific certificates rather than disabling validation entirely.',
  };

  return recommendations[issue] || 'Review and update the network configuration to use secure protocols and proper certificate validation.';
}

/**
 * Network Configuration Checker class
 */
export class NetworkConfigChecker {
  private patterns: NetworkSecurityCheck[];

  constructor(customPatterns?: NetworkSecurityCheck[]) {
    this.patterns = customPatterns || NETWORK_SECURITY_PATTERNS;
  }

  /**
   * Scan a single file for insecure network configurations
   */
  async scanFile(filePath: string, content: string): Promise<InsecureNetworkFinding[]> {
    return detectNetworkSecurityIssuesInContent(content, filePath);
  }

  /**
   * Add a custom network security pattern
   */
  addPattern(pattern: NetworkSecurityCheck): void {
    this.patterns.push(pattern);
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): NetworkSecurityCheck[] {
    return [...this.patterns];
  }

  /**
   * Check if a URL is secure
   */
  isSecureUrl(url: string): boolean {
    return url.startsWith('https://') ||
           url.startsWith('wss://') ||
           url.startsWith('ftps://');
  }

  /**
   * Get security issues for a URL
   */
  analyzeUrl(url: string): InsecureNetworkFinding[] {
    const findings: InsecureNetworkFinding[] = [];

    if (!this.isSecureUrl(url) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      findings.push({
        id: uuidv4(),
        category: SecurityCategory.INSECURE_NETWORK,
        severity: SecuritySeverity.HIGH,
        title: 'Insecure URL Detected',
        description: 'URL uses plaintext protocol instead of HTTPS',
        location: 'runtime',
        protocol: extractProtocol(url),
        issue: 'plaintext',
        affectedUrl: url,
        recommendation: `Replace "${url}" with its HTTPS equivalent to ensure encrypted communication.`,
        references: ['https://cwe.mitre.org/data/definitions/319.html'],
        cwe: 'CWE-319',
        timestamp: new Date(),
      });
    }

    return findings;
  }
}
