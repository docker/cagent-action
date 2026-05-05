import * as core from '@actions/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core');

const { mockCreateForIssueComment, MockOctokit } = vi.hoisted(() => {
  const mockCreateForIssueComment = vi.fn().mockResolvedValue({});

  class MockOctokit {
    rest = { reactions: { createForIssueComment: mockCreateForIssueComment } };
  }

  return { mockCreateForIssueComment, MockOctokit };
});

vi.mock('@octokit/rest', () => ({ Octokit: MockOctokit }));

import { addReaction } from '../index.js';

const TOKEN = 'fake-token';
const OWNER = 'docker';
const REPO = 'myrepo';
const COMMENT_ID = 99;

describe('addReaction', () => {
  it('calls createForIssueComment with the correct parameters', async () => {
    await addReaction(TOKEN, OWNER, REPO, COMMENT_ID, 'eyes');

    expect(mockCreateForIssueComment).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      comment_id: COMMENT_ID,
      content: 'eyes',
    });
  });

  it('supports other reaction types (e.g. +1)', async () => {
    await addReaction(TOKEN, OWNER, REPO, COMMENT_ID, '+1');
    expect(mockCreateForIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ content: '+1' }),
    );
  });

  it('warns and does not throw when the API call fails', async () => {
    mockCreateForIssueComment.mockRejectedValueOnce(new Error('Network error'));

    await expect(addReaction(TOKEN, OWNER, REPO, COMMENT_ID, 'eyes')).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });
});
