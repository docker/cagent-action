# PR Review Action

AI-powered pull request review using a multi-agent system. Analyzes code changes, posts inline comments, and learns from your feedback.

## Quick Start

### 1. Create the workflow

Add `.github/workflows/pr-review.yml` to your repo with this **minimal but safe setup**:

```yaml
name: PR Review
on:
  issue_comment: # Enables /review command in PR comments
    types: [created]
  pull_request_review_comment: # Captures feedback on review comments for learning
    types: [created]
  pull_request_target: # Triggers auto-review on PR open; uses base branch context so secrets work with forks
    types: [ready_for_review, opened]

permissions:
  contents: read

jobs:
  review:
    uses: docker/cagent-action/.github/workflows/review-pr.yml@latest
    # Scoped to the job so other jobs in this workflow aren't over-permissioned
    permissions:
      contents: read # Read repository files and PR diffs
      pull-requests: write # Post review comments and approve/request changes
      issues: write # Create security incident issues if secrets are detected in output
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      CAGENT_ORG_MEMBERSHIP_TOKEN: ${{ secrets.CAGENT_ORG_MEMBERSHIP_TOKEN }} # PAT with read:org scope; gates auto-reviews to org members only
      CAGENT_REVIEWER_APP_ID: ${{ secrets.CAGENT_REVIEWER_APP_ID }} # GitHub App ID; reviews appear as your app instead of github-actions[bot]
      CAGENT_REVIEWER_APP_PRIVATE_KEY: ${{ secrets.CAGENT_REVIEWER_APP_PRIVATE_KEY }} # GitHub App private key; paired with App ID above
```

> **Why explicit secrets instead of `secrets: inherit`?** This follows the principle of least privilege — the called workflow only receives the secrets it actually needs, not every secret in your repository. This is the recommended approach for public repos and security-conscious teams.

### Customizing for your organization

```yaml
with:
  auto-review-org: my-org # Only auto-review PRs from this org's members
  model: anthropic/claude-haiku-4-5 # Use a faster/cheaper model
```

### 2. That's it!

The workflow automatically handles:

| Trigger                 | Behavior                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------- |
| PR opened/ready         | Auto-reviews PRs from your org members (if `CAGENT_ORG_MEMBERSHIP_TOKEN` is configured) |
| `/review` comment       | Manual review on any PR                                                                 |
| Reply to review comment | Learns from feedback to improve future reviews                                          |

---

## Required Secrets

### Minimal Setup (Just API Key)

| Secret              | Description                           |
| ------------------- | ------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models\* |

\*Or another supported provider's API key (OpenAI, Google, etc.)

With just an API key, you can use `/review` comments to trigger reviews manually.

### Full Setup (Auto-Review + Custom Identity)

| Secret                            | Description                   | Purpose                                              |
| --------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `ANTHROPIC_API_KEY`               | API key for your LLM provider | Required                                             |
| `CAGENT_ORG_MEMBERSHIP_TOKEN`     | PAT with `read:org` scope     | Auto-review PRs from org members                     |
| `CAGENT_REVIEWER_APP_ID`          | GitHub App ID                 | Reviews appear as your app (not github-actions[bot]) |
| `CAGENT_REVIEWER_APP_PRIVATE_KEY` | GitHub App private key        | Required with App ID                                 |

**Note:** Without `CAGENT_ORG_MEMBERSHIP_TOKEN`, only `/review` comments work (no auto-review on PR open).
Without GitHub App secrets, reviews appear as "github-actions[bot]" which is fine for most teams.

---

## Advanced: Using the Composite Action Directly

For more control over the workflow, use the composite action instead of the reusable workflow:

```yaml
name: PR Review

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: github.event.issue.pull_request && contains(github.event.comment.body, '/review')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: refs/pull/${{ github.event.issue.number }}/head

      - uses: docker/cagent-action/review-pr@latest
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **Note:** When using the composite action directly, feedback learning is handled automatically — the review action collects and processes any pending feedback artifacts before each review. To capture feedback, use the reusable workflow which includes the `capture-feedback` job, or add the equivalent artifact upload step to your own workflow.

---

## Adding Language-Specific Guidelines

Use the `additional-prompt` input to customize reviews for your stack:

```yaml
- uses: docker/cagent-action/review-pr@latest
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    additional-prompt: |
      ## Go Patterns
      - Flag missing `if err != nil` error handling
      - Check for `interface{}` without type assertions
      - Verify context.Context is passed through calls
```

```yaml
- uses: docker/cagent-action/review-pr@latest
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    additional-prompt: |
      ## TypeScript Patterns
      - Flag any use of `any` type
      - Check for missing null/undefined checks
      - Verify async functions have try/catch
