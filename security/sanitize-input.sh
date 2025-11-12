#!/bin/bash
# Sanitize input by removing code comments and blocking suspicious patterns
# This prevents prompt injection attacks hidden in code comments or user prompts

set -e

INPUT="$1"
OUTPUT="$2"

if [ ! -f "$INPUT" ]; then
  echo "::error::Input file not found: $INPUT"
  exit 1
fi

# Copy input to output
cp "$INPUT" "$OUTPUT"

# Remove single-line comments from diff (common injection vector)
# These are lines starting with + followed by // (C/JS/Go style comments)
sed -i.bak '/^+.*\/\//d' "$OUTPUT" || true

# Remove multi-line comment starts
# These are lines starting with + followed by /* (C/JS/Go style comments)
sed -i.bak '/^+.*\/\*/d' "$OUTPUT" || true

# Remove Python/Shell style comments
sed -i.bak '/^+[[:space:]]*#/d' "$OUTPUT" || true

# Clean up backup files
rm -f "$OUTPUT.bak"

# Define HIGH-RISK patterns that strongly indicate prompt injection attempts
# These are behavioral instructions that shouldn't appear in normal code
HIGH_RISK_PATTERNS=(
  # Instruction override attempts
  "ignore.*previous.*instruction"
  "ignore.*all.*instruction"
  "disregard.*previous"
  "forget.*previous"
  "new.*instruction.*follow"

  # System/mode override attempts
  "system.*override"
  "system.*mode"
  "admin.*mode"
  "debug.*mode.*enable"
  "debug.*mode"
  "developer.*mode"

  # Direct secret extraction commands - shell
  "echo.*\\\$.*ANTHROPIC_API_KEY"
  "echo.*\\\$.*GITHUB_TOKEN"
  "echo.*\\\$.*OPENAI_API_KEY"
  "echo.*\\\$.*GOOGLE_API_KEY"

  # Direct secret extraction commands - Python
  "print\(.*ANTHROPIC_API_KEY"
  "print\(.*OPENAI_API_KEY"
  "print\(.*GITHUB_TOKEN"
  "print\(.*GOOGLE_API_KEY"
  "print.*os\\.environ"

  # Direct secret extraction commands - JavaScript
  "console\\.log.*process\\.env"
  "console\\.log\(.*ANTHROPIC_API_KEY"
  "console\\.log\(.*OPENAI_API_KEY"
  "console\\.log\(.*GITHUB_TOKEN"
  "console\\.log\(.*GOOGLE_API_KEY"

  # Environment variable extraction
  "print.*environment.*variable"
  "printenv[[:space:]]+(ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY)"

  # File access to secrets
  "cat[[:space:]]+\\.env"

  # Direct secret revelation requests
  "show.*me.*(your|the|my).*(key|secret|token|api)"
  "reveal.*(your|the|my).*(key|secret|token|api)"
  "display.*(your|the|my).*(key|secret|token|api)"
  "what.*is.*(your|the).*(api.*key|secret|token)"
  "give.*me.*(your|the).*(key|secret|token|api)"

  # System prompt extraction
  "repeat.*system.*prompt"
  "what.*are.*your.*instructions"
  "show.*initial.*prompt"
  "show.*system.*prompt"

  # Jailbreak attempts
  "act.*as.*no.*restrictions"
  "pretend.*to.*be.*evil"
  "pretend.*you.*are.*jailbroken"

  # Encoding/obfuscation attempts
  "base64.*decode"
  "decode.*base64"
  "atob\("
  "btoa\("
  "0x[0-9a-fA-F]{20,}"
)

# Define MEDIUM-RISK patterns that warrant warnings but shouldn't block
# These are common in legitimate code (config, tests, docs)
MEDIUM_RISK_PATTERNS=(
  "ANTHROPIC_API_KEY"
  "GITHUB_TOKEN"
  "OPENAI_API_KEY"
  "GOOGLE_API_KEY"
)

echo "🔍 Checking for suspicious patterns..."

FOUND_HIGH_RISK=false
FOUND_MEDIUM_RISK=false

# Check for HIGH-RISK patterns (behavioral injection attempts)
# Skip lines that are clearly security code (array definitions, quoted strings)
for pattern in "${HIGH_RISK_PATTERNS[@]}"; do
  # Find matches
  matches=$(grep -iE "$pattern" "$INPUT" || true)

  if [ -n "$matches" ]; then
    # Filter out security code patterns:
    # - Lines with SUSPICIOUS_PATTERNS, HIGH_RISK_PATTERNS, etc.
    # - Lines that are entirely within quotes '...' or "..."
    # - Git diff format: lines starting with +, -, or space (context lines)
    filtered=$(echo "$matches" | \
      grep -v "SUSPICIOUS_PATTERNS" | \
      grep -v "HIGH_RISK_PATTERNS" | \
      grep -v "MEDIUM_RISK_PATTERNS" | \
      grep -v -E "^[+[:space:]-][[:space:]]*['\"].*['\"][[:space:]]*$" || true)

    if [ -n "$filtered" ]; then
      echo "::error::🚨 HIGH-RISK pattern detected: $pattern"
      echo "::error::This strongly indicates a prompt injection attack"
      FOUND_HIGH_RISK=true
    fi
  fi
done

# Check for MEDIUM-RISK patterns (warn but don't block)
# Skip lines that are clearly security code
for pattern in "${MEDIUM_RISK_PATTERNS[@]}"; do
  # Find matches
  matches=$(grep -E "$pattern" "$INPUT" || true)

  if [ -n "$matches" ]; then
    # Filter out security code patterns
    # - Git diff format: lines starting with +, -, or space (context lines)
    filtered=$(echo "$matches" | \
      grep -v "SUSPICIOUS_PATTERNS" | \
      grep -v "HIGH_RISK_PATTERNS" | \
      grep -v "MEDIUM_RISK_PATTERNS" | \
      grep -v -E "^[+[:space:]-][[:space:]]*['\"].*['\"][[:space:]]*$" || true)

    if [ -n "$filtered" ]; then
      echo "::warning::⚠️  MEDIUM-RISK pattern detected: $pattern"
      echo "::warning::This PR modifies API key configuration - review carefully"
      echo "::warning::Output will be scanned for actual secret leakage"
      FOUND_MEDIUM_RISK=true
    fi
  fi
done

if [ "$FOUND_HIGH_RISK" = true ]; then
  # Write to output file if it exists (ignore errors if running without GitHub Actions)
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=true" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=high" >> "$GITHUB_OUTPUT" || true
  fi
  echo "::error::═══════════════════════════════════════════════════════
🚨 BLOCKED: HIGH-RISK PROMPT INJECTION DETECTED
═══════════════════════════════════════════════════════
The input contains patterns that strongly indicate a
prompt injection attack. Execution has been blocked.
═══════════════════════════════════════════════════════"
  exit 1
fi

if [ "$FOUND_MEDIUM_RISK" = true ]; then
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=false" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=medium" >> "$GITHUB_OUTPUT" || true
  fi
  echo "⚠️  Input sanitization completed with WARNINGS - proceeding with review"
  echo "   Real security is in output scanning (will detect actual leaked secrets)"
else
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=false" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=low" >> "$GITHUB_OUTPUT" || true
  fi
  echo "✅ Input sanitization completed - no suspicious patterns found"
fi
