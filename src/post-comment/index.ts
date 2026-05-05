/**
 * post-comment — create a comment on a GitHub issue or pull request.
 *
 * Exported function: postComment(token, owner, repo, issueNumber, body)
 * Standalone action: reads inputs via core.getInput, runs postComment.
 *
 * Uses the Issues API (/issues/{number}/comments) which works for both
 * plain issues and pull requests.
 */
import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Post `body` as a new comment on issue/PR `issueNumber`.
 */
export async function postComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

// ---------------------------------------------------------------------------
// Standalone action entrypoint
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const token =
    process.env.GITHUB_APP_TOKEN ??
    process.env.GITHUB_TOKEN ??
    core.getInput('github-token', { required: true });
  const owner = core.getInput('owner', { required: true });
  const repo = core.getInput('repo', { required: true });
  const issueNumber = parseInt(core.getInput('issue-number', { required: true }), 10);
  const body = core.getInput('body', { required: true });

  await postComment(token, owner, repo, issueNumber, body);
}

if (!process.env.VITEST) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
