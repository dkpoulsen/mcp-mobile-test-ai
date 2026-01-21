/**
 * Failure Analyzer Templates
 * Prompt templates for LLM-based test failure analysis
 */

/**
 * System prompt for failure analysis
 */
export const FAILURE_ANALYSIS_SYSTEM_PROMPT = `You are an expert test failure analyst specializing in automated testing, mobile applications, and web applications.

Your role is to analyze test failures and provide:
1. Root cause identification with confidence levels
2. Failure categorization (assertion, element not found, timeout, network, crash, setup, data, environment, race condition, or unknown)
3. Flakiness assessment (is the test unstable or consistently failing?)
4. Severity assessment (critical, high, medium, low, info)
5. Actionable fix suggestions with priority and effort estimates

When analyzing failures:
- Look for patterns in error messages and stack traces
- Identify timing issues, race conditions, or environment problems
- Suggest specific code changes or configuration updates
- Prioritize fixes by impact and effort
- Distinguish between test code issues and application code issues
- Consider both mobile (iOS/Android) and web contexts

Always respond with valid JSON in the specified format.`;

/**
 * JSON schema for LLM response
 */
export const FAILURE_ANALYSIS_JSON_SCHEMA = `
Respond with a JSON object in this exact format:
{
  "category": "ASSERTION | ELEMENT_NOT_FOUND | TIMEOUT | NETWORK | CRASH | SETUP | DATA | ENVIRONMENT | RACE_CONDITION | UNKNOWN",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
  "summary": "Brief one-line summary of the failure",
  "rootCause": {
    "primaryCause": "Main suspected reason for the failure",
    "confidence": 0.0-1.0,
    "alternativeCauses": ["Other possible causes"],
    "evidence": ["Specific evidence from the error/trace/logs"],
    "relatedLocations": [
      {
        "path": "file/path.ext",
        "line": 123,
        "description": "What this location relates to"
      }
    ]
  },
  "flakiness": {
    "isFlaky": true/false,
    "confidence": "NOT_FLAKY | LOW | MEDIUM | HIGH | DEFINITELY_FLAKY",
    "indicators": ["Signs that indicate flakiness or lack thereof"],
    "stabilizers": ["Ways to make the test more stable"]
  },
  "suggestedFixes": [
    {
      "type": "code_change | configuration | environment | test_update | investigation",
      "description": "What to do",
      "snippet": "Code example if applicable",
      "filePath": "Where to apply the fix",
      "priority": 1-10,
      "effort": 1-5
    }
  ],
  "notes": ["Additional observations or warnings"]
}`;

/**
 * Few-shot examples for failure analysis
 */
