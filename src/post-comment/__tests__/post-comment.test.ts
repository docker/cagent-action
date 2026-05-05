import { describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core');

const { mockCreateComment, MockOctokit } = vi.hoisted(() => {
  const mockCreateComment = vi.fn().mockResolvedValue({});

  class MockOctokit {
    rest = { issues: { createComment: mockCreateComment } };
  }

  return { mockCreateComment, MockOctokit };
});

vi.mock('@octokit/rest', () => ({ Octokit: MockOctokit }));

import { postComment } from '../index.js';

const TOKEN = 'fake-token';
const OWNER = 'docker';
const REPO = 'myrepo';
const ISSUE_NUMBER = 42;
const BODY = 'Hello from the agent.\n\n<!-- cagent-review-reply -->';

describe('postComment', () => {
  it('calls createComment with the correct parameters', async () => {
    await postComment(TOKEN, OWNER, REPO, ISSUE_NUMBER, BODY);

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      issue_number: ISSUE_NUMBER,
      body: BODY,
    });
  });

  it('propagates API errors to the caller', async () => {
    mockCreateComment.mockRejectedValueOnce(new Error('Forbidden'));

    await expect(postComment(TOKEN, OWNER, REPO, ISSUE_NUMBER, BODY)).rejects.toThrow('Forbidden');
  });
});
