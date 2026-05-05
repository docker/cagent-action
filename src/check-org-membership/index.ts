/**
 * check-org-membership — verify whether a GitHub user belongs to an org.
 *
 * Exported function: checkOrgMembership(orgToken, org, username) → boolean
 * Standalone action: reads inputs via core.getInput, sets is-member output.
 *
 * HTTP 204 → true (member confirmed).
 * HTTP 302/404 → false (not a member or token lacks visibility).
 * HTTP 401 → throws a descriptive error (bad token).
 */
import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Core function
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
      throw new Error(
        'Org membership token is missing or invalid (HTTP 401). ' +
          "Ensure the job has 'id-token: write' permission and OIDC is configured.",
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Standalone action entrypoint
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const orgToken =
    process.env.ORG_MEMBERSHIP_TOKEN ?? core.getInput('org-membership-token', { required: true });
  const org = core.getInput('org', { required: true });
  const username = core.getInput('username', { required: true });

  const isMember = await checkOrgMembership(orgToken, org, username);
  core.setOutput('is-member', String(isMember));
  core.info(
    isMember ? `✅ ${username} is a ${org} org member` : `⏭️ ${username} is not a ${org} org member`,
  );
}

if (!process.env.VITEST) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
