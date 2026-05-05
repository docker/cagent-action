import { execSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { fetchGitHubAppCredentials } from '../github-app.js';

// NOTE: field names in the 1Password vault item follow the same convention as
// the existing 'App ID' and 'private-key.pem' fields. Update the paths below
// if the PAT and org-membership-token were stored under different field names.
const OP_REFS = {
  pat: 'op://Team AI Agent/Docker Agent GHA Machine user/PAT',
  orgMembershipToken: 'op://Team AI Agent/Docker Agent GHA Machine user/org-membership-token',
};

interface Credentials {
  pat: string;
  orgMembershipToken: string;
}

function getCredentials(): Credentials | undefined {
  // 1. Already exported by setup-credentials step in CI
  const envPat = process.env.GITHUB_APP_TOKEN;
  const envOrg = process.env.ORG_MEMBERSHIP_TOKEN;
  if (envPat && envOrg) return { pat: envPat, orgMembershipToken: envOrg };

  // 2. 1Password CLI (local dev)
  try {
    const pat = execSync(`op read "${OP_REFS.pat}"`, { encoding: 'utf8' }).trim();
    const orgMembershipToken = execSync(`op read "${OP_REFS.orgMembershipToken}"`, {
      encoding: 'utf8',
    }).trim();
    if (pat && orgMembershipToken) return { pat, orgMembershipToken };
  } catch {
    // op not available or not signed in
  }

  return undefined;
}

const credentials = getCredentials();

afterAll(() => {
  delete process.env.GITHUB_APP_TOKEN;
  delete process.env.ORG_MEMBERSHIP_TOKEN;
});

describe('fetchGitHubAppCredentials (integration — AWS unavailable)', () => {
  it.skipIf(!!credentials)('throws when AWS credentials are unavailable', async () => {
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('AWS Secrets Manager call failed');
  });
});

describe.skipIf(!credentials)('fetchGitHubAppCredentials (integration)', () => {
  it('exports GITHUB_APP_TOKEN and ORG_MEMBERSHIP_TOKEN', async () => {
    await expect(fetchGitHubAppCredentials()).resolves.toBeUndefined();
    expect(process.env.GITHUB_APP_TOKEN).toBeTruthy();
    expect(process.env.ORG_MEMBERSHIP_TOKEN).toBeTruthy();
  }, 10_000);
});
