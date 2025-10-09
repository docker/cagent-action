# CAgent GitHub Action

A GitHub Action for running [CAgent](https://github.com/docker/cagent) AI agents in your workflows. This action simplifies the setup and execution of CAgent, handling binary downloads and environment configuration automatically.

## Features

- 🚀 Single-line agent execution
- 📦 Automatic download of cagent and mcp-gateway binaries
- 🔧 Configurable versions for both dependencies
- 🎯 Built-in support for common agent patterns
- 🔐 Secure secret handling

## Usage

### Basic Example

```yaml
- name: Run CAgent PR Reviewer
  uses: docker/cagent-action@v1
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

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Review PR with CAgent
        uses: docker/cagent-action@v1
        with:
          agent: jeanlaurent/pr-reviewer
          prompt: "check PR ${{ github.event.number }} in repository ${{ github.repository }} and add a review to the pull request comments"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Using a Local Agent File

```yaml
- name: Run Custom Agent
  uses: docker/cagent-action@v1
  with:
    agent: ./agents/my-agent.yaml
    prompt: "Analyze the codebase"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run CAgent with Custom Settings
  uses: docker/cagent-action@v1
  with:
    agent: jeanlaurent/pr-reviewer
    prompt: "Review this PR"
    cagent-version: v1.6.6
    mcp-gateway: true  # Set to true to install mcp-gateway
    mcp-gateway-version: v0.22.0
    yolo: false  # Require manual approval
    tui: true    # Enable terminal UI
    working-directory: ./src
    extra-args: "--verbose"
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `agent` | Agent identifier (e.g., `jeanlaurent/pr-reviewer`) or path to `.yaml` file | Yes | - |
| `prompt` | Prompt to pass to the agent | No | - |
| `cagent-version` | Version of cagent to use | No | `v1.6.6` |
| `mcp-gateway` | Install mcp-gateway (`true`/`false`) | No | `false` |
| `mcp-gateway-version` | Version of mcp-gateway to use (specifying this will enable mcp-gateway installation) | No | `v0.22.0` |
| `anthropic-api-key` | Anthropic API key | No | `$ANTHROPIC_API_KEY` env var |
| `openai-api-key` | OpenAI API key | No | `$OPENAI_API_KEY` env var |
| `google-api-key` | Google API key for Gemini | No | `$GOOGLE_API_KEY` env var |
| `github-token` | GitHub token for API access | No | `${{ github.token }}` |
| `working-directory` | Working directory to run the agent in | No | `.` |
| `tui` | Enable TUI mode (`true`/`false`) | No | `false` |
| `yolo` | Auto-approve all prompts (`true`/`false`) | No | `true` |
| `extra-args` | Additional arguments to pass to `cagent run` | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | Exit code from the cagent run |

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
        uses: docker/cagent-action@v1
        with:
          agent: security-reviewer
          prompt: "Analyze for security issues"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Code Quality Review
        uses: docker/cagent-action@v1
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
        uses: docker/cagent-action@v1
        with:
          agent: ${{ github.event.inputs.agent }}
          prompt: ${{ github.event.inputs.prompt }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Troubleshooting

### Missing API Key

If you see an error about missing API keys:
1. Go to your repository Settings → Secrets and variables → Actions
2. Add the appropriate secret for your AI provider:
   - `ANTHROPIC_API_KEY` for Claude models
   - `OPENAI_API_KEY` for GPT models
   - `GOOGLE_API_KEY` for Gemini models

### Permission Denied

If the agent cannot comment on PRs:
1. Check that your workflow has `pull-requests: write` permission
2. Ensure `GITHUB_TOKEN` has appropriate scopes

### Binary Download Failures

If binary downloads fail:
- Check your network connectivity
- Verify the specified versions exist in the releases
- Try using different versions with `cagent-version` and `mcp-gateway-version` inputs

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/docker/cagent-action).

## License

MIT License - see LICENSE file for details.

## Links

- [CAgent Repository](https://github.com/docker/cagent)
- [MCP Gateway Repository](https://github.com/docker/mcp-gateway)
- [Documentation](https://github.com/docker/cagent-action)
