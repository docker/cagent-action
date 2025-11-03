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

# Define suspicious patterns that indicate prompt injection attempts
SUSPICIOUS_PATTERNS=(
  "ignore.*previous.*instruction"
  "system.*override"
  "debug.*mode"
  "print.*environment"
  "show.*api.*key"
  "display.*token"
  "reveal.*secret"
  "ANTHROPIC_API_KEY"
  "GITHUB_TOKEN"
  "OPENAI_API_KEY"
  "process\.env"
  "os\.environ"
  "System\.getenv"
)

echo "Checking for suspicious patterns..."

# Check for suspicious patterns
for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
  if grep -iE "$pattern" "$OUTPUT" > /dev/null 2>&1; then
    echo "::error::🚨 Suspicious pattern detected in PR: $pattern"
    echo "::error::This may be a prompt injection attack"
    echo "blocked=true" >> "$GITHUB_OUTPUT"
    exit 1
  fi
done

echo "blocked=false" >> "$GITHUB_OUTPUT"
echo "✅ Input sanitization completed - no suspicious patterns found"
