#!/bin/bash
# Sanitize input by removing code comments, stripping suspicious patterns,
# and blocking critical secret-exfiltration commands.
#
# Two-tier input sanitization:
#   CRITICAL_PATTERNS  → direct secret exfiltration commands → exit 1 (block)
#   SUSPICIOUS_PATTERNS → behavioral / natural-language injection → strip + warn (exit 0)
#   MEDIUM_RISK_PATTERNS → API key variable names → warn only (exit 0)

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

# ============================================================================
# CRITICAL PATTERNS — direct secret exfiltration commands
# These are programmatic commands that execute in the agent's environment to
# extract secrets. They are never legitimate in a prompt. Still exit 1.
# ============================================================================
CRITICAL_PATTERNS=(
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
)

# ============================================================================
# SUSPICIOUS PATTERNS — behavioral / natural-language injection
# These are English phrases and code patterns that commonly appear in
# legitimate diffs and PR descriptions. Strip matching lines + warn, exit 0.
# ============================================================================
SUSPICIOUS_PATTERNS=(
  # Instruction override attempts
  "ignore.*previous.*instruction"
  "ignore.*all.*instruction"
  "disregard.*previous"
  "forget.*previous"
  "new.*instruction.*follow"

  # System/mode override attempts
  "system.{0,20}override"
  "system.{0,20}mode([^a-z]|$)"
  "admin.*mode"
  "debug.*mode.*enable"
  "debug.*mode"
  "developer.*mode"

  # Direct secret revelation requests (natural language)
  "show.*me.*(your|the|my).*(key|secret|token|api)"
  "reveal.*(your|the|my).*(key|secret|token|api)"
  "display.*(your|the|my).*(key|secret|token|api)"
  "what.*is.*(your|the).*(api.*key|secret|token)"
  "give.*me.*(your|the).*(key|secret|token|api)"

  # System prompt extraction
  "repeat.*(your|the|back).*system.*prompt"
  "what.*are.*your.*instructions"
  "show.*initial.*prompt"
  "show.*(your|the).*system.*prompt"

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

FOUND_CRITICAL=false
FOUND_SUSPICIOUS=false
FOUND_MEDIUM_RISK=false

# ── Check CRITICAL patterns (block execution) ──────────────────────────────
for pattern in "${CRITICAL_PATTERNS[@]}"; do
  matches=$(grep -iE "$pattern" "$INPUT" || true)

  if [ -n "$matches" ]; then
    # Filter out security code patterns (array definitions, quoted strings)
    filtered=$(echo "$matches" | \
      grep -v "SUSPICIOUS_PATTERNS" | \
      grep -v "CRITICAL_PATTERNS" | \
      grep -v "MEDIUM_RISK_PATTERNS" | \
      grep -v -E "^[+[:space:]-][[:space:]]*['\"].*['\"][[:space:]]*$" || true)

    if [ -n "$filtered" ]; then
      echo "::error::🚨 CRITICAL pattern detected: $pattern"
      echo "::error::This is a direct secret exfiltration command"
      FOUND_CRITICAL=true
    fi
  fi
done

# ── Check SUSPICIOUS patterns (strip + warn) ───────────────────────────────
for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
  matches=$(grep -iE "$pattern" "$INPUT" || true)

  if [ -n "$matches" ]; then
    # Filter for logging: skip self-referential security code lines
    filtered=$(echo "$matches" | \
      grep -v "SUSPICIOUS_PATTERNS" | \
      grep -v "CRITICAL_PATTERNS" | \
      grep -v "MEDIUM_RISK_PATTERNS" | \
      grep -v -E "^[+[:space:]-][[:space:]]*['\"].*['\"][[:space:]]*$" || true)

    if [ -n "$filtered" ]; then
      echo "::warning::⚠️  Suspicious pattern stripped from prompt: $pattern"
      FOUND_SUSPICIOUS=true
    fi
  fi

  # Strip ALL matching lines from output regardless of the logging filter.
  # Note: grep -v exits 1 when no lines survive (all matched), so we must
  # separate the grep from the mv to ensure the file is always replaced.
  grep -ivE "$pattern" "$OUTPUT" > "${OUTPUT}.tmp" 2>/dev/null || true
  mv "${OUTPUT}.tmp" "$OUTPUT"
done

# ── Check MEDIUM-RISK patterns (warn only, no strip) ───────────────────────
for pattern in "${MEDIUM_RISK_PATTERNS[@]}"; do
  matches=$(grep -E "$pattern" "$INPUT" || true)

  if [ -n "$matches" ]; then
    filtered=$(echo "$matches" | \
      grep -v "SUSPICIOUS_PATTERNS" | \
      grep -v "CRITICAL_PATTERNS" | \
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

# ── Determine outcome ──────────────────────────────────────────────────────

if [ "$FOUND_CRITICAL" = true ]; then
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=true" >> "$GITHUB_OUTPUT" || true
    echo "stripped=false" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=high" >> "$GITHUB_OUTPUT" || true
  fi
  echo "::error::═══════════════════════════════════════════════════════
🚨 BLOCKED: CRITICAL SECRET EXFILTRATION DETECTED
═══════════════════════════════════════════════════════
The input contains commands that directly extract secrets.
Execution has been blocked.
═══════════════════════════════════════════════════════"
  exit 1
fi

if [ "$FOUND_SUSPICIOUS" = true ]; then
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=false" >> "$GITHUB_OUTPUT" || true
    echo "stripped=true" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=medium" >> "$GITHUB_OUTPUT" || true
  fi
  echo "⚠️  Input sanitization completed - suspicious content stripped from prompt"
  echo "   Stripped lines will not be passed to the agent"
  echo "   Real security is in output scanning (will detect actual leaked secrets)"
elif [ "$FOUND_MEDIUM_RISK" = true ]; then
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=false" >> "$GITHUB_OUTPUT" || true
    echo "stripped=false" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=medium" >> "$GITHUB_OUTPUT" || true
  fi
  echo "⚠️  Input sanitization completed with WARNINGS - proceeding with review"
  echo "   Real security is in output scanning (will detect actual leaked secrets)"
else
  if [ -n "$GITHUB_OUTPUT" ]; then
    echo "blocked=false" >> "$GITHUB_OUTPUT" || true
    echo "stripped=false" >> "$GITHUB_OUTPUT" || true
    echo "risk-level=low" >> "$GITHUB_OUTPUT" || true
  fi
  echo "✅ Input sanitization completed - no suspicious patterns found"
fi
