# Security Documentation

This directory contains security hardening scripts for the cagent-action GitHub Action.

## 🔒 Security Features

This action includes **built-in security features for all agent executions**:

1. **Output Scanning** - All agent responses are scanned for leaked secrets:

   - API key patterns: `sk-ant-*`, `sk-*`, `sk-proj-*`
   - GitHub tokens: `ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `github_pat_*`
   - Environment variable names in output
   - If secrets detected: workflow fails, security issue created

2. **Prompt Sanitization** - User prompts are checked for:
   - Prompt injection patterns ("ignore previous instructions", etc.)
   - Requests for API keys or environment variables
   - Encoded content (base64, hex) that could hide malicious requests
   - Warnings issued if suspicious patterns found (execution continues)

## Security Architecture

The action implements a defense-in-depth approach:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Prompt Sanitization                                      │
│    ✓ Detect prompt injection attempts                       │
│    ✓ Warn about suspicious patterns                         │
│    ✓ Check for encoded malicious content                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Agent Execution                                          │
│    ✓ User-provided agent runs in isolated cagent runtime    │
│    ✓ No direct access to secrets or environment vars        │
│    ✓ Controlled execution environment                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Output Scanning                                          │
│    ✓ Scan for leaked API keys (Anthropic, OpenAI, etc.)     │
│    ✓ Scan for leaked tokens (GitHub PAT, OAuth, etc.)       │
│    ✓ Block execution if secrets found                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Incident Response                                        │
│    ✓ Create security issue with details                     │
│    ✓ Fail workflow with clear error                         │
│    ✓ Prevent secret exposure in logs                        │
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

### `sanitize-input.sh`

**Purpose:** Input sanitization for PR diffs and user prompts

**Function:**

- Removes code comments from diffs (prevents hidden instructions)
- Detects HIGH-RISK patterns (blocks execution)
  - Instruction override attempts ("ignore previous instructions")
  - Direct secret extraction commands (`echo $API_KEY`, `console.log(process.env)`)
  - System prompt extraction attempts
  - Jailbreak attempts
  - Encoding/obfuscation (base64, hex)
- Detects MEDIUM-RISK patterns (warns but allows execution)
  - API key variable names in configuration

**Usage:**

```bash
./sanitize-input.sh input-file.txt output-file.txt
```

**Outputs:**

- `blocked=true/false` to `$GITHUB_OUTPUT`
- `risk-level=low/medium/high` to `$GITHUB_OUTPUT`
- Exits with code 1 if HIGH-RISK patterns detected

## Built-in Protections

### Prompt Injection Protection

- Removes all code comments before analysis (prevents hidden instructions)
- Blocks patterns like "ignore previous instructions", "show me the API key"
- Detects encoded requests (base64, hex, ROT13)

### Secret Leak Prevention

- Scans for API key patterns with specific lengths and formats
- Checks for environment variable names in output
- Blocks execution if any secrets detected
- Creates security incident issues automatically

## Security Testing

### Running Tests

```bash
cd tests

# Run security test suite (13 tests)
./test-security.sh

# Run exploit simulation tests (6 tests)
./test-exploits.sh
```

### Test Coverage

**test-security.sh** (13 tests):

1. Clean input (should pass)
2. Prompt injection in comment (should block)
3. Clean output (should pass)
4. Leaked API key (should block)
5. Leaked GitHub token (should block)
6. Authorization - OWNER (should pass)
7. Authorization - COLLABORATOR (should pass)
8. Authorization - CONTRIBUTOR (should block)
9. Clean prompt (should pass)
10. Prompt injection in user prompt (should block)
11. Encoded content in prompt (should block)
12. Low risk input - normal code (should pass)
13. Medium risk input - API key variable (should warn but pass)
14. High risk input - behavioral injection (should block)

**test-exploits.sh** (6 tests):

1. Prompt injection via comment (should be stripped)
2. High-risk behavioral injection (should be blocked)
3. Output token leak (should be blocked)
4. Prompt override attempt (should warn)
5. Extra args parsing sanity check
6. Quoted arguments handling

All tests must pass before deployment.

## Security in Practice

### Basic Usage with Security Checks

```yaml
- name: Run Agent
  id: agent
  uses: docker/cagent-action@v1.0.4
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

All executions automatically include:

- Prompt sanitization warnings
- Output scanning for secrets
- Incident issue creation if secrets detected
- Workflow failure on security violations

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

| Output              | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `secrets-detected`  | `true` if secrets were detected in output             |
| `prompt-suspicious` | `true` if suspicious patterns were detected in prompt |

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
