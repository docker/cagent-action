import { afterAll, describe, expect, it } from 'vitest';
import { fetchGitHubAppCredentials } from '../github-app.js';

const hasAwsCredentials = Boolean(
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL || // OIDC in CI
    process.env.AWS_ACCESS_KEY_ID || // explicit key locally
    process.env.AWS_PROFILE, // named profile locally
);

afterAll(() => {
  delete process.env.GITHUB_APP_TOKEN;
  delete process.env.ORG_MEMBERSHIP_TOKEN;
});

describe('fetchGitHubAppCredentials (integration)', () => {
  it.skipIf(hasAwsCredentials)('throws when AWS credentials are unavailable', async () => {
    await expect(fetchGitHubAppCredentials()).rejects.toThrow('AWS Secrets Manager call failed');
  });

  it.skipIf(!hasAwsCredentials)(
    'resolves and exports env vars when AWS credentials are available',
    async () => {
      await expect(fetchGitHubAppCredentials()).resolves.toBeUndefined();
      expect(process.env.GITHUB_APP_TOKEN).toBeTruthy();
      expect(process.env.ORG_MEMBERSHIP_TOKEN).toBeTruthy();
    },
  );
});
