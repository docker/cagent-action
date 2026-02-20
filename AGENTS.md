# AGENTS.md

GitHub Action (`docker/cagent-action`) that runs Docker Agent in CI. Primary use case: AI-powered PR reviews via a multi-agent pipeline (drafter, verifier, reviewer).

## Security Rules (highest priority)

- **No `eval` on user input.** Commands are built with bash arrays (`ARGS+=(...)`), never `eval`.
- **API keys must be masked.** Every key needs `echo "::add-mask::$VAR"` before any command that could log it.
- **Authorization roles are hardcoded** in `check-auth.sh`. Must not be configurable via inputs.
- **Secret patterns live only in `security/secret-patterns.sh`.** Don't duplicate them elsewhere.
- **Output scanning is unconditional.** The "Sanitize output" step uses `if: always()`. Don't gate it behind success checks.
- **`pull_request_target` is intentional** — secrets available for fork PRs. Safe because the agent only reads, never executes PR code. Flag any change that introduces code execution from PR head.
- **Pin third-party actions by SHA**, not tags. Using `@v4` instead of a full SHA is a supply-chain risk.
- **Least-privilege permissions.** Each job declares only what it needs. `capture-feedback` intentionally uses only `github.token` (no secrets).

## Agent Contract

- **Only review changed code** — drafter must only flag `+` lines. The `in_diff` / `in_changed_code` fields enforce this.
- **Verdicts are mechanical** — APPROVE / COMMENT / REQUEST_CHANGES is a strict lookup table, not LLM judgment.
- **Structured output schemas use `strict: true`** with `additionalProperties: false`. Don't loosen them.
- **Mode detection first** — root agent runs `echo $GITHUB_ACTIONS` to choose CI vs local output mode.
- **Toolsets are scoped** — sub-agents only get `read_file` / `read_multiple_files`. Only root has shell/memory. Don't give sub-agents shell access.
- **Model aliases** — `models:` block defines aliases (`sonnet`, `haiku`). Change underlying models freely; changing alias names requires updating all references.

## Shell Conventions

- Quote variables: `"$VAR"` not `$VAR` (except intentional word splitting)
- Every fail-fast step needs `set -e`
- Use `${PIPESTATUS[0]}` for piped commands, not `$?`
- Multiline GITHUB_OUTPUT uses heredoc pattern; single-line uses `key=value`
- `continue-on-error: true` only on optional steps (memory restore, feedback). Never on critical steps.
- **Step IDs are stable API** — renaming is a breaking change for downstream workflows.

## Testing

```bash
cd tests/
./test-security.sh              # Security tests
./test-exploits.sh              # Exploit simulations
./test-output-extraction.sh     # Output cleaning
./test-job-summary.sh           # Job summary formatting
```

## What to Ignore

- Shell formatting/style (no linter)
- README prose (only flag factual errors)
- Eval result files in `review-pr/agents/evals/results/`

## Rebranding

"cagent" is being rebranded to **Docker Agent**. Prefer "Docker Agent" in new user-facing strings. Internal code references (`cagent` binary, YAML keys, repo paths) stay as-is for now.
