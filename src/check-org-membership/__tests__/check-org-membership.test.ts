import { describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core');

const { mockCheckMembershipForUser, MockOctokit } = vi.hoisted(() => {
  const mockCheckMembershipForUser = vi.fn().mockResolvedValue({}); // 204 = member

  class MockOctokit {
    rest = { orgs: { checkMembershipForUser: mockCheckMembershipForUser } };
  }

  return { mockCheckMembershipForUser, MockOctokit };
});

vi.mock('@octokit/rest', () => ({ Octokit: MockOctokit }));

import { checkOrgMembership } from '../index.js';

const ORG_TOKEN = 'fake-org-token';
const ORG = 'docker';
const USERNAME = 'alice';

describe('checkOrgMembership', () => {
  it('returns true when the API returns 204 (member confirmed)', async () => {
    mockCheckMembershipForUser.mockResolvedValueOnce({});

    const result = await checkOrgMembership(ORG_TOKEN, ORG, USERNAME);

    expect(result).toBe(true);
    expect(mockCheckMembershipForUser).toHaveBeenCalledWith({ org: ORG, username: USERNAME });
  });

  it('returns false when the API returns 404 (not a member)', async () => {
    mockCheckMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );

    const result = await checkOrgMembership(ORG_TOKEN, ORG, USERNAME);

    expect(result).toBe(false);
  });

  it('returns false when the API returns 302 (token lacks org visibility)', async () => {
    mockCheckMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('Found'), { status: 302 }),
    );

    const result = await checkOrgMembership(ORG_TOKEN, ORG, USERNAME);

    expect(result).toBe(false);
  });

  it('throws a descriptive error when the API returns 401 (bad token)', async () => {
    mockCheckMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    await expect(checkOrgMembership(ORG_TOKEN, ORG, USERNAME)).rejects.toThrow(/HTTP 401/);
  });

  it('re-throws unexpected errors', async () => {
    mockCheckMembershipForUser.mockRejectedValueOnce(
      Object.assign(new Error('Internal Server Error'), { status: 500 }),
    );

    await expect(checkOrgMembership(ORG_TOKEN, ORG, USERNAME)).rejects.toThrow(
      'Internal Server Error',
    );
  });
});
