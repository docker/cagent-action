#!/bin/bash
# Shared secret detection patterns
# Used by sanitize-output.sh and action.yml prompt verification
# Ensures consistent secret detection across all security layers

# Full regex patterns for secret detection in output scanning
# These require specific lengths and formats for accuracy
SECRET_PATTERNS=(
  'sk-ant-[a-zA-Z0-9_-]{30,}'        # Anthropic API keys
  'ghp_[a-zA-Z0-9]{36}'              # GitHub personal access tokens
  'gho_[a-zA-Z0-9]{36}'              # GitHub OAuth tokens
  'ghu_[a-zA-Z0-9]{36}'              # GitHub user tokens
  'ghs_[a-zA-Z0-9]{36}'              # GitHub server tokens
  'github_pat_[a-zA-Z0-9_]+'         # GitHub fine-grained tokens
  'sk-[a-zA-Z0-9]{48}'               # OpenAI API keys
  'sk-proj-[a-zA-Z0-9]{48}'          # OpenAI project keys
)

# Simplified patterns for quick prefix detection (used in prompt verification)
# These are less strict but catch the same secret types
SECRET_PREFIXES='(sk-ant-|sk-proj-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|ANTHROPIC_API_KEY|GITHUB_TOKEN|OPENAI_API_KEY)'
