# cagent GitHub Action

A GitHub Action for running [cagent](https://github.com/docker/cagent) AI agents in your workflows. This action simplifies the setup and execution of CAgent, handling binary downloads and environment configuration automatically.

## 🔒 Security-Hardened for Open Source

This action includes **built-in security features for all agent executions**:

**Universal Security (All Modes):**
- **Secret Leak Prevention**: Scans ALL agent outputs for API keys and tokens (Anthropic, OpenAI, GitHub)
- **Prompt Injection Detection**: Warns about suspicious patterns in user prompts
- **Automatic Incident Response**: Creates security issues and fails workflows when secrets are detected

**PR Review Mode Security (When `pr-number` provided):**
- **Authorization**: Only OWNER and MEMBER contributors can trigger (hardcoded, cannot be disabled)
- **Input Sanitization**: Removes code comments and blocks malicious diff patterns
- **Size Limits**: Enforces max PR size (3000 lines default) to prevent DoS

See [Security Features](#security-features) for complete details.

## Usage

### Basic Example

```yaml
- name: Run CAgent PR Reviewer
  uses: docker/cagent-action@v2.0.0
  with:
    agent: jeanlaurent/pr-reviewer
    prompt: "Review this pull request"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### PR Review Example

```yaml
name: AI PR Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write  # For security incident reporting

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: AI PR Review
        uses: docker/cagent-action@v2.0.0
        with:
          pr-number: ${{ github.event.pull_request.number }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Note:** When `pr-number` is provided, the action automatically uses the built-in secure PR reviewer agent. No need to specify the `agent` input.

**How it works:**
1. Action checks author is OWNER or MEMBER (blocks external contributors)
2. Fetches and sanitizes PR diff (removes comments, checks for malicious patterns)
3. Runs multi-agent reviewer (coordinator delegates to specialized sub-agents)
4. Scans output for leaked secrets (API keys, tokens)
5. Posts review to PR or creates security incident issue

See the [examples/pr-review.yml](examples/pr-review.yml) for a complete example.

### Using a Local Agent File

```yaml
- name: Run Custom Agent
  uses: docker/cagent-action@v2.0.0
  with:
    agent: ./agents/my-agent.yaml
    prompt: "Analyze the codebase"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run CAgent with Custom Settings
  uses: docker/cagent-action@v2.0.0
  with:
    agent: jeanlaurent/pr-reviewer
    prompt: "Review this PR"
    cagent-version: v1.6.6
    mcp-gateway: true  # Set to true to install mcp-gateway
    mcp-gateway-version: v0.22.0
    yolo: false  # Require manual approval
    tui: true    # Enable terminal UI
    timeout: 600  # 10 minute timeout
    debug: true   # Enable debug logging
    working-directory: ./src
    extra-args: "--verbose"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Using Outputs

```yaml
- name: Run CAgent
  id: agent
  uses: docker/cagent-action@v2.0.0
  with:
    agent: jeanlaurent/pr-reviewer
    prompt: "Review this pull request"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Check execution time
  run: |
    echo "Agent took ${{ steps.agent.outputs.execution-time }} seconds"
    if [ "${{ steps.agent.outputs.execution-time }}" -gt 300 ]; then
      echo "Warning: Agent took longer than 5 minutes"
    fi

- name: Upload output log
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: agent-output
    path: ${{ steps.agent.outputs.output-file }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `agent` | Agent identifier (e.g., `jeanlaurent/pr-reviewer`) or path to `.yaml` file. Optional when `pr-number` is provided (uses built-in secure PR reviewer) | No** | - |
| `prompt` | Prompt to pass to the agent | No | - |
| `pr-number` | Pull request number (for PR review mode with built-in security) | No** | - |
| `max-pr-size` | Maximum PR size in lines (for PR review mode) | No | `3000` |
| `cagent-version` | Version of cagent to use | No | `v1.6.6` |
| `mcp-gateway` | Install mcp-gateway (`true`/`false`) | No | `false` |
| `mcp-gateway-version` | Version of mcp-gateway to use (specifying this will enable mcp-gateway installation) | No | `v0.22.0` |
| `anthropic-api-key` | Anthropic API key | No | `$ANTHROPIC_API_KEY` env var |
| `openai-api-key` | OpenAI API key | No | `$OPENAI_API_KEY` env var |
| `google-api-key` | Google API key for Gemini | No | `$GOOGLE_API_KEY` env var |
| `github-token` | GitHub token for API access | No | Auto-provided by GitHub Actions |
| `timeout` | Timeout in seconds for agent execution (0 for no timeout) | No | `0` |
| `debug` | Enable debug mode with verbose logging (`true`/`false`) | No | `false` |
| `working-directory` | Working directory to run the agent in | No | `.` |
| `tui` | Enable TUI mode (`true`/`false`) | No | `false` |
| `yolo` | Auto-approve all prompts (`true`/`false`) | No | `true` |
| `extra-args` | Additional arguments to pass to `cagent run` | No | - |

\*\* Either `agent` or `pr-number` must be provided. When `pr-number` is provided without `agent`, the built-in secure PR reviewer is automatically used.

## Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | Exit code from the cagent run |
| `output-file` | Path to the output log file |
| `cagent-version` | Version of cagent that was used |
| `mcp-gateway-installed` | Whether mcp-gateway was installed (`true`/`false`) |
| `execution-time` | Agent execution time in seconds |
| `security-blocked` | Whether execution was blocked due to security concerns (PR review mode only) |
| `secrets-detected` | Whether secrets were detected in output (checked for all modes) |
| `prompt-suspicious` | Whether suspicious patterns were detected in user prompt (general mode only) |

## Environment Variables

The action supports the following environment variables for different AI providers:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude models
- `OPENAI_API_KEY`: Your OpenAI API key for GPT models
- `GOOGLE_API_KEY`: Your Google API key for Gemini models
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions (for GitHub API access)

## Permissions

For PR review and GitHub integration features, ensure your workflow has appropriate permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

## Examples

### Multiple Agents in a Workflow

```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Security Review
        uses: docker/cagent-action@v2.0.0
        with:
          agent: security-reviewer
          prompt: "Analyze for security issues"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Code Quality Review
        uses: docker/cagent-action@v2.0.0
        with:
          agent: code-reviewer
          prompt: "Review code quality and best practices"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Manual Trigger with Inputs

```yaml
name: Manual Agent Run
on:
  workflow_dispatch:
    inputs:
      agent:
        description: 'Agent to run'
        required: true
        default: 'jeanlaurent/pr-reviewer'
      prompt:
        description: 'Prompt for the agent'
        required: true

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent
        uses: docker/cagent-action@v2.0.0
        with:
          agent: ${{ github.event.inputs.agent }}
          prompt: ${{ github.event.inputs.prompt }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Security Features

### Universal Security (All Agent Executions)

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

### PR Review Mode: Defense in Depth

When using `pr-number` input for PR reviews, **additional** security layers activate:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Authorization Check                                      │
│    ✓ Only OWNER and MEMBER can trigger (hardcoded)         │
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

### Built-in Protections

**Prompt Injection Protection:**
- Removes all code comments before analysis (prevents hidden instructions)
- Blocks patterns like "ignore previous instructions", "show me the API key"
- Detects encoded requests (base64, hex, ROT13)

**Secret Leak Prevention:**
- Scans for API key patterns: `sk-ant-*`, `sk-*`, `ghp_*`, `gho_*`, etc.
- Checks for environment variable names in output
- Blocks posting if any secrets detected

**Access Control:**
- Hardcoded to OWNER and MEMBER only
- Cannot be disabled or overridden
- External contributors automatically blocked

### Security Testing

Run the test suite:
```bash
cd tests
./test-security.sh
```

**10 Tests covering:**
- Authorization enforcement (PR mode)
- Input sanitization - PR diffs (comment removal, pattern detection)
- Prompt sanitization - user prompts (injection detection, encoding detection)
- Output scanning - all modes (API key leak detection, token detection)

All tests must pass before deployment.

### Security in Practice

**General Agent Example:**
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

**PR Review Example:**
```yaml
- name: AI PR Review
  uses: docker/cagent-action@v2.0.0
  with:
    pr-number: ${{ github.event.pull_request.number }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
# Automatically uses built-in secure PR reviewer
# Security automatically enforced:
# - Auth check (OWNER/MEMBER only)
# - Input sanitization
# - Output scanning
# - Auto-creates issue if secrets detected
```

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/docker/cagent-action).

## License

MIT License - see LICENSE file for details.

## Links

- [CAgent Repository](https://github.com/docker/cagent)
- [MCP Gateway Repository](https://github.com/docker/mcp-gateway)
