/**
 * Single source of truth for all security detection patterns.
 * Ported from security/secret-patterns.sh and security/sanitize-input.sh.
 */

// Full regex patterns for secret detection in output scanning.
// Require specific lengths and formats for accuracy.
export const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{30,}/, // Anthropic API keys
  /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access tokens
  /gho_[a-zA-Z0-9]{36}/, // GitHub OAuth tokens
  /ghu_[a-zA-Z0-9]{36}/, // GitHub user tokens
  /ghs_[a-zA-Z0-9]{36}/, // GitHub server tokens
  /github_pat_[a-zA-Z0-9_]+/, // GitHub fine-grained tokens
  /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
  /sk-proj-[a-zA-Z0-9]{48}/, // OpenAI project keys
];

// Simplified alternation string for quick prefix detection in prompt verification.
export const SECRET_PREFIXES =
  '(sk-ant-|sk-proj-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|ANTHROPIC_API_KEY|GITHUB_TOKEN|OPENAI_API_KEY)';

// Critical patterns — direct secret exfiltration commands.
// These are programmatic commands that execute in the agent's environment to
// extract secrets. Never legitimate in a prompt. Triggers exit 1 (block).
export const CRITICAL_PATTERNS: RegExp[] = [
  // Direct secret extraction commands - shell
  /echo.*\$.*ANTHROPIC_API_KEY/i,
  /echo.*\$.*GITHUB_TOKEN/i,
  /echo.*\$.*OPENAI_API_KEY/i,
  /echo.*\$.*GOOGLE_API_KEY/i,

  // Direct secret extraction commands - Python
  /print\(.*ANTHROPIC_API_KEY/i,
  /print\(.*OPENAI_API_KEY/i,
  /print\(.*GITHUB_TOKEN/i,
  /print\(.*GOOGLE_API_KEY/i,
  /print.*os\.environ/i,

  // Direct secret extraction commands - JavaScript
  /console\.log.*process\.env/i,
  /console\.log\(.*ANTHROPIC_API_KEY/i,
  /console\.log\(.*OPENAI_API_KEY/i,
  /console\.log\(.*GITHUB_TOKEN/i,
  /console\.log\(.*GOOGLE_API_KEY/i,

  // Environment variable extraction
  /print.*environment.*variable/i,
  /printenv\s+(ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY)/i,

  // File access to secrets
  /cat\s+\.env/i,
];

// Suspicious patterns — behavioral / natural-language injection.
// Common in prompt injection attempts. Matching lines are stripped from
// the sanitized output and a warning is emitted; does not exit 1.
export const SUSPICIOUS_PATTERNS: RegExp[] = [
  // Instruction override attempts
  /ignore.*previous.*instruction/i,
  /ignore.*all.*instruction/i,
  /disregard.*previous/i,
  /forget.*previous/i,
  /new.*instruction.*follow/i,

  // System/mode override attempts
  /system.{0,20}override/i,
  /system.{0,20}mode([^a-z]|$)/i,
  /admin.*mode/i,
  /debug.*mode.*enable/i,
  /debug.*mode/i,
  /developer.*mode/i,

  // Direct secret revelation requests (natural language)
  /show.*me.*(your|the|my).*(key|secret|token|api)/i,
  /reveal.*(your|the|my).*(key|secret|token|api)/i,
  /display.*(your|the|my).*(key|secret|token|api)/i,
  /what.*is.*(your|the).*(api.*key|secret|token)/i,
  /give.*me.*(your|the).*(key|secret|token|api)/i,

  // System prompt extraction
  /repeat.*(your|the|back).*system.*prompt/i,
  /what.*are.*your.*instructions/i,
  /show.*initial.*prompt/i,
  /show.*(your|the).*system.*prompt/i,

  // Jailbreak attempts
  /act.*as.*no.*restrictions/i,
  /pretend.*to.*be.*evil/i,
  /pretend.*you.*are.*jailbroken/i,

  // Encoding/obfuscation attempts
  /base64.*decode/i,
  /decode.*base64/i,
  /atob\(/i,
  /btoa\(/i,
  /0x[0-9a-fA-F]{20,}/,
];

// Medium-risk patterns — API key variable names.
// Warrant warnings but don't block or strip; common in legitimate code.
export const MEDIUM_RISK_PATTERNS: string[] = [
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
];
