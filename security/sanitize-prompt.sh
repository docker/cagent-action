#!/bin/bash
# Sanitize user-provided prompts for prompt injection patterns
# This is for general agent mode (not PR review mode)

set -e

# Accept input from stdin if available, otherwise use argument for backward compatibility
if [ -n "$1" ]; then
  # Argument provided, use it
  PROMPT="$1"
elif [ ! -t 0 ]; then
  # stdin is piped, read from it
  PROMPT=$(cat)
else
  # Neither argument nor stdin
  PROMPT=""
fi

if [ -z "$PROMPT" ]; then
  echo "::warning::No prompt provided to sanitize"
  exit 0
fi

echo "Sanitizing user-provided prompt for injection patterns..."

# Define suspicious patterns that indicate prompt injection attempts
SUSPICIOUS_PATTERNS=(
  'ignore.*previous.*instruction'
  'ignore.*all.*instruction'
  'disregard.*previous'
  'forget.*previous'
  'new.*instruction.*follow'
  'system.*mode'
  'admin.*mode'
  'debug.*mode'
  'developer.*mode'
  'ANTHROPIC_API_KEY'
  'OPENAI_API_KEY'
  'GITHUB_TOKEN'
  'process\.env'
  'printenv'
  'echo.*\$'
  'cat.*\.env'
  'show.*me.*key'
  'reveal.*key'
  'display.*secret'
  'what.*is.*your.*api.*key'
)

# Check each pattern
DETECTED=false
for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
  if echo "$PROMPT" | grep -iE "$pattern" > /dev/null 2>&1; then
    echo "::warning::⚠️  Suspicious pattern detected in prompt: $pattern. This may indicate a prompt injection attempt."
    DETECTED=true
  fi
done

# Check for encoded content (base64, hex) which could hide malicious instructions
if echo "$PROMPT" | grep -E '(base64|atob|btoa|0x[0-9a-fA-F]{20,})' > /dev/null 2>&1; then
  echo "::warning::⚠️  Encoded content detected in prompt (base64/hex). This could be an obfuscation technique."
  DETECTED=true
fi

if [ "$DETECTED" = true ]; then
  echo "::warning::⚠️  PROMPT INJECTION PATTERNS DETECTED: The provided prompt contains suspicious patterns that may indicate a prompt injection attack attempt. The agent will still execute, but be aware that the prompt may attempt to extract secrets or override system instructions, and the output will be scanned for leaked secrets. If this is a false positive, you can ignore this warning."

  # Set output for downstream steps
  echo "suspicious=true" >> "$GITHUB_OUTPUT"
else
  echo "✅ No suspicious patterns detected in prompt."
  echo "suspicious=false" >> "$GITHUB_OUTPUT"
fi

# Always allow execution - we're just warning, not blocking
exit 0
