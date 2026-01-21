/**
 * GitHub Client
 *
 * Handles GitHub API operations for creating PRs, checking status,
 * merging, and creating rollback PRs.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  DependencyUpdaterConfig,
  PullRequestOptions,
  GitHubPullRequest,
  WorkflowRun,
  PackageDependency,
  UpdateSeverity,
} from './types.js';
import { GitHubError } from './types.js';

const execAsync = promisify(exec);

/**
 * GitHub API base URL
 */
const GITHUB_API_URL = 'https://api.github.com';

/**
 * Get GitHub token from environment
 */
function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new GitHubError('GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.');
  }
  return token;
}

/**
 * Make an authenticated request to GitHub API
 */
async function githubRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown,
  config?: DependencyUpdaterConfig
): Promise<Response> {
  const token = config?.repoOwner ? getGitHubToken() : '';
  const owner = config?.repoOwner || process.env.GITHUB_REPOSITORY_OWNER?.split('/')[0] || '';
  const repo = config?.repoName || process.env.GITHUB_REPOSITORY?.split('/')[1] || '';

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${GITHUB_API_URL}/repos/${owner}/${repo}${endpoint}`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'mcp-mobile-test-ai-dependency-updater',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok && response.status !== 404) {
    throw new GitHubError(
      `GitHub API request failed: ${response.statusText}`,
      response.status
    );
  }

  return response;
}

/**
 * Parse repository from various input formats
 */
export function parseRepository(input: string): { owner: string; name: string } {
  // Handle various formats: owner/repo, git@github.com:owner/repo.git, https://github.com/owner/repo
  const match =
    input.match(/^([^/]+)\/([^/]+?)(\.git)?$/) ||
    input.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);

  if (match) {
    // @ts-expect-error - match groups are guaranteed by the regex
    return { owner: match[1], name: match[2] };
  }

  throw new GitHubError(`Invalid repository format: ${input}`);
}

/**
 * Create a new branch in the repository
 */
export async function createBranch(
  branchName: string,
  baseBranch: string,
  config?: DependencyUpdaterConfig
): Promise<void> {
  try {
    // Get the SHA of the base branch
    const baseRefResponse = await githubRequest(`/git/refs/heads/${baseBranch}`, 'GET', undefined, config);
    if (!baseRefResponse.ok) {
      throw new GitHubError(`Failed to get base branch ${baseBranch}`);
    }
    const baseRef = await baseRefResponse.json();
    const sha = baseRef.object.sha;

    // Create the new branch
    await githubRequest(
      `/git/refs`,
      'POST',
      {
        ref: `refs/heads/${branchName}`,
        sha,
      },
      config
    );
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    throw new GitHubError(`Failed to create branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  options: PullRequestOptions,
  config?: DependencyUpdaterConfig
): Promise<GitHubPullRequest> {
  try {
    const response = await githubRequest(
      '/pulls',
      'POST',
      {
        title: options.title,
        body: options.body,
        head: options.branch,
        base: options.base,
        draft: options.draft ?? false,
        maintainer_can_modify: true,
      },
      config
    );

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubError(`Failed to create PR: ${error}`);
    }

    const pr: GitHubPullRequest = await response.json();

    // Add labels if provided
    if (options.labels && options.labels.length > 0) {
      try {
        await githubRequest(
          `/issues/${pr.number}/labels`,
          'POST',
          { labels: options.labels },
          config
        );
      } catch {
        // Labels are optional, don't fail if this fails
      }
    }

    // Request reviewers if provided
    if (options.reviewers && options.reviewers.length > 0) {
      try {
        await githubRequest(
          `/pulls/${pr.number}/requested_reviewers`,
          'POST',
          { reviewers: options.reviewers },
          config
        );
      } catch {
        // Reviewers are optional, don't fail if this fails
      }
    }

    return pr;
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    throw new GitHubError(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update a file in the repository
 */
export async function updateFile(
  filePath: string,
  content: string,
  branch: string,
  message: string,
  config?: DependencyUpdaterConfig
): Promise<void> {
  try {
    // Get the current file to obtain its SHA
    const getResponse = await githubRequest(
      `/contents/${filePath}?ref=${branch}`,
      'GET',
      undefined,
      config
    );

    let sha: string | undefined;

    if (getResponse.ok) {
      const fileData = await getResponse.json();
      sha = fileData.sha;
    }

    // Update or create the file
    const contentEncoded = Buffer.from(content, 'utf-8').toString('base64');

    const response = await githubRequest(
      `/contents/${filePath}`,
      sha ? 'PUT' : 'POST',
      {
        message,
        content: contentEncoded,
        branch,
        sha,
      },
      config
    );

    if (!response.ok) {
      const error = await response.text();
      throw new GitHubError(`Failed to update file ${filePath}: ${error}`);
    }
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    throw new GitHubError(`Failed to update file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get pull request information
 */
export async function getPullRequest(
  prNumber: number,
  config?: DependencyUpdaterConfig
): Promise<GitHubPullRequest> {
  const response = await githubRequest(`/pulls/${prNumber}`, 'GET', undefined, config);
  if (!response.ok) {
    throw new GitHubError(`Failed to get PR #${prNumber}`);
  }
  return response.json();
}

/**
 * List pull requests with a specific label or head branch
 */
export async function listPullRequests(
  filters: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    labels?: string[];
  } = {},
  config?: DependencyUpdaterConfig
): Promise<GitHubPullRequest[]> {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.head) params.append('head', filters.head);

  let url = `/pulls?${params.toString()}`;
  const response = await githubRequest(url, 'GET', undefined, config);

  if (!response.ok) {
    return [];
  }

  let prs: GitHubPullRequest[] = await response.json();

  // Filter by labels if specified
  if (filters.labels && filters.labels.length > 0) {
    prs = prs.filter((pr) => {
      // We would need to fetch PR details to check labels
      // For now, return all and let caller filter
      return true;
    });
  }

  return prs;
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(
  prNumber: number,
  options: {
    commitTitle?: string;
    commitMessage?: string;
    method?: 'merge' | 'squash' | 'rebase';
  } = {},
  config?: DependencyUpdaterConfig
): Promise<void> {
  const response = await githubRequest(
    `/pulls/${prNumber}/merge`,
    'PUT',
    {
      commit_title: options.commitTitle,
      commit_message: options.commitMessage,
      merge_method: options.method || 'merge',
    },
    config
  );

  if (!response.ok) {
    const error = await response.text();
    throw new GitHubError(`Failed to merge PR #${prNumber}: ${error}`);
  }
}

/**
 * Close a pull request
 */
export async function closePullRequest(
  prNumber: number,
  config?: DependencyUpdaterConfig
): Promise<void> {
  await githubRequest(
    `/pulls/${prNumber}`,
    'PATCH',
    { state: 'closed' },
    config
  );
}

/**
 * Add a comment to a pull request or issue
 */
export async function addComment(
  prNumber: number,
  comment: string,
  config?: DependencyUpdaterConfig
): Promise<void> {
  await githubRequest(
    `/issues/${prNumber}/comments`,
    'POST',
    { body: comment },
    config
  );
}

/**
 * Get workflow runs for a branch
 */
export async function getWorkflowRuns(
  branch?: string,
  config?: DependencyUpdaterConfig
): Promise<WorkflowRun[]> {
  const params = new URLSearchParams();
  if (branch) params.append('branch', branch);

  const response = await githubRequest(
    `/actions/runs?${params.toString()}`,
    'GET',
    undefined,
    config
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return (data.workflow_runs || []).map((run: any) => ({
    id: run.id,
    runNumber: run.run_number,
    status: run.status,
    conclusion: run.conclusion,
    name: run.name,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  }));
}

/**
 * Wait for workflow runs to complete
 */
export async function waitForWorkflowCompletion(
  branch: string,
  timeoutMs: number = 30 * 60 * 1000, // 30 minutes default
  config?: DependencyUpdaterConfig
): Promise<WorkflowRun[]> {
  const startTime = Date.now();
  let completedRuns: WorkflowRun[] = [];
  const seenRunIds = new Set<number>();

  while (Date.now() - startTime < timeoutMs) {
    const runs = await getWorkflowRuns(branch, config);

    // Track new runs
    for (const run of runs) {
      if (!seenRunIds.has(run.id)) {
        seenRunIds.add(run.id);
      }
    }

    // Check if all workflows are complete
    const pendingRuns = runs.filter((r) => seenRunIds.has(r.id) && r.status !== 'completed');

    if (pendingRuns.length === 0 && seenRunIds.size > 0) {
      // All workflows complete
      completedRuns = runs.filter((r) => seenRunIds.has(r.id));
      break;
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
  }

  return completedRuns;
}

/**
 * Generate branch name for dependency update
 */
export function generateBranchName(
  packageName: string,
  newVersion: string,
  prefix: string = 'dep-update'
): string {
  const normalizedName = packageName.replace(/^@/, '').replace(/\//g, '-');
  const version = newVersion.replace(/^[\^~]/, '');
  return `${prefix}/${normalizedName}-${version}`;
}

/**
 * Generate PR title for dependency update
 */
export function generatePRTitle(
  packageName: string,
  newVersion: string,
  severity: UpdateSeverity
): string {
  const emoji = severity === 'major' ? '⚠️' : severity === 'minor' ? '✨' : '🐛';
  return `${emoji} Update ${packageName} to v${newVersion}`;
}

/**
 * Generate PR body for dependency update
 */
export function generatePRBody(dependencies: PackageDependency[], includeRollbackNotice: boolean = false): string {
  const lines: string[] = [
    '## Dependency Update',
    '',
    'This PR updates the following dependencies:',
    '',
  ];

  for (const dep of dependencies) {
    lines.push(`### ${dep.name}`);
    lines.push('');
    lines.push(`- **Current version:** \`${dep.currentVersion}\``);
    lines.push(`- **New version:** \`${dep.latestVersion}\``);
    lines.push(`- **Type:** ${dep.type}`);
    lines.push(`- **Severity:** ${dep.severity}`);

    if (dep.vulnerabilities && dep.vulnerabilities.length > 0) {
      lines.push(`- **Security fixes:** ${dep.vulnerabilities.length} vulnerability(s) addressed`);
      for (const vuln of dep.vulnerabilities) {
        lines.push(`  - ${vuln.id}: ${vuln.title} (${vuln.severity})`);
      }
    }

    if (dep.releaseUrl) {
      lines.push(`- **Release notes:** ${dep.releaseUrl}`);
    }

    lines.push('');
  }

  lines.push('## Checklist');
  lines.push('');
  lines.push('- [ ] All tests pass');
  lines.push('- [ ] No breaking changes for our usage');
  lines.push('- [ ] Documentation updated if needed');
  lines.push('');

  if (includeRollbackNotice) {
    lines.push('## Rollback Plan');
    lines.push('');
    lines.push('If this update causes issues, a rollback PR will be automatically created.');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*This PR was created automatically by the dependency updater.*');

  return lines.join('\n');
}

/**
 * Execute git commands locally for more complex operations
 */
export async function gitExec(
  args: string[],
  options: { cwd?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(`git ${args.join(' ')}`, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
  } catch (error) {
    throw new GitHubError(
      `Git command failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Clone or update a repository locally
 */
export async function ensureRepoLocal(
  repoUrl: string,
  localPath: string,
  branch: string = 'main'
): Promise<void> {
  try {
    // Try to fetch if repo exists
    await gitExec(['fetch', 'origin'], { cwd: localPath });
    await gitExec(['checkout', branch], { cwd: localPath });
    await gitExec(['pull', 'origin', branch], { cwd: localPath });
  } catch {
    // Clone if it doesn't exist
    await gitExec(['clone', '--branch', branch, '--depth', '1', repoUrl, localPath]);
  }
}
