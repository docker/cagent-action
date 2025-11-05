#!/bin/bash
# Test job summary format
# Simulates the complete job summary flow

set -e

echo "=========================================="
echo "Testing Job Summary Format"
echo "=========================================="

# Create temporary files
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

SUMMARY_FILE="$TEST_DIR/summary.md"
OUTPUT_FILE="$TEST_DIR/agent-output.txt"

# Simulate cleaned agent output
cat > "$OUTPUT_FILE" <<'EOF'
✅ **No security issues detected**

Scanned 15 commits from the past 2 days. No security vulnerabilities were identified.
EOF

echo ""
echo "Test 1: Creating initial summary (simulating Run CAgent step)"
echo "---"

# Simulate initial summary creation
{
  echo "## CAgent Execution Summary"
  echo ""
  echo "| Property | Value |"
  echo "|----------|-------|"
  echo "| Agent | \`agents/security-scanner.yaml\` |"
  echo "| Exit Code | 0 |"
  echo "| Execution Time | 45s |"
  echo "| CAgent Version | v1.6.6 |"
  echo "| MCP Gateway | false |"
  echo ""
  echo "✅ **Status:** Success"
} > "$SUMMARY_FILE"

echo "Initial summary created:"
cat "$SUMMARY_FILE"
echo ""

echo ""
echo "Test 2: Appending cleaned output in details block (simulating Update step)"
echo "---"

# Simulate updating summary with cleaned output
{
  echo ""
  echo "<details>"
  echo "<summary>Agent Output (click to expand)</summary>"
  echo ""
  cat "$OUTPUT_FILE"
  echo ""
  echo "</details>"
} >> "$SUMMARY_FILE"

echo "Final summary with cleaned output:"
cat "$SUMMARY_FILE"
echo ""

echo ""
echo "Test 3: Verify structure"
echo "---"

# Verify the summary has the expected structure
if grep -q "## CAgent Execution Summary" "$SUMMARY_FILE"; then
  echo "✅ Has execution summary table"
else
  echo "❌ Missing execution summary table"
  exit 1
fi

if grep -q "<details>" "$SUMMARY_FILE"; then
  echo "✅ Has collapsible details block"
else
  echo "❌ Missing details block"
  exit 1
fi

if grep -q "<summary>Agent Output (click to expand)</summary>" "$SUMMARY_FILE"; then
  echo "✅ Has correct summary text"
else
  echo "❌ Missing or incorrect summary text"
  exit 1
fi

if grep -q "No security issues detected" "$SUMMARY_FILE"; then
  echo "✅ Contains cleaned agent output"
else
  echo "❌ Missing agent output content"
  exit 1
fi

# Verify NO metadata in output
if grep -E "^(time=|level=|For any feedback)" "$SUMMARY_FILE"; then
  echo "❌ Summary contains unwanted metadata"
  exit 1
else
  echo "✅ No metadata in summary (clean output only)"
fi

echo ""
echo "Test 4: Agent output with backticks (markdown code blocks)"
echo "---"

# Create output with backticks
cat > "$OUTPUT_FILE" <<'EOF'
## 🚨 Security Issues Detected

Found 1 critical issue:

### SQL Injection in user query

**Code:**
```typescript
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.execute(query);
```

**Fix:**
```typescript
const query = 'SELECT * FROM users WHERE id = ?';
db.execute(query, [userId]);
```
EOF

# Create fresh summary
SUMMARY_FILE2="$TEST_DIR/summary2.md"
{
  echo "## CAgent Execution Summary"
  echo ""
  echo "✅ **Status:** Success"
  echo ""
  echo "<details>"
  echo "<summary>Agent Output (click to expand)</summary>"
  echo ""
  cat "$OUTPUT_FILE"
  echo ""
  echo "</details>"
} > "$SUMMARY_FILE2"

# Verify backticks are preserved
if grep -q '```typescript' "$SUMMARY_FILE2"; then
  echo "✅ Markdown code blocks with backticks preserved"
else
  echo "❌ Markdown code blocks not preserved"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ All job summary tests passed"
echo "=========================================="
echo ""
echo "The summary will render in GitHub as:"
echo "1. A table with execution details"
echo "2. A collapsed section with '▶ Agent Output (click to expand)'"
echo "3. Clean agent output without log metadata"
echo "4. Markdown formatting (including code blocks) preserved"
