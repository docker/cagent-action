#!/bin/bash
# Scan AI response for leaked secrets before posting to PR
# This is the last line of defense against secret leakage

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared secret patterns
source "$SCRIPT_DIR/secret-patterns.sh"

OUTPUT_FILE="$1"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "::error::Output file not found: $OUTPUT_FILE"
  exit 1
fi

echo "Scanning output for leaked secrets..."

# SECRET_PATTERNS is loaded from secret-patterns.sh

LEAKED=false
DETECTED_PATTERNS=()

# Check each pattern
for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -E "$pattern" "$OUTPUT_FILE" > /dev/null 2>&1; then
    echo "::error::🚨 SECRET LEAK DETECTED: Pattern matched: $pattern"
    LEAKED=true
    DETECTED_PATTERNS+=("$pattern")
  fi
done

# Check for environment variable names (indirect disclosure)
if grep -iE '(ANTHROPIC_API_KEY|GITHUB_TOKEN|OPENAI_API_KEY|GOOGLE_API_KEY)' "$OUTPUT_FILE" > /dev/null 2>&1; then
  echo "::warning::⚠️  Environment variable names detected in output"
  echo "::warning::This may indicate an attempted information disclosure"
fi

if [ "$LEAKED" = true ]; then
  # CRITICAL SECURITY INCIDENT
  echo "::error::═══════════════════════════════════════════════════════"
  echo "::error::🚨 CRITICAL SECURITY INCIDENT: SECRET LEAK DETECTED"
  echo "::error::═══════════════════════════════════════════════════════"
  echo "::error::"
  echo "::error::Response contains secret patterns:"
  for pattern in "${DETECTED_PATTERNS[@]}"; do
    echo "::error::  - $pattern"
  done
  echo "::error::"
  echo "::error::ACTIONS TAKEN:"
  echo "::error::  ✓ Response BLOCKED from being posted to PR"
  echo "::error::  ✓ Security incident logged"
  echo "::error::  ✓ Workflow will fail"
  echo "::error::"
  echo "::error::IMMEDIATE ACTIONS REQUIRED:"
  echo "::error::  1. Investigate PR #$PR_NUMBER for prompt injection"
  echo "::error::  2. Review AI response in workflow logs"
  echo "::error::  3. Rotate compromised secrets immediately"
  echo "::error::  4. Block the PR author if malicious"
  echo "::error::"
  echo "::error::DO NOT post this response to the PR!"
  echo "::error::═══════════════════════════════════════════════════════"

  # Set output
  echo "leaked=true" >> "$GITHUB_OUTPUT"
  exit 1
else
  echo "leaked=false" >> "$GITHUB_OUTPUT"
  echo "✅ No secrets detected in output - safe to post"
fi