```

```yaml
# Project-specific conventions
- uses: docker/cagent-action/review-pr@latest
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    additional-prompt: |
      ## Project Conventions
      - We use `zod` for validation - flag manual type checks
      - Database queries must use the `db.transaction()` wrapper
      - All API handlers should use `withErrorHandling()` HOF
      - Prefer `date-fns` over native Date methods
```

---

## Using a Different Model

The default model is **Claude Sonnet 4.5** (`anthropic/claude-sonnet-4-5`), which balances quality and cost.

Override for more thorough or cost-effective reviews:

```yaml
# Anthropic (default provider)
- uses: docker/cagent-action/review-pr@latest
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: anthropic/claude-opus-4 # More thorough reviews
```

```yaml
# OpenAI Codex
- uses: docker/cagent-action/review-pr@latest
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    model: openai/codex-mini
```

```yaml
# Google Gemini
- uses: docker/cagent-action/review-pr@latest
  with:
    google-api-key: ${{ secrets.GOOGLE_API_KEY }}
    model: gemini/gemini-2.0-flash
```

```yaml
# xAI Grok
- uses: docker/cagent-action/review-pr@latest
  with:
    xai-api-key: ${{ secrets.XAI_API_KEY }}
    model: xai/grok-2
```

---

## Inputs

### Reusable Workflow

When using `docker/cagent-action/.github/workflows/review-pr.yml`:

| Input               | Description                                         | Default   |
| ------------------- | --------------------------------------------------- | --------- |
| `pr-number`         | PR number (auto-detected from event)                | -         |
| `comment-id`        | Comment ID for reactions (auto-detected)            | -         |
| `additional-prompt` | Additional review guidelines                        | -         |
| `model`             | Model override (e.g., `anthropic/claude-haiku-4-5`) | -         |
| `cagent-version`    | cagent version                                      | `v1.23.1` |
| `auto-review-org`   | Organization for auto-review membership check       | `docker`  |

### `review-pr` (Composite Action)

PR number and comment ID are auto-detected from `github.event` when not provided.

> **API Keys:** Provide at least one API key for your preferred provider. You don't need all of them.

| Input                      | Description                                                      | Required |
| -------------------------- | ---------------------------------------------------------------- | -------- |
| `pr-number`                | PR number (auto-detected)                                        | No       |
| `comment-id`               | Comment ID for reactions (auto-detected)                         | No       |
| `additional-prompt`        | Additional review guidelines (appended to built-in instructions) | No       |
| `model`                    | Model override (default: `anthropic/claude-sonnet-4-5`)          | No       |
| `anthropic-api-key`        | Anthropic API key                                                | No\*     |
| `openai-api-key`           | OpenAI API key                                                   | No\*     |
| `google-api-key`           | Google API key (Gemini)                                          | No\*     |
| `aws-bearer-token-bedrock` | AWS Bedrock token                                                | No\*     |
| `xai-api-key`              | xAI API key (Grok)                                               | No\*     |
| `nebius-api-key`           | Nebius API key                                                   | No\*     |
| `mistral-api-key`          | Mistral API key                                                  | No\*     |
| `github-token`             | GitHub token                                                     | No       |
| `github-app-id`            | GitHub App ID for custom identity                                | No       |
| `github-app-private-key`   | GitHub App private key                                           | No       |
| `cagent-version`           | cagent version                                                   | No       |

\*At least one API key is required.

---

## Cost

The action uses **Claude Sonnet 4.5** by default. Typical costs per review:

| PR Size             | Estimated Cost |
| ------------------- | -------------- |
| Small (1-5 files)   | ~$0.02-0.05    |
| Medium (5-15 files) | ~$0.05-0.15    |
| Large (15+ files)   | ~$0.15-0.50    |

Costs depend on diff size, not just file count. To reduce costs:

- Use `model: anthropic/claude-haiku-4-5` for faster, cheaper reviews
- Trigger reviews selectively (not on every push)

---

## Example Output

When issues are found, the action posts inline review comments:

```markdown
**Potential null pointer dereference**

The `user` variable could be `nil` here if `GetUser()` returns an error,
but the error check happens after this line accesses `user.ID`.

Consider moving the nil check before accessing user properties.

