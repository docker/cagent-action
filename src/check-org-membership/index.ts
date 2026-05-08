/**
 * check-org-membership — verify whether a GitHub user belongs to an org.
 *
 * Exported functions:
 *   checkOrgMembership(orgToken, org, username) → boolean
 *   resolvePrAuthor(repoToken, owner, repo, prNumber) → string
 *
 * CLI (node24 action, invoked via .github/actions/check-org-membership/action.yml):
 *   Inputs (via @actions/core.getInput):
 *     org-membership-token  PAT with read:org scope (for checkMembershipForUser)
 *     github-app-token      PAT with repo scope (for pulls.get when pr-source != 'event')
 *     org                   GitHub org name (e.g. "docker")
 *     pr-source             "event" | "trigger" | "input"
 *     pr-number             PR number as string (required when pr-source != 'event')
 *     comment-author        User login (required when pr-source == 'event')
 *   Standard env vars:
 *     GITHUB_REPOSITORY     "owner/repo" (standard GitHub Actions env var)
 *   Outputs (via @actions/core.setOutput):
 *     is_member             "true" | "false"
 *
 * Guard: the CLI entry point only executes when process.argv[1] ends with
 * "check-org-membership.js" and VITEST is not set. This prevents the CLI from
 * firing when this module is bundled into dist/mention-reply.js or dist/main.js
 * as a library dependency.
 */
import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Core function: membership check
// ---------------------------------------------------------------------------

/**
 * Check whether `username` is a member of `org`.
 * Uses `orgToken` (must have read:org scope) for the membership API.
 */
export async function checkOrgMembership(
  orgToken: string,
  org: string,
  username: string,
): Promise<boolean> {
  const octokit = new Octokit({ auth: orgToken });
  try {
    await octokit.rest.orgs.checkMembershipForUser({ org, username });
    return true;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 302) return false;
    if (status === 401) {
      throw Object.assign(
        new Error(
          'Org membership token is missing or invalid (HTTP 401). ' +
            "Ensure the job has 'id-token: write' permission and OIDC is configured.",
        ),
        { status: 401 },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Core function: PR author resolution
// ---------------------------------------------------------------------------

/**
 * Fetch the login of the PR author via the GitHub REST API.
 *
 * Uses `repoToken` (must have repo scope) — intentionally separate from
 * `orgToken` so the read:org token is never used for repo-scoped API calls.
 */
export async function resolvePrAuthor(
  repoToken: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const octokit = new Octokit({ auth: repoToken });
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return pr.user?.login ?? '';
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const orgToken = core.getInput('org-membership-token', { required: true });
  const repoToken = core.getInput('github-app-token', { required: true });
  const org = core.getInput('org', { required: true });
  const prSource = core.getInput('pr-source', { required: true });
  const prNumberStr = core.getInput('pr-number');
  const commentAuthor = core.getInput('comment-author');
  const repository = process.env.GITHUB_REPOSITORY ?? '';

  let username: string;

  if (prSource === 'event') {
    username = commentAuthor;
  } else {
    const prNumber = parseInt(prNumberStr, 10);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      core.setFailed(`Invalid pr-number: '${prNumberStr}' (expected positive integer)`);
      return;
    }
    const slashIdx = repository.indexOf('/');
    if (slashIdx < 0) {
      core.setFailed(`Invalid GITHUB_REPOSITORY: '${repository}' (expected 'owner/repo')`);
      return;
    }
    const owner = repository.slice(0, slashIdx);
    const repo = repository.slice(slashIdx + 1);
    try {
      username = await resolvePrAuthor(repoToken, owner, repo, prNumber);
    } catch (err: unknown) {
      core.setFailed(
        `Failed to resolve PR author for #${prNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  try {
    const isMember = await checkOrgMembership(orgToken, org, username);
    core.setOutput('is_member', String(isMember));
    if (isMember) {
      core.info(`✅ ${username} is a ${org} org member — proceeding with review`);
    } else {
      core.info(`⏭️ ${username} is not a ${org} org member — skipping review`);
    }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      core.setFailed(
        `❌ Org membership token is missing or invalid (HTTP 401).\n\n` +
          `This token is fetched automatically from AWS Secrets Manager in docker/* repos.\n` +
          `Ensure the workflow job has 'id-token: write' permission and OIDC is configured.`,
      );
    } else {
      core.setFailed(
        `Failed to check org membership: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// Guard: only run as CLI when invoked directly as dist/check-org-membership.js,
// never when bundled into dist/mention-reply.js or dist/main.js as a library.
if (process.argv[1]?.endsWith('check-org-membership.js') && !process.env.VITEST) {
  main().catch((err: unknown) => {
    core.setFailed(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  });
}
