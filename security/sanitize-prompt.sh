#!/bin/bash
# Sanitize user-provided prompts for prompt injection patterns
# This is for general agent mode (not PR review mode)

set -e

# Accept input from stdin if available, otherwise use argument for backward compatibility
# Check if stdin is NOT a terminal (piped/redirected)
if [ ! -t 0 ]; then
  # Try to read from stdin (will be empty if nothing piped)
  PROMPT=$(cat)
  # If we got nothing from stdin, try argument
  if [ -z "$PROMPT" ] && [ -n "$1" ]; then
    PROMPT="$1"
  fi
elif [ -n "$1" ]; then
  # stdin is a terminal, use argument
  PROMPT="$1"
else
  # Neither stdin nor argument
  PROMPT=""
fi

if [ -z "$PROMPT" ]; then
  echo "::warning::No prompt provided to sanitize"
  exit 0
fi

echo "Sanitizing user-provided prompt for injection patterns..."

# Define suspicious patterns that indicate prompt injection attempts
# Note: These patterns are designed to catch malicious commands, not code references
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
  # Only flag API keys when actively trying to extract them (not just code references)
  'echo.*\$.*ANTHROPIC_API_KEY'
  'echo.*\$.*OPENAI_API_KEY'
  'echo.*\$.*GITHUB_TOKEN'
  'print\(.*ANTHROPIC_API_KEY'
  'print\(.*OPENAI_API_KEY'
  'print\(.*GITHUB_TOKEN'
  'console\.log\(.*ANTHROPIC_API_KEY'
  'console\.log\(.*OPENAI_API_KEY'
  'console\.log\(.*GITHUB_TOKEN'
  'printenv\s+(ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN)'
  'cat\s+\.env'
  # Only flag key extraction when it's clearly a command/question
  'show.*me.*(your|the|my).*key'
  'reveal.*(your|the|my).*(key|secret|token)'
  'display.*(your|the|my).*(key|secret|token)'
  'what.*is.*(your|the).*api.*key'
  'give.*me.*(your|the).*(key|secret|token)'
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
