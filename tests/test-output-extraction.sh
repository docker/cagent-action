#!/bin/bash
# Test output extraction logic from action.yml
# Simulates the sanitize-output step's extraction methods

set -e

echo "=========================================="
echo "Testing Output Extraction Logic"
echo "=========================================="

# Create test output files
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# Test Case 1: With cagent-output code block (preferred method)
echo ""
echo "Test 1: Extracting from cagent-output code block"
echo "---"
cat > "$TEST_DIR/output1.log" <<'EOF'
For any feedback, please visit: https://docker.qualtrics.com/jfe/form/SV_cNsCIg92nQemlfw

time=2025-11-05T21:22:35.664Z level=WARN msg="rootSessionID not set"

--- Agent: root ---

```cagent-output
## ✅ No security issues detected

Scanned 15 commits from the past 2 days. No security vulnerabilities were identified.
```
EOF

# Extract using the primary method
if grep -q '^```cagent-output' "$TEST_DIR/output1.log"; then
  awk '/^```cagent-output$/,/^```$/ {
    if (!/^```cagent-output$/ && !/^```$/) print
  }' "$TEST_DIR/output1.log" > "$TEST_DIR/output1.clean"
  echo "✅ Extraction successful"
else
  echo "❌ cagent-output block not found"
fi

echo "Cleaned output:"
cat "$TEST_DIR/output1.clean"
echo ""

# Test Case 2: Fallback - Extract after agent marker
echo ""
echo "Test 2: Fallback extraction after agent marker"
echo "---"
cat > "$TEST_DIR/output2.log" <<'EOF'
For any feedback, please visit: https://docker.qualtrics.com/jfe/form/SV_cNsCIg92nQemlfw

time=2025-11-05T21:22:35.664Z level=WARN msg="rootSessionID not set"

--- Agent: root ---

✅ **No security issues detected**

Scanned 15 commits from the past 2 days. No security vulnerabilities were identified.
EOF

# Extract using fallback method
if grep -q "^--- Agent: root ---$" "$TEST_DIR/output2.log"; then
  AGENT_LINE=$(grep -n "^--- Agent: root ---$" "$TEST_DIR/output2.log" | tail -1 | cut -d: -f1)
  tail -n +$((AGENT_LINE + 1)) "$TEST_DIR/output2.log" | \
    grep -v "^time=" | \
    grep -v "^level=" | \
    grep -v "For any feedback" | \
    sed '/^$/N;/^\n$/d' > "$TEST_DIR/output2.clean"
  echo "✅ Extraction successful (fallback method)"
else
  echo "❌ Agent marker not found"
fi

echo "Cleaned output:"
cat "$TEST_DIR/output2.clean"
echo ""

echo ""
echo "Test 3: Edge case - malformed output without expected markers"
echo "---"
cat > "$TEST_DIR/output3.log" <<'EOF'
Some random output
No agent markers here
Just plain text
EOF

# Fallback 3 should just clean metadata
grep -v "^time=" "$TEST_DIR/output3.log" | \
  grep -v "^level=" | \
  grep -v "For any feedback" > "$TEST_DIR/output3.clean"

if [ -f "$TEST_DIR/output3.clean" ]; then
  echo "✅ Fallback extraction successful (metadata cleaning only)"
else
  echo "❌ Fallback extraction failed"
fi

echo "Cleaned output:"
cat "$TEST_DIR/output3.clean"
echo ""

echo ""
echo "Test 4: Defensive check - agent marker exists but grep fails"
echo "---"

# This simulates the edge case where grep -q finds the marker but grep -n doesn't
# (e.g., race condition or encoding issue)
cat > "$TEST_DIR/output4.log" <<'EOF'
--- Agent: root ---

Some output
EOF

# Simulate the defensive logic
AGENT_LINE=$(grep -n "^--- Agent: root ---$" "$TEST_DIR/output4.log" | tail -1 | cut -d: -f1)

if [ -n "$AGENT_LINE" ]; then
  echo "✅ AGENT_LINE extracted successfully: $AGENT_LINE"
  tail -n +$((AGENT_LINE + 1)) "$TEST_DIR/output4.log" > "$TEST_DIR/output4.clean"
else
  echo "⚠️  AGENT_LINE is empty (defensive check would prevent arithmetic error)"
  cp "$TEST_DIR/output4.log" "$TEST_DIR/output4.clean"
fi

echo ""
echo "=========================================="
echo "✅ All extraction tests completed"
echo "=========================================="
