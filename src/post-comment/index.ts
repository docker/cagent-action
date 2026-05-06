/**
 * post-comment — create a comment on a GitHub issue or pull request.
 *
 * Exported function: postComment(token, owner, repo, issueNumber, body)
 *
 * Uses the Issues API (/issues/{number}/comments) which works for both
 * plain issues and pull requests.
 */
import { Octokit } from '@octokit/rest';

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Post `body` as a new comment on issue/PR `issueNumber`.
 */
export async function postComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}
