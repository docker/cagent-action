# Security Documentation

This directory contains security hardening scripts for the cagent-action GitHub Action.

## 🔒 Security Features

This action includes **built-in security features for all agent executions**:

### Universal Security (All Modes)

**Every agent execution** includes these security features:

1. **Output Scanning** - All agent responses are scanned for leaked secrets:
   - API key patterns: `sk-ant-*`, `sk-*`, `sk-proj-*`
   - GitHub tokens: `ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `github_pat_*`
   - Environment variable names in output
   - If secrets detected: workflow fails, security issue created

2. **Prompt Sanitization** (General Mode) - User prompts are checked for:
   - Prompt injection patterns ("ignore previous instructions", etc.)
   - Requests for API keys or environment variables
   - Encoded content (base64, hex) that could hide malicious requests
   - Warnings issued if suspicious patterns found (execution continues)

### PR Review Mode Security

When using `pr-number` input for PR reviews, **additional** security layers activate:

- **Authorization**: Only OWNER, MEMBER, and COLLABORATOR contributors can trigger (hardcoded, cannot be disabled)
- **Input Sanitization**: Removes code comments and blocks malicious diff patterns
- **Size Limits**: Enforces max PR size (3000 lines default) to prevent DoS

## Defense in Depth Architecture

When using PR review mode, the action implements multiple security layers:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Authorization Check                                      │
│    ✓ Only OWNER, MEMBER, COLLABORATOR can trigger          │
│    ✓ External contributors blocked automatically           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Input Sanitization                                       │
│    ✓ Remove code comments (common injection vector)        │
│    ✓ Detect suspicious patterns (API key requests, etc.)   │
│    ✓ Enforce PR size limit (3000 lines default)            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Safe Prompt Building                                     │
│    ✓ Never include secrets in prompt                       │
│    ✓ Only sanitized diff passed to agent                   │
│    ✓ Inject security rules in prompt                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Agent Execution                                          │
│    ✓ Multi-agent architecture with security rules          │
│    ✓ No GitHub MCP tools (no direct API access)            │
│    ✓ Limited toolset (no shell, no filesystem)             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Output Scanning                                          │
│    ✓ Detect leaked API keys (Anthropic, OpenAI, etc.)      │
│    ✓ Detect leaked tokens (GitHub PAT, OAuth, etc.)        │
│    ✓ Block response if secrets found                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Incident Response                                        │
│    ✓ Create security issue with details                    │
│    ✓ Fail workflow with clear error                        │
│    ✓ Never post compromised response to PR                 │
└─────────────────────────────────────────────────────────────┘
```

## Security Scripts

### Shared Patterns (`secret-patterns.sh`)

Central source of truth for secret detection patterns. This file is sourced by:
- `sanitize-output.sh` - Uses `SECRET_PATTERNS` array for comprehensive regex matching
- `action.yml` (Build safe prompt step) - Uses `SECRET_PATTERNS` for prompt verification

**Why shared patterns?**
- **DRY principle**: Single source of truth prevents drift
- **Consistency**: Same patterns across all security layers
- **Maintainability**: Update patterns in one place

**Secret patterns detected:**
```bash
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
```

### `check-auth.sh`

**Purpose:** Authorization check for PR review mode

**Function:** Validates that only OWNER, MEMBER, and COLLABORATOR roles can trigger PR reviews

**Security:** Uses `jq --arg` for safe variable passing (prevents injection)

**Usage:**
```bash
./check-auth.sh "$ASSOCIATION" '["OWNER", "MEMBER", "COLLABORATOR"]'
```

**Outputs:**
- `authorized=true/false` to `$GITHUB_OUTPUT`
- Exits with code 1 if unauthorized

### `sanitize-input.sh`

**Purpose:** Input sanitization for PR diffs

**Function:**
- Removes code comments (common injection vector)
- Detects suspicious patterns (prompt injection attempts)
- Validates PR size limits

