/**
 * add-reaction — post a reaction emoji on a GitHub issue comment.
 *
 * Exported function: addReaction(token, owner, repo, commentId, content)
 * Standalone action: reads inputs via core.getInput, runs addReaction.
 *
 * Output: none (best-effort; logs a warning on failure instead of failing).
 */
import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReactionContent =
  | '+1'
  | '-1'
  | 'laugh'
  | 'confused'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes';

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Post a reaction on a GitHub issue comment (best-effort — warns on failure).
 */
export async function addReaction(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  content: ReactionContent,
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      content,
    });
  } catch (err) {
    core.warning(
      `Failed to add ${content} reaction: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Standalone action entrypoint
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const token =
    process.env.GITHUB_APP_TOKEN ??
    process.env.GITHUB_TOKEN ??
    core.getInput('github-token', { required: true });
  const owner = core.getInput('owner', { required: true });
  const repo = core.getInput('repo', { required: true });
  const commentId = parseInt(core.getInput('comment-id', { required: true }), 10);
  const content = (core.getInput('content') || 'eyes') as ReactionContent;

  await addReaction(token, owner, repo, commentId, content);
}

if (!process.env.VITEST) {
  run().catch((err: unknown) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
