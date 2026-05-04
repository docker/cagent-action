import { execSync } from 'node:child_process';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { describe, expect, it } from 'vitest';

const ORG = 'docker';

interface Credentials {
  appId: string;
  privateKey: string;
}

const OP_REFS = {
  appId: 'op://Team AI Agent/Docker Agent GitHub Action/App ID',
  privateKey: 'op://Team AI Agent/Docker Agent GitHub Action/private-key.pem',
};

function getCredentials(): Credentials | undefined {
  // 1. Environment variables (set by setup-credentials in CI)
  const envAppId = process.env.GITHUB_APP_ID;
  const envKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (envAppId && envKey) return { appId: envAppId, privateKey: envKey };

  // 2. 1Password CLI (local dev)
  try {
    const appId = execSync(`op read "${OP_REFS.appId}"`, { encoding: 'utf8' }).trim();
    const privateKey = execSync(`op read "${OP_REFS.privateKey}"`, { encoding: 'utf8' }).trim();
    if (appId && privateKey) return { appId, privateKey };
  } catch {
    // op not available or not signed in
  }

  return undefined;
}

const credentials = getCredentials();

describe.skipIf(!credentials)('app-token integration', () => {
  const { appId, privateKey } = credentials ?? { appId: '', privateKey: '' };

  function createOctokit() {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId, privateKey },
    });
  }

  it('resolves the GitHub App identity', async () => {
    const { data } = await createOctokit().apps.getAuthenticated();
    expect(data?.slug).toBe('docker-agent');
  }, 10_000);

  it('fetches installation permissions', async () => {
    const octokit = createOctokit();
    const { data: org } = await octokit.apps.getOrgInstallation({ org: ORG });
    const { data: installation } = await octokit.apps.getInstallation({
      installation_id: org.id,
    });

    expect(installation.permissions).toBeTypeOf('object');
    expect(installation.permissions).toHaveProperty('contents');
    expect(installation.permissions).toHaveProperty('workflows');
  }, 10_000);

  it('generates an installation token with all permissions', async () => {
    const octokit = createOctokit();
    const { data: org } = await octokit.apps.getOrgInstallation({ org: ORG });
    const { data: installation } = await octokit.apps.getInstallation({
      installation_id: org.id,
    });

    const permissions = Object.fromEntries(
      Object.entries(installation.permissions ?? {}).filter(([, v]) => v != null),
    );

    const auth = createAppAuth({ appId, privateKey });
    const { token } = await auth({
      type: 'installation',
      installationId: org.id,
      permissions,
    });

    expect(token).toMatch(/^ghs_/);
  }, 10_000);
});