export const FAILURE_ANALYSIS_EXAMPLES = [
  {
    input: {
      testName: "Login should authenticate user",
      errorMessage: "Error: Timeout waiting for element '.login-button' to be visible",
      stackTrace: "at Object.wait (src/tests/login.spec.ts:45:15)\nat Loginpage.login (src/pages/login.ts:78:5)",
      deviceInfo: { platform: "ios", osVersion: "16.0", deviceName: "iPhone 14" },
      duration: 35000,
    },
    output: {
      category: "TIMEOUT",
      severity: "HIGH",
      summary: "Test timeout waiting for login button element",
      rootCause: {
        primaryCause: "Element locator may be incorrect or element is not rendered within timeout period",
        confidence: 0.8,
        alternativeCauses: [
          "Network delay in authentication response",
          "Page transition not completing",
          "Element exists but is not visible"
        ],
        evidence: [
          "Timeout error on '.login-button' element",
          "Wait duration of 35 seconds exceeded default timeout",
          "iOS 16 platform may have different rendering behavior"
        ],
        relatedLocations: [
          {
            path: "src/tests/login.spec.ts",
            line: 45,
            description: "Wait assertion that timed out"
          },
          {
            path: "src/pages/login.ts",
            line: 78,
            description: "Login method called before timeout"
          }
        ]
      },
      flakiness: {
        isFlaky: true,
        confidence: "MEDIUM",
        indicators: [
          "Network-dependent operation",
          "Timeout failure pattern common in flaky tests",
          "Platform-specific (iOS 16)"
        ],
        stabilizers: [
          "Increase explicit wait timeout",
          "Add retry logic for network requests",
          "Use more robust element locator (e.g., accessibility ID)",
          "Add preconditions check for network connectivity"
        ]
      },
      suggestedFixes: [
        {
          type: "code_change",
          description: "Use accessibility ID instead of CSS selector for more reliable element location",
          snippet: "await page.getByTestId('login-button').waitFor({ state: 'visible', timeout: 15000 })",
          filePath: "src/tests/login.spec.ts",
          priority: 8,
          effort: 2
        },
        {
          type: "configuration",
          description: "Increase timeout for authentication-dependent tests",
          snippet: "test.setTimeout(60000)",
          filePath: "src/tests/login.spec.ts",
          priority: 6,
          effort: 1
        },
        {
          type: "test_update",
          description: "Add explicit wait for network idle before checking element",
          snippet: "await page.waitForLoadState('networkidle')",
          filePath: "src/pages/login.ts",
          priority: 7,
          effort: 2
        }
      ],
      notes: [
        "Consider if this is a real application issue (login page loading slowly)",
        "Check if the selector '.login-button' is valid in iOS 16",
        "Verify tests pass on stable network conditions"
      ]
    }
  },
  {
    input: {
      testName: "Checkout should calculate total",
      errorMessage: "AssertionError: Expected total to be '$99.99' but received '$109.99'",
      stackTrace: "at Object.<anonymous> (src/tests/checkout.spec.ts:112:30)",
      history: {
        runCount: 10,
        passCount: 7,
        failCount: 3,
        recentResults: ["PASS", "PASS", "FAIL", "PASS", "FAIL"]
      }
    },
    output: {
      category: "ASSERTION",
      severity: "MEDIUM",
      summary: "Price calculation assertion failure with inconsistent results",
      rootCause: {
        primaryCause: "Race condition in price calculation or tax rate lookup",
        confidence: 0.85,
        alternativeCauses: [
          "Tax calculation depends on async API call",
          "Multiple items being added concurrently",
          "Test data not properly isolated between runs"
        ],
        evidence: [
          "Assertion mismatch: $99.99 vs $109.99 (exactly $10 difference - suggests tax issue)",
          "Inconsistent results: 7 passes, 3 failures out of 10 runs",
          "Pattern of PASS, PASS, FAIL, PASS, FAIL indicates timing dependency"
        ],
        relatedLocations: [
          {
            path: "src/tests/checkout.spec.ts",
            line: 112,
            description: "Assertion that failed"
          }
        ]
      },
      flakiness: {
        isFlaky: true,
        confidence: "HIGH",
        indicators: [
          "Test passes intermittently (70% pass rate)",
          "Consistent $10 difference suggests timing-dependent calculation",
          "No code changes but different results"
        ],
        stabilizers: [
          "Add explicit wait for tax calculation to complete",
          "Stub/mock tax API for consistent test data",
          "Add assertion for expected tax value before total",
          "Use fixed test data with deterministic calculations"
        ]
      },
      suggestedFixes: [
        {
          type: "code_change",
          description: "Add wait for tax calculation completion before asserting total",
          snippet: "await expect(page.locator('.tax-amount')).toHaveText('$10.00')",
          filePath: "src/tests/checkout.spec.ts",
          priority: 9,
          effort: 2
        },
        {
          type: "test_update",
          description: "Mock tax API to return consistent values",
          snippet: "await page.route('**/api/tax', route => route.fulfill({ body: JSON.stringify({ rate: 0.10 }) }))",
          filePath: "src/tests/checkout.spec.ts",
          priority: 8,
          effort: 3
        },
        {
          type: "investigation",
          description: "Investigate if the $10 difference is always consistent to confirm tax timing hypothesis",
          filePath: "src/tests/checkout.spec.ts",
          priority: 7,
          effort: 2
        }
      ],
      notes: [
        "The consistent $10 difference strongly suggests tax calculation timing issue",
        "Consider if the test or application has a race condition",
        "30% failure rate is significant and needs addressing"
      ]
    }
  },
  {
    input: {
      testName: "User profile should display",
      errorMessage: "TypeError: Cannot read properties of undefined (reading 'name')",
      stackTrace: "at UserProfile.render (src/components/UserProfile.tsx:24:18)\nat TestScene.render (src/tests/UserProfile.test.tsx:45:10)",
      deviceInfo: { platform: "android", osVersion: "12.0", deviceName: "Pixel 6" }
    },
    output: {
      category: "DATA",
      severity: "CRITICAL",
      summary: "Application crash due to undefined user object",
      rootCause: {
        primaryCause: "Component attempting to access properties on undefined user object",
        confidence: 0.95,
        alternativeCauses: [
          "API response not properly awaited",
          "Missing null check in component",
          "Test not setting up required user data"
        ],
        evidence: [
          "TypeError accessing 'name' property of undefined",
          "Error occurs in UserProfile.render component",
          "Stack trace points to line 24 in UserProfile.tsx"
        ],
        relatedLocations: [
          {
            path: "src/components/UserProfile.tsx",
            line: 24,
            description: "Component code that accesses undefined user"
          },
          {
            path: "src/tests/UserProfile.test.tsx",
            line: 45,
            description: "Test that may not be setting up user data"
          }
        ]
      },
      flakiness: {
        isFlaky: false,
        confidence: "NOT_FLAKY",
        indicators: [
          "Consistent TypeError, not a timing issue",
          "Reproducible crash, not intermittent"
        ],
        stabilizers: [
          "Add proper error handling in component",
          "Add null checks before accessing object properties",
          "Ensure test provides required data"
        ]
      },
      suggestedFixes: [
        {
          type: "code_change",
          description: "Add optional chaining and null check in UserProfile component",
          snippet: "const userName = user?.name ?? 'Guest'",
          filePath: "src/components/UserProfile.tsx",
          priority: 10,
          effort: 1
        },
        {
          type: "test_update",
          description: "Ensure test provides user data in setup",
          snippet: "const mockUser = { name: 'Test User', email: 'test@example.com' }",
          filePath: "src/tests/UserProfile.test.tsx",
          priority: 9,
          effort: 1
        },
        {
          type: "investigation",
          description: "Review component lifecycle to understand why user is undefined",
          filePath: "src/components/UserProfile.tsx",
          priority: 5,
          effort: 3
        }
      ],
      notes: [
        "This is a legitimate bug, not a test issue",
        "Critical severity - causes application crash",
        "Consider adding TypeScript strict null checks to prevent similar issues"
      ]
    }
  }
];

