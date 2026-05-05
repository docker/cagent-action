import { describe, expect, it } from 'vitest';
import { fetchGitHubAppCredentials } from '../github-app.js';

describe('fetchGitHubAppCredentials (integration)', () => {
  it('throws when AWS credentials are unavailable', async () => {
    await expect(fetchGitHubAppCredentials()).rejects.toThrow(
      'AWS Secrets Manager call failed',
    );
  });
});
