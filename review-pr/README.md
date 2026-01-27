# PR Review Action

AI-powered pull request review using a multi-agent system. Analyzes code changes, posts inline comments, and learns from your feedback.

## Quick Start

### 1. Create the workflow

Add `.github/workflows/pr-review.yml` to your repo:

```yaml
name: PR Review

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
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
          fetch-depth: 0  # Full history needed for accurate diffs

      - uses: docker/cagent-action/review-pr@latest
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

  learn:
    # Triggers when someone REPLIES to a review comment (for learning from feedback)
    if: github.event_name == 'pull_request_review_comment' && github.event.comment.in_reply_to_id
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/cagent-action/review-pr/learn@latest
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Add your API key

**Settings** → **Secrets and variables** → **Actions** → Add `ANTHROPIC_API_KEY`

> **Note:** You only need ONE API key. The examples use Anthropic, but you can use any supported provider (OpenAI, Google, xAI, etc.).

### 3. Use it

- Comment `/review` on any PR to trigger a review
- **Reply directly** to review comments to teach the agent (the learning system detects replies to its own comments)

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
    model: anthropic/claude-opus-4  # More thorough reviews
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

### `review-pr`

PR number and comment ID are auto-detected from `github.event` when not provided.

> **API Keys:** Provide at least one API key for your preferred provider. You don't need all of them.

| Input | Description | Required |
|-------|-------------|----------|
| `pr-number` | PR number (auto-detected) | No |
| `comment-id` | Comment ID for reactions (auto-detected) | No |
| `additional-prompt` | Additional review guidelines (appended to built-in instructions) | No |
| `model` | Model override (default: `anthropic/claude-sonnet-4-5`) | No |
| `anthropic-api-key` | Anthropic API key | No* |
| `openai-api-key` | OpenAI API key | No* |
| `google-api-key` | Google API key (Gemini) | No* |
| `aws-bearer-token-bedrock` | AWS Bedrock token | No* |
| `xai-api-key` | xAI API key (Grok) | No* |
| `nebius-api-key` | Nebius API key | No* |
| `mistral-api-key` | Mistral API key | No* |
| `github-token` | GitHub token | No |
| `cagent-version` | CAgent version | No |

*At least one API key is required.

### `review-pr/learn`

Comment data is read automatically from `github.event.comment`.

| Input | Description | Required |
|-------|-------------|----------|
| `anthropic-api-key` | Anthropic API key | No |
| `openai-api-key` | OpenAI API key | No |
| `google-api-key` | Google API key (Gemini) | No |
| `aws-bearer-token-bedrock` | AWS Bedrock token | No |
| `xai-api-key` | xAI API key (Grok) | No |
| `nebius-api-key` | Nebius API key | No |
| `mistral-api-key` | Mistral API key | No |
| `github-token` | GitHub token | No |
| `model` | Model override | No |
| `cagent-version` | CAgent version | No |

---

## Cost

The action uses **Claude Sonnet 4.5** by default. Typical costs per review:

| PR Size | Estimated Cost |
|---------|----------------|
| Small (1-5 files) | ~$0.02-0.05 |
| Medium (5-15 files) | ~$0.05-0.15 |
| Large (15+ files) | ~$0.15-0.50 |

Costs depend on diff size, not just file count. To reduce costs:
- Use `model: anthropic/claude-haiku-4` for faster, cheaper reviews
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

| Stage | Reaction | Meaning |
|-------|----------|---------|
| Started | 👀 | Review in progress |
| Approved | 👍 | PR looks good, no issues found |
| Changes requested | *(none)* | Review posted with feedback |
| Error | 😕 | Something went wrong |

---

## How It Works

### Review Pipeline

```
PR Diff → Drafter (hypotheses) → Verifier (confirm) → Post Comments
```

### Learning System

When you reply to a review comment:
1. Action checks if it's a reply to an agent comment
2. If yes, processes your feedback
3. Stores learnings in a memory database (cached per-repo)
4. Future reviews avoid the same mistakes

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
- Use `model: anthropic/claude-haiku-4` for faster (but less thorough) reviews

**Clear the memory cache:** Actions → Caches → Delete `pr-review-memory-*`
