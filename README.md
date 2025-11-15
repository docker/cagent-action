# cagent GitHub Action

A GitHub Action for running [cagent](https://github.com/docker/cagent) AI agents in your workflows. This action simplifies the setup and execution of CAgent, handling binary downloads and environment configuration automatically.

## Quick Start

1. **Add the action to your workflow**:
   ```yaml
   - uses: docker/cagent-action@v1.0.0
     with:
       agent: docker/code-analyzer
       prompt: "Analyze this code"
     env:
       ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

2. **Configure API key** in your repository settings:
   - Go to `Settings` → `Secrets and variables` → `Actions`
   - Add `ANTHROPIC_API_KEY` with your API key from [Anthropic Console](https://console.anthropic.com/)

3. **That's it!** The action will automatically:
   - Download the cagent binary
   - Run your specified agent
   - Scan outputs for leaked secrets
   - Provide results in workflow logs

## 🔒 Security Features

This action includes **built-in security features for all agent executions**:

- **Secret Leak Prevention**: Scans all agent outputs for API keys and tokens (Anthropic, OpenAI, GitHub)
- **Prompt Injection Detection**: Warns about suspicious patterns in user prompts
- **Automatic Incident Response**: Creates security issues and fails workflows when secrets are detected

See [security/README.md](security/README.md) for complete security documentation.

## Usage

### Basic Example

```yaml
- name: Run CAgent
  uses: docker/cagent-action@v1.0.0
  with:
    agent: docker/github-action-security-scanner
    prompt: "Analyze these commits for security vulnerabilities"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Analyzing Code Changes

```yaml
name: Code Analysis
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write  # For security incident reporting

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Get PR diff
        id: diff
        run: |
          gh pr diff ${{ github.event.pull_request.number }} > pr.diff
        env:
          GH_TOKEN: ${{ github.token }}

      - name: Analyze Changes
        id: analysis
        uses: docker/cagent-action@v1.0.0
        with:
          agent: docker/code-analyzer
          prompt: |
            Analyze these code changes for quality and best practices:

            ```diff
            $(cat pr.diff)
            ```
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Post analysis
        run: |
          gh pr comment ${{ github.event.pull_request.number }} \
            --body-file "${{ steps.analysis.outputs.output-file }}"
        env:
          GH_TOKEN: ${{ github.token }}
```

### Using a Local Agent File

```yaml
- name: Run Custom Agent
  uses: docker/cagent-action@v1.0.0
  with:
    agent: ./agents/my-agent.yaml
    prompt: "Analyze the codebase"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run CAgent with Custom Settings
  uses: docker/cagent-action@v1.0.0
  with:
    agent: docker/code-analyzer
    prompt: "Analyze this codebase"
    cagent-version: v1.9.11
    mcp-gateway: true  # Set to true to install mcp-gateway
    mcp-gateway-version: v0.22.0
    yolo: false  # Require manual approval
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
  uses: docker/cagent-action@v1.0.0
  with:
    agent: docker/code-analyzer
    prompt: "Analyze this codebase"
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
| `agent` | Agent identifier (e.g., `docker/code-analyzer`) or path to `.yaml` file | Yes | - |
| `prompt` | Prompt to pass to the agent | No | - |
| `cagent-version` | Version of cagent to use | No | `v1.9.12` |
| `mcp-gateway` | Install mcp-gateway (`true`/`false`) | No | `false` |
| `mcp-gateway-version` | Version of mcp-gateway to use (specifying this will enable mcp-gateway installation) | No | `v0.22.0` |
| `anthropic-api-key` | Anthropic API key | No | `$ANTHROPIC_API_KEY` env var |
| `openai-api-key` | OpenAI API key | No | `$OPENAI_API_KEY` env var |
| `google-api-key` | Google API key for Gemini | No | `GOOGLE_API_KEY` env var |
| `github-token` | GitHub token for API access | No | Auto-provided by GitHub Actions |
| `timeout` | Timeout in seconds for agent execution (0 for no timeout) | No | `0` |
| `debug` | Enable debug mode with verbose logging (`true`/`false`) | No | `false` |
| `working-directory` | Working directory to run the agent in | No | `.` |
| `yolo` | Auto-approve all prompts (`true`/`false`) | No | `true` |
| `extra-args` | Additional arguments to pass to `cagent exec` | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | Exit code from the cagent exec |
| `output-file` | Path to the output log file |
| `cagent-version` | Version of cagent that was used |
| `mcp-gateway-installed` | Whether mcp-gateway was installed (`true`/`false`) |
| `execution-time` | Agent execution time in seconds |
| `secrets-detected` | Whether secrets were detected in output |
| `prompt-suspicious` | Whether suspicious patterns were detected in user prompt |

## Environment Variables

The action supports the following environment variables for different AI providers:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude models
- `OPENAI_API_KEY`: Your OpenAI API key for GPT models
- `GOOGLE_API_KEY`: Your Google API key for Gemini models
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions (for GitHub API access)

## Permissions

For GitHub integration features (commenting on PRs, creating issues), ensure your workflow has appropriate permissions:

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
        uses: docker/cagent-action@v1.0.0
        with:
          agent: docker/github-action-security-scanner
          prompt: "Analyze for security issues"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Code Quality Analysis
        uses: docker/cagent-action@v1.0.0
        with:
          agent: docker/code-quality-analyzer
          prompt: "Analyze code quality and best practices"
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
        default: 'docker/code-analyzer'
      prompt:
        description: 'Prompt for the agent'
        required: true

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent
        uses: docker/cagent-action@v1.0.0
        with:
          agent: ${{ github.event.inputs.agent }}
          prompt: ${{ github.event.inputs.prompt }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```


## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Setting up your development environment
- Running tests
- Submitting pull requests
- Reporting security issues

Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Support

- 📖 [Documentation](README.md)
- 🐛 [Report Issues](https://github.com/docker/cagent-action/issues)
- 💬 [Discussions](https://github.com/docker/cagent-action/discussions)
- 🔒 [Security Policy](security/README.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [CAgent Repository](https://github.com/docker/cagent)
- [MCP Gateway Repository](https://github.com/docker/mcp-gateway)
