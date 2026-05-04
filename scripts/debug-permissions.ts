/**
 * Debug script: inspect GitHub App and installation permissions, then attempt token generation.
 *
 * Credentials are resolved in order:
 *   1. GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY env vars (if set)
 *   2. 1Password CLI (`op read`)
 *
 * Usage:
 *   npx tsx scripts/debug-permissions.ts
 */

import { execSync } from 'node:child_process';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

const ORG = 'docker';

const OP_REFS = {
  appId: 'op://Team AI Agent/Docker Agent GitHub Action/App ID',
  privateKey: 'op://Team AI Agent/Docker Agent GitHub Action/private-key.pem',
};

function opRead(ref: string): string {
  return execSync(`op read "${ref}"`, { encoding: 'utf-8' }).trim();
}

function getCredentials(): { appId: string; privateKey: string } {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (appId && privateKey) {
    console.log('Using credentials from environment variables');
    return { appId, privateKey };
  }

  try {
    console.log('Fetching credentials from 1Password...');
    return {
      appId: opRead(OP_REFS.appId),
      privateKey: opRead(OP_REFS.privateKey),
    };
  } catch {
    console.error('Could not resolve credentials.');
    console.error('Either set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY env vars,');
    console.error('or install the 1Password CLI: https://developer.1password.com/docs/cli/');
    process.exit(1);
  }
}

async function main() {
  const { appId, privateKey } = getCredentials();

  console.log(`App ID: ${appId}`);

  // 1. Authenticate as the App
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });

  // (a) App-level permissions — what the App is configured to request
  const { data: app } = await appOctokit.apps.getAuthenticated();
  if (app) {
    console.log(`\nApp name: ${app.name}`);
    console.log(`App slug: ${app.slug}`);
    console.log(`App settings: https://github.com/organizations/${ORG}/settings/apps/${app.slug}`);
    console.log('\nApp-level permissions (what the app is configured to request):');
    console.log(JSON.stringify(app.permissions, null, 2));
  }
  // 2. Get org installation ID
  let installationId: number;
  try {
    const { data } = await appOctokit.apps.getOrgInstallation({ org: ORG });
    installationId = data.id;
  } catch {
    console.error(`\n❌ App is not installed on org "${ORG}"`);
    process.exit(1);
  }
  console.log(`\nInstallation ID: ${installationId}`);
  console.log(
    `Installation settings: https://github.com/organizations/${ORG}/settings/installations/${installationId}`,
  );

  // (b) Installation-level permissions — what the org has actually granted
  const { data: installation } = await appOctokit.apps.getInstallation({
    installation_id: installationId,
  });

  console.log('\nInstallation-level permissions (what the org has granted):');
  console.log(JSON.stringify(installation.permissions, null, 2));

  // (c) Attempt token generation using the installation's own permissions
  console.log('\n--- Token generation test (using installation permissions) ---');
  const permissions = Object.fromEntries(
    Object.entries(installation.permissions ?? {}).filter(([, v]) => v != null),
  );
  const auth = createAppAuth({ appId, privateKey });
  try {
    const { token } = await auth({
      type: 'installation',
      installationId,
      permissions,
    });
    console.log(`✅ Token generated successfully (${token.slice(0, 8)}...)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ Token generation failed: ${msg}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