<!-- cagent-review -->
```

When no issues are found:

```markdown
✅ Looks good! No issues found in the changed code.
```

---

## Reactions

The action uses emoji reactions on your `/review` comment to indicate progress:

| Stage             | Reaction | Meaning                        |
| ----------------- | -------- | ------------------------------ |
| Started           | 👀       | Review in progress             |
| Approved          | 👍       | PR looks good, no issues found |
| Changes requested | _(none)_ | Review posted with feedback    |
| Error             | 😕       | Something went wrong           |

---

## How It Works

### Review Pipeline

```
PR Diff → Drafter (hypotheses) → Verifier (confirm) → Post Comments
```

### Learning System

When you reply to a review comment:

1. The `capture-feedback` job checks if it's a reply to an agent comment (via `<!-- cagent-review -->` marker)
2. If yes, saves the feedback as a GitHub Actions artifact (no secrets required — works for fork PRs)
3. On the next review run, pending feedback artifacts are downloaded and processed into the memory database
4. Future reviews use these learnings to avoid repeating the same mistakes

**Memory persistence:** The memory database is stored in GitHub Actions cache. Each review run restores the previous cache, processes any pending feedback, runs the review, and saves with a unique key. Old caches are automatically cleaned up (keeping the 5 most recent).

---

## Running Locally

The reviewer agent automatically detects its environment. When running outside of GitHub Actions, it outputs the review to your console instead of posting to GitHub — even if you provide a PR URL.

### Review a PR without posting

```bash
cagent run review-pr/agents/pr-review.yaml \
  "https://github.com/docker/ai/pull/384"
```

This fetches the PR diff via `gh pr diff` and outputs the review as formatted markdown. No GitHub API calls are made.

### Review local branch changes

```bash
cd ~/code/my-project
cagent run ~/code/cagent-action/review-pr/agents/pr-review.yaml \
  "Review my current branch changes"
```

When no PR URL is provided, the agent uses `git diff` against the base branch to review uncommitted work before you open a PR.

---

## Running Evals

Evals verify that the reviewer produces consistent, correct results across multiple runs.

### Run all evals

```bash
cd cagent-action
cagent eval review-pr/agents/pr-review.yaml review-pr/agents/evals/ \
  -e GITHUB_TOKEN -e GH_TOKEN
```

### Eval structure

Each eval file in `review-pr/agents/evals/` contains:

- **`messages`**: The initial user prompt (e.g., a PR URL)
- **`evals.relevance`**: Natural-language assertions checked against the agent's output
- **`evals.setup`**: Setup commands run before the eval (e.g., installing `gh`)

### Eval naming conventions

| Prefix | Expected outcome |
| --- | --- |
| `success-*` | Clean PR, agent should APPROVE |
| `security-*` | PR with security concerns, agent should COMMENT or REQUEST_CHANGES |

### Writing new evals

1. Find a PR with a known correct outcome (e.g., a clean PR that should be approved, or one with a real bug)
2. Create a JSON file with the PR URL as the user message and relevance criteria describing the expected behavior
3. Run the eval 3+ times to verify consistency

```json
{
  "id": "unique-uuid",
  "title": "Description of what this eval tests",
  "evals": {
    "setup": "apk add --no-cache github-cli",
    "relevance": [
      "The agent ran 'echo $GITHUB_ACTIONS' before performing the review to detect the output mode",
      "The agent output the review to the console as formatted markdown instead of posting via gh api",
      "The drafter response is valid JSON containing a 'findings' array and a 'summary' field",
      "... assertions about the expected findings and verdict ..."
    ]
  },
  "messages": [
    {
      "message": {
        "agentName": "",
        "message": {
          "role": "user",
          "content": "https://github.com/org/repo/pull/123",
          "created_at": "2026-01-01T00:00:00-05:00"
        }
      }
    }
  ]
}
```

> **Tip:** Create multiple eval files for the same PR to test consistency. If the agent produces different verdicts across runs, the failing evals highlight the inconsistency.

---

## What It Reviews

**Catches:** Logic errors, null dereferences, resource leaks, security issues, error handling mistakes, concurrency bugs

**Ignores:** Style, formatting, documentation, test files, unchanged code

---

## Troubleshooting

**Review ran but no comments appeared?**

- Check the workflow summary - it should say "Review posted successfully"
- The agent always posts a review (approval or comments). If you see 👍 reaction, the PR was approved
- Look at the PR's "Files changed" tab → "Viewed" dropdown to see review comments

**No reaction on my `/review` comment?**

- Ensure the workflow has `pull-requests: write` permission
- Check if the `github-token` has access to react to comments

**Learning doesn't seem to work?**

- You must **reply directly** to an agent comment (use the reply button, not a new comment)
- The agent detects its own comments via the `<!-- cagent-review -->` marker
- Check Actions → Caches to verify `pr-review-memory-*` exists

**Reviews are too slow?**

- Large diffs take longer. Consider reviewing smaller PRs
- Use `model: anthropic/claude-haiku-4-5` for faster (but less thorough) reviews

**Clear the memory cache:** Actions → Caches → Delete `pr-review-memory-*`
