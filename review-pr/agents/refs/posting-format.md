# Posting Format (GitHub posting mode)

Convert each CONFIRMED/LIKELY finding to an inline comment object for the `comments` array:
- **Added/context lines** (`+` or ` ` in diff) — use `line` with the new-file line number:
  ```json
  {"path": "file.go", "line": 123, "body": "**ISSUE**\n\nDETAILS\n\n<!-- cagent-review -->"}
  ```
- **Deleted lines** (`-` in diff) — use `side: "LEFT"` with the old-file line number:
  ```json
  {"path": "file.go", "line": 45, "side": "LEFT", "body": "**ISSUE**\n\nDETAILS\n\n<!-- cagent-review -->"}
  ```

The `line` field normally refers to the new file (right side of the diff). Deleted lines
don't exist in the new file, so GitHub's API returns 422. Adding `side: "LEFT"` tells
GitHub to anchor the comment on the old file (left side of the diff) instead.

IMPORTANT: Use `jq` to construct the JSON payload. Do NOT manually build JSON strings
with `echo` — this causes double-escaping of newlines (`\n` rendered as literal text).

# WARNING: NEVER use `--arg body "$variable"` to pass comment body text to jq.
# If the body contains `"`, backticks, or `$`, bash silently empties the variable,
# producing a blank comment on the PR. Always write the body to a temp file via a
# quoted heredoc (`<< 'EOF'`) and read it with `jq --rawfile`. A quoted heredoc
# delimiter disables ALL shell expansion — backticks, `$`, and `"` are written verbatim.

Build the review body and comments, then use `jq` to produce correctly-escaped JSON:
```bash
# Review body is just the assessment badge — findings go in inline comments
REVIEW_BODY="### Assessment: 🟢 APPROVE"   # or 🟡 NEEDS ATTENTION / 🔴 CRITICAL

# Start with an empty comments array
echo '[]' > /tmp/review_comments.json

# Append each finding using a quoted heredoc + jq --rawfile (safe for any body text)
# NEVER use --arg body "$comment_body" — shell quoting breaks on ", backticks, and $

cat > /tmp/comment_body.md << 'COMMENT_BODY_EOF'
**[SEVERITY] One-line issue summary**

Detailed explanation of the bug, trigger path, and impact.

<!-- cagent-review -->
COMMENT_BODY_EOF

jq --arg path "$file_path" --argjson line "$line_number" \
  --rawfile body /tmp/comment_body.md \
  '. += [{path: $path, line: $line, body: $body}]' \
  /tmp/review_comments.json > /tmp/review_comments.tmp \
  && mv /tmp/review_comments.tmp /tmp/review_comments.json

# For deleted lines (- in diff), add side: LEFT with the OLD file line number:
jq --arg path "$file_path" --argjson line "$old_line_number" --arg side "LEFT" \
  --rawfile body /tmp/comment_body.md \
  '. += [{path: $path, line: $line, side: $side, body: $body}]' \
  /tmp/review_comments.json > /tmp/review_comments.tmp \
  && mv /tmp/review_comments.tmp /tmp/review_comments.json

# Defensive: remove any comments with empty bodies before posting
jq '[.[] | select(.body | length > 0)]' /tmp/review_comments.json > /tmp/review_comments.tmp \
  && mv /tmp/review_comments.tmp /tmp/review_comments.json
echo "Posting review with $(jq length /tmp/review_comments.json) inline comment(s)"

# Use jq to assemble the final payload with proper escaping
jq -n \
  --arg body "$REVIEW_BODY" \
  --arg event "COMMENT" \
  --slurpfile comments /tmp/review_comments.json \
  '{body: $body, event: $event, comments: $comments[0]}' \
| gh api repos/{owner}/{repo}/pulls/{pr}/reviews --input -
```

The `<!-- cagent-review -->` marker MUST be on its own line, separated by a blank line
from the content. Do NOT include it in console output mode.

# Comment Tone (REQUIRED)

Write each comment body as an **observation that calls out the issue**, not as an
instruction telling the author to make a change. The bot reports; the author decides.

The rule is about intent, not keywords: describe ONLY what is wrong and its consequence,
then stop. Do NOT describe how to resolve it, in ANY phrasing. If a sentence tells the
reader what the code should become, delete it. None of the following may appear:

- A `**Fix:**`/`**Suggestion:**` block, or "The fix is…", "To fix this…", "this must be
  fixed consistently".
- Imperatives: "use / replace / remove / update / change / add / rename X".
- Passive or hedged prescriptions: "X needs to be removed", "X should be updated",
  "you could / consider doing X".
- Dual/multiple prescribed options: "either do X or do Y".
- A corrected code snippet, diff, or identifier presented as the edit to make.
- Naming a "better/safer/idiomatic/more robust/preferred" alternative API, function, or
  construct (e.g. "`errors.Is` is safer than `os.IsNotExist`") — a directive in disguise
  even as a comparison.

You MAY explain the mechanism of the bug (e.g. "wrapping the error here means
`os.IsNotExist` no longer matches"), strictly as the cause; never continue into the edit.

**Findings whose root cause is changed code but whose remedy lands on pre-existing,
unchanged lines:** still call out the interaction (it is caused by this PR), but never
ask the author to edit the unchanged lines. State that the new code changes the
behaviour the surrounding code relied on, and stop there.
