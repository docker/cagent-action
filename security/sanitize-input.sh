#!/bin/bash
# Sanitize PR input by removing code comments and blocking suspicious patterns
# This prevents prompt injection attacks hidden in code comments

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
  "ignore.*previous.*instruction"
  "system.*override"
  "debug.*mode.*enable"
  "print.*environment.*variable"
  "echo.*\\\$ANTHROPIC_API_KEY"
  "echo.*\\\$GITHUB_TOKEN"
  "echo.*\\\$OPENAI_API_KEY"
  "console\\.log.*process\\.env"
  "print.*os\\.environ"
)

# Define MEDIUM-RISK patterns that warrant warnings but shouldn't block
# These are common in legitimate code (config, tests, docs)
MEDIUM_RISK_PATTERNS=(
  "ANTHROPIC_API_KEY"
  "GITHUB_TOKEN"
  "OPENAI_API_KEY"
)

echo "Checking for suspicious patterns..."

FOUND_HIGH_RISK=false
FOUND_MEDIUM_RISK=false

# Check for HIGH-RISK patterns (behavioral injection attempts)
for pattern in "${HIGH_RISK_PATTERNS[@]}"; do
  if grep -iE "$pattern" "$INPUT" > /dev/null 2>&1; then
    echo "::error::🚨 HIGH-RISK pattern detected: $pattern"
    echo "::error::This strongly indicates a prompt injection attack"
    FOUND_HIGH_RISK=true
  fi
done

# Check for MEDIUM-RISK patterns (warn but don't block)
for pattern in "${MEDIUM_RISK_PATTERNS[@]}"; do
  if grep -E "$pattern" "$INPUT" > /dev/null 2>&1; then
    echo "::warning::⚠️  MEDIUM-RISK pattern detected: $pattern"
    echo "::warning::This PR modifies API key configuration - review carefully"
    echo "::warning::Output will be scanned for actual secret leakage"
    FOUND_MEDIUM_RISK=true
  fi
done

if [ "$FOUND_HIGH_RISK" = true ]; then
  echo "blocked=true" >> "$GITHUB_OUTPUT"
  echo "risk-level=high" >> "$GITHUB_OUTPUT"
  exit 1
fi

if [ "$FOUND_MEDIUM_RISK" = true ]; then
  echo "blocked=false" >> "$GITHUB_OUTPUT"
  echo "risk-level=medium" >> "$GITHUB_OUTPUT"
  echo "⚠️  Input sanitization completed with WARNINGS - proceeding with review"
  echo "   Real security is in output scanning (will detect actual leaked secrets)"
else
  echo "blocked=false" >> "$GITHUB_OUTPUT"
  echo "risk-level=low" >> "$GITHUB_OUTPUT"
  echo "✅ Input sanitization completed - no suspicious patterns found"
fi