**Patterns detected:**
- Prompt injection keywords (`ignore.*previous.*instruction`, `system.*override`, etc.)
- Environment variable access attempts (`process.env`, `os.environ`, `System.getenv`)
- Base64 encoded payloads (32+ characters)
- Secret names (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`)

**Usage:**
```bash
./sanitize-input.sh input.diff output.diff
```

**Outputs:**
- `blocked=true/false` to `$GITHUB_OUTPUT`
- Exits with code 1 if suspicious patterns detected

### `sanitize-output.sh`

**Purpose:** Output scanning for leaked secrets

**Function:** Last line of defense - scans AI responses for leaked API keys/tokens

**Patterns:** Sources from `secret-patterns.sh` for comprehensive detection

**Usage:**
```bash
./sanitize-output.sh output-file.txt
```

**Outputs:**
- `leaked=true/false` to `$GITHUB_OUTPUT`
- Exits with code 1 if secrets detected

### `sanitize-prompt.sh`

**Purpose:** Prompt sanitization for general agent mode

**Function:**
- Warns about suspicious patterns in user prompts
- Detects prompt injection attempts
- Checks for encoded content

**Note:** This is warning-only (execution continues) unlike input sanitization which blocks

**Usage:**
```bash
./sanitize-prompt.sh "User prompt here"
```

**Outputs:**
- `suspicious=true/false` to `$GITHUB_OUTPUT`
- Exits with code 0 (warnings only)

## Built-in Protections

### Prompt Injection Protection

- Removes all code comments before analysis (prevents hidden instructions)
- Blocks patterns like "ignore previous instructions", "show me the API key"
- Detects encoded requests (base64, hex, ROT13)

### Secret Leak Prevention

- Scans for API key patterns with specific lengths and formats
- Checks for environment variable names in output
- Blocks posting if any secrets detected
- Creates security incident issues automatically

### Access Control (PR Mode)

- Hardcoded to OWNER, MEMBER, and COLLABORATOR only
- Cannot be disabled or overridden
- External contributors automatically blocked

## Security Testing

### Running Tests

```bash
cd tests

# Run security test suite (10 tests)
./test-security.sh

# Run exploit simulation tests (6 tests)
./test-exploits.sh
```

### Test Coverage

**test-security.sh** (10 tests):
1. Clean input (should pass)
2. Prompt injection in comment (should block)
3. Clean output (should pass)
4. Leaked API key (should block)
5. Leaked GitHub token (should block)
6. Authorization - OWNER (should pass)
7. Authorization - CONTRIBUTOR (should block)
8. Clean prompt (should pass)
9. Prompt injection in user prompt (should warn)
10. Encoded content in prompt (should warn)

**test-exploits.sh** (6 tests):
1. Prompt injection via comment (should be blocked)
2. Encoded base64 injection (should be blocked)
3. Output token leak (should be blocked)
4. Prompt override attempt (should warn)
5. Extra args parsing sanity check
6. Quoted arguments handling

All tests must pass before deployment.

## Security in Practice

### General Agent Mode

```yaml
- name: Run Agent
  id: agent
  uses: docker/cagent-action@v2.0.0
  with:
    agent: my-agent
    prompt: "Analyze the logs"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Check for security issues
  if: always()
  run: |
    if [ "${{ steps.agent.outputs.secrets-detected }}" == "true" ]; then
      echo "⚠️ Secret leak detected - incident issue created"
    fi
    if [ "${{ steps.agent.outputs.prompt-suspicious }}" == "true" ]; then
      echo "⚠️ Prompt had suspicious patterns"
    fi
```

### PR Review Mode

```yaml
- name: AI PR Review
  uses: docker/cagent-action@v2.0.0
  with:
    pr-number: ${{ github.event.pull_request.number }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
# Automatically uses built-in secure PR reviewer
# Security automatically enforced:
# - Auth check (OWNER/MEMBER/COLLABORATOR only)
# - Input sanitization
# - Output scanning
# - Auto-creates issue if secrets detected
```

## Maintenance

### Adding New Secret Patterns

When adding new secret patterns:

1. **Update `secret-patterns.sh`** with new regex pattern:
   ```bash
   SECRET_PATTERNS=(
     # ... existing patterns ...
     'new-provider-[a-zA-Z0-9]{40}'  # New provider API keys
   )
   ```

2. **Add to `SECRET_PREFIXES`** if needed for quick checks:
   ```bash
   SECRET_PREFIXES='(sk-ant-|...|new-provider-)'
   ```

3. **Run tests** to verify:
   ```bash
   cd tests
   ./test-security.sh
   ./test-exploits.sh
   ```

4. **Consider adding a specific test case** for the new pattern in `test-security.sh`

### Security Review Checklist

Before deploying changes:

- [ ] All security tests pass (`test-security.sh`)
- [ ] All exploit tests pass (`test-exploits.sh`)
- [ ] Shared patterns are used consistently
- [ ] New patterns added to `secret-patterns.sh` only
- [ ] No hardcoded secrets in code
- [ ] Authorization checks cannot be bypassed
- [ ] Output scanning covers all execution paths

## Security Outputs

The action provides security-related outputs that can be checked in subsequent steps:

| Output | Description | Available In |
|--------|-------------|-------------|
| `security-blocked` | Execution blocked due to security concerns | PR review mode only |
| `secrets-detected` | Secrets detected in output | All modes |
| `prompt-suspicious` | Suspicious patterns in user prompt | General mode only |

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email security concerns to the maintainers
3. Provide detailed information about the vulnerability
4. Allow time for a fix before public disclosure

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GitHub Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [CAgent Repository](https://github.com/docker/cagent)