/**
 * Chain of thought analysis template
 */
export function buildFailureAnalysisPrompt(
  context: import('./types.js').FailureContext,
  options: import('./types.js').AnalysisOptions = {}
): string {
  let prompt = `Analyze the following test failure and provide a detailed root cause analysis.

## Test Failure Details

**Test Name:** ${context.testName}
${context.testFile ? `**Test File:** ${context.testFile}` : ''}
${context.suiteName ? `**Test Suite:** ${context.suiteName}` : ''}
${context.deviceInfo ? `**Platform:** ${context.deviceInfo.platform} ${context.deviceInfo.osVersion} (${context.deviceInfo.deviceName})` : ''}
${context.duration ? `**Duration:** ${context.duration}ms` : ''}

**Error Message:**
\`\`\`
${context.errorMessage}
\`\`\`

${context.stackTrace ? `**Stack Trace:**
\`\`\`
${context.stackTrace}
\`\`\`

` : ''}`;

  // Add logs if available
  if (context.logs && options.deepLogAnalysis) {
    prompt += `**Logs:**
\`\`\`
${context.logs.substring(0, 5000)}${context.logs.length > 5000 ? '\n... (truncated)' : ''}
\`\`\`

`;
  }

  // Add history if available
  if (context.history) {
    const passRate = ((context.history.passCount / context.history.runCount) * 100).toFixed(0);
    prompt += `**Test History:**
- Total runs: ${context.history.runCount}
- Passed: ${context.history.passCount} (${passRate}%)
- Failed: ${context.history.failCount}
- Recent results: ${context.history.recentResults.join(', ')}

`;
  }

  // Add metadata if available
  if (context.metadata && Object.keys(context.metadata).length > 0) {
    prompt += `**Additional Metadata:**
\`\`\`json
${JSON.stringify(context.metadata, null, 2)}
\`\`\`

`;
  }

  // Add custom instructions if provided
  if (options.customInstructions) {
    prompt += `**Special Instructions:**
${options.customInstructions}

`;
  }

  prompt += `## Analysis Required

Provide a comprehensive analysis including:
1. **Category**: Classify the failure type
2. **Severity**: Assess impact (CRITICAL/HIGH/MEDIUM/LOW/INFO)
3. **Root Cause**: Primary and alternative causes with evidence
4. **Flakiness**: Is this test unstable? Why or why not?
5. **Fixes**: Specific, actionable solutions with priority and effort

Focus on actionable insights. Suggest specific code changes where possible.
`;

  return prompt;
}
