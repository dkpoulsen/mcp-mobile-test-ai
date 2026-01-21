/**
 * Insecure Storage Check Module
 *
 * Detects insecure data storage patterns in code.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  InsecureStorageFinding,
  InsecureStoragePattern,
  SecurityCategory,
  SecuritySeverity,
} from './types.js';

/**
 * Patterns for detecting insecure storage usage
 */
export const INSECURE_STORAGE_PATTERNS: InsecureStoragePattern[] = [
  // localStorage usage
  {
    type: 'localStorage',
    pattern: /localStorage\.(setItem|getItem)\(['"`]\s*(?:password|token|secret|api[_-]?key|credential|auth|session)['"`]\s*,/gi,
    sensitivity: 'high',
    description: 'Storing sensitive data in localStorage',
  },
  {
    type: 'localStorage',
    pattern: /localStorage\.setItem\(/gi,
    sensitivity: 'medium',
    description: 'Using localStorage for data storage (potential sensitive data exposure)',
  },
  // sessionStorage usage
  {
    type: 'sessionStorage',
    pattern: /sessionStorage\.(setItem|getItem)\(['"`]\s*(?:password|token|secret|api[_-]?key|credential|auth|session)['"`]\s*,/gi,
    sensitivity: 'high',
    description: 'Storing sensitive data in sessionStorage',
  },
  {
    type: 'sessionStorage',
    pattern: /sessionStorage\.setItem\(/gi,
    sensitivity: 'medium',
    description: 'Using sessionStorage for data storage',
  },
  // Insecure cookie storage
  {
    type: 'cookie',
    pattern: /document\.cookie\s*=.*?(?:secure\s*=\s*false|httponly\s*=\s*false)/gi,
    sensitivity: 'high',
    description: 'Insecure cookie configuration',
  },
  {
    type: 'cookie',
    pattern: /res\.cookie\(\s*['"`]\w+['"`]\s*,\s*[^,]+,\s*\{[^}]*\}(?![^}]*secure:\s*true)/gi,
    sensitivity: 'medium',
    description: 'Cookie without secure flag set',
  },
  {
    type: 'cookie',
    pattern: /res\.cookie\(\s*['"`]\w+['"`]\s*,\s*[^,]+,\s*\{[^}]*\}(?![^}]*httpOnly:\s*true)/gi,
    sensitivity: 'medium',
    description: 'Cookie without httpOnly flag set',
  },
  // File system storage
  {
    type: 'file',
    pattern: /fs\.(writeFile|appendFile)\(['"`]\s*(?:password|token|secret|api[_-]?key|credential)['"`]/gi,
    sensitivity: 'high',
    description: 'Writing sensitive data to file system',
  },
  {
    type: 'file',
    pattern: /writeFileSync\(['"`]\s*(?:password|token|secret|api[_-]?key|credential)['"`]/gi,
    sensitivity: 'high',
    description: 'Writing sensitive data to file system synchronously',
  },
];

/**
 * Detect insecure storage patterns in code content
 */
export function detectInsecureStorageInContent(
  content: string,
  filePath: string
): InsecureStorageFinding[] {
  const findings: InsecureStorageFinding[] = [];
  const lines = content.split('\n');

  for (const storagePattern of INSECURE_STORAGE_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (storagePattern.pattern.test(line)) {
        findings.push({
          id: uuidv4(),
          category: SecurityCategory.INSECURE_STORAGE,
          severity: determineSeverity(storagePattern.sensitivity),
          title: `Insecure ${storagePattern.type.toUpperCase()} Usage Detected`,
          description: storagePattern.description,
          location: `${filePath}:${i + 1}`,
          evidence: `${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`,
          storageType: storagePattern.type,
          dataSensitivity: storagePattern.sensitivity,
          recommendation: getRecommendation(storagePattern.type, storagePattern.sensitivity),
          references: [
            'https://cwe.mitre.org/data/definitions/922.html',
            'https://owasp.org/www-project-top-ten/',
          ],
          cwe: 'CWE-922',
          timestamp: new Date(),
        });
      }
    }
  }

  return findings;
}

/**
 * Determine severity based on data sensitivity
 */
function determineSeverity(sensitivity: string): SecuritySeverity {
  switch (sensitivity) {
    case 'high':
      return SecuritySeverity.HIGH;
    case 'medium':
      return SecuritySeverity.MEDIUM;
    case 'low':
      return SecuritySeverity.LOW;
    default:
      return SecuritySeverity.INFO;
  }
}

/**
 * Get recommendation based on storage type
 */
function getRecommendation(type: string, sensitivity: string): string {
  const recommendations: Record<string, string> = {
    localStorage:
      'Avoid storing sensitive data in localStorage as it is accessible by any JavaScript code and persists indefinitely. Use secure, httpOnly cookies or session-based storage instead.',
    sessionStorage:
      'Avoid storing sensitive data in sessionStorage. While it clears on tab close, it is still accessible to JavaScript. Consider using secure cookies with appropriate flags.',
    cookie:
      'Always set the `secure` flag to true to ensure cookies are only sent over HTTPS. Set `httpOnly` to true to prevent XSS attacks from accessing the cookie. Consider using `sameSite` to prevent CSRF attacks.',
    file:
      'Avoid writing sensitive data to files. If necessary, ensure proper file permissions are set and consider encrypting the data. Use secure credential storage solutions instead.',
    database:
      'Ensure sensitive data in the database is properly encrypted at rest. Use strong encryption algorithms and proper key management.',
    memory:
      'Be cautious with storing sensitive data in memory. Ensure it is properly cleared when no longer needed and minimize the time it resides in memory.',
  };

  return recommendations[type] || 'Review and secure the storage mechanism for sensitive data.';
}

/**
 * Insecure Storage Checker class
 */
export class InsecureStorageChecker {
  private patterns: InsecureStoragePattern[];

  constructor(customPatterns?: InsecureStoragePattern[]) {
    this.patterns = customPatterns || INSECURE_STORAGE_PATTERNS;
  }

  /**
   * Scan a single file for insecure storage patterns
   */
  async scanFile(filePath: string, content: string): Promise<InsecureStorageFinding[]> {
    return detectInsecureStorageInContent(content, filePath);
  }

  /**
   * Add a custom storage pattern
   */
  addPattern(pattern: InsecureStoragePattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): InsecureStoragePattern[] {
    return [...this.patterns];
  }
}
