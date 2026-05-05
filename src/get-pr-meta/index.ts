/**
 * get-pr-meta — fetch core metadata for a GitHub pull request.
 *
 * Exported function: getPrMeta(token, owner, repo, prNumber) → PrMeta
 * Standalone action: reads inputs via core.getInput, sets outputs.
 *
 * Outputs: title, body, author-login, base-ref-name
 */
import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrMeta {
  title: string;
  body: string;
  authorLogin: string;
  baseRefName: string;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Fetch title, description, author, and base branch for pull request `prNumber`.
 */
export async function getPrMeta(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrMeta> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return {
    title: data.title,
    body: data.body ?? 'No description provided.',
    authorLogin: data.user?.login ?? 'unknown',
    baseRefName: data.base.ref,
  };
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
  const prNumber = parseInt(core.getInput('pr-number', { required: true }), 10);

  const meta = await getPrMeta(token, owner, repo, prNumber);

  core.setOutput('title', meta.title);
  core.setOutput('body', meta.body);
  core.setOutput('author-login', meta.authorLogin);
  core.setOutput('base-ref-name', meta.baseRefName);
}

if (!process.env.VITEST) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
