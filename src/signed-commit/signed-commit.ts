import type { Octokit } from '@octokit/rest';

export interface FileAddition {
  path: string;
  contents: string; // base64-encoded
}

export interface FileDeletion {
  path: string;
}

export interface SignedCommitOptions {
  repo: string; // "owner/repo"
  branch: string; // target branch name
  message: string; // commit headline
  body?: string; // commit body
  baseRef?: string; // create/reset branch from this ref
  force?: boolean; // force-update branch if it exists
  additions: FileAddition[];
  deletions?: FileDeletion[];
}

interface CommitResponse {
  createCommitOnBranch: {
    commit: {
      oid: string;
      url: string;
    };
  };
}

const CREATE_COMMIT_MUTATION = `
  mutation($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
        url
      }
    }
  }
`;

export async function createSignedCommit(
  octokit: Octokit,
  options: SignedCommitOptions,
): Promise<string> {
  const { repo, branch, message, body, baseRef, force = false, additions, deletions } = options;

  if (!repo.includes('/')) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }

  const hasAdditions = additions.length > 0;
  const hasDeletions = deletions !== undefined && deletions.length > 0;

  if (!hasAdditions && !hasDeletions) {
    throw new Error('At least one file addition or deletion is required.');
  }

  const [owner, repoName] = repo.split('/');

  let headSha: string;

  if (baseRef) {
    // Get SHA from the base ref, then create or update the target branch
    const { data } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${baseRef}`,
    });
    headSha = data.object.sha;

    if (force) {
      try {
        await octokit.rest.git.updateRef({
          owner,
          repo: repoName,
          ref: `heads/${branch}`,
          sha: headSha,
          force: true,
        });
      } catch (err: unknown) {
        const status =
          err !== null && typeof err === 'object' && 'status' in err
            ? (err as { status: number }).status
            : undefined;
        const errMessage =
          err !== null &&
          typeof err === 'object' &&
          typeof (err as Record<string, unknown>).message === 'string'
            ? (err as { message: string }).message
            : '';
        if (status === 404 || (status === 422 && errMessage.includes('Reference does not exist'))) {
          // Branch doesn't exist yet — create it
          await octokit.rest.git.createRef({
            owner,
            repo: repoName,
            ref: `refs/heads/${branch}`,
            sha: headSha,
          });
        } else if (status === 422) {
          // Branch exists but force-update failed (e.g. a stale branch left over from a
          // previous run that committed files GitHub can no longer reconcile against the
          // new base).  Destroy it and start fresh.
          try {
            await octokit.rest.git.deleteRef({
              owner,
              repo: repoName,
              ref: `heads/${branch}`,
            });
          } catch {
            // Ignore — the branch may have been concurrently deleted.
          }
          await octokit.rest.git.createRef({
            owner,
            repo: repoName,
            ref: `refs/heads/${branch}`,
            sha: headSha,
          });
        } else {
          throw err;
        }
      }
    } else {
      // Will throw 422 if the branch already exists
      await octokit.rest.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${branch}`,
        sha: headSha,
      });
    }
  } else {
    // No baseRef — commit directly onto the existing branch
    const { data } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
    });
    headSha = data.object.sha;
  }

  // Build fileChanges, omitting empty keys
  const fileChanges: {
    additions?: FileAddition[];
    deletions?: FileDeletion[];
  } = {};

  if (hasAdditions) {
    fileChanges.additions = additions;
  }

  if (hasDeletions) {
    fileChanges.deletions = deletions;
  }

  const messageInput: { headline: string; body?: string } = { headline: message };
  if (body) {
    messageInput.body = body;
  }

  const input = {
    branch: {
      repositoryNameWithOwner: `${owner}/${repoName}`,
      branchName: branch,
    },
    message: messageInput,
    fileChanges,
    expectedHeadOid: headSha,
  };

  const response = await octokit.graphql<CommitResponse>(CREATE_COMMIT_MUTATION, { input });

  const oid = response?.createCommitOnBranch?.commit?.oid;
  if (!oid) {
    throw new Error(`GraphQL mutation returned null OID. Response: ${JSON.stringify(response)}`);
  }

  return oid;
}
