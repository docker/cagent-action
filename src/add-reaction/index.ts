/**
 * add-reaction — post a reaction emoji on a GitHub issue comment.
 *
 * Exported function: addReaction(token, owner, repo, commentId, content)
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
