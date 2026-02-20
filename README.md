# cagent GitHub Action

A GitHub Action for running [cagent](https://github.com/docker/cagent) AI agents in your workflows. This action simplifies the setup and execution of cagent, handling binary downloads and environment configuration automatically.

## Quick Start

1. **Add the action to your workflow**:

   ```yaml
   - uses: docker/cagent-action@latest
     with:
       agent: path/to/agent.yaml
       prompt: "Analyze this code"
       anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

2. **Configure API key** in your repository settings:

   - Go to `Settings` → `Secrets and variables` → `Actions`
   - Add `ANTHROPIC_API_KEY` (or another provider's key) from [Anthropic Console](https://console.anthropic.com/)

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

### AI-Powered PR Reviews

For automated pull request reviews with a multi-agent system, see the [PR Review workflow documentation](review-pr/README.md). The workflow supports:

- Automatic reviews when PRs are opened
- Manual `/review` command in PR comments
- Learning from feedback to improve future reviews
- Customizable review guidelines per language/project

**Quick setup:** Add a workflow file that calls our reusable workflow:

```yaml
name: PR Review
on:
  issue_comment:               # Enables /review command in PR comments
    types: [created]
  pull_request_review_comment: # Captures feedback on review comments for learning
    types: [created]
  pull_request_target:         # Triggers auto-review on PR open; uses base branch context so secrets work with forks
    types: [ready_for_review, opened]

permissions:
  contents: read # This is required to be a top-level permission to give `issue_comment` events (on forked PRs) access to the secrets below.

jobs:
  review:
    uses: docker/cagent-action/.github/workflows/review-pr.yml@latest
    # Scoped to the job so other jobs in this workflow aren't over-permissioned
    permissions:
      contents: read       # Read repository files and PR diffs
      pull-requests: write # Post review comments and approve/request changes
      issues: write        # Create security incident issues if secrets are detected in output
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      CAGENT_ORG_MEMBERSHIP_TOKEN: ${{ secrets.CAGENT_ORG_MEMBERSHIP_TOKEN }}         # PAT with read:org scope; gates auto-reviews to org members only
      CAGENT_REVIEWER_APP_ID: ${{ secrets.CAGENT_REVIEWER_APP_ID }}                   # GitHub App ID; reviews appear as your app instead of github-actions[bot]
      CAGENT_REVIEWER_APP_PRIVATE_KEY: ${{ secrets.CAGENT_REVIEWER_APP_PRIVATE_KEY }} # GitHub App private key; paired with App ID above
```

See the [full PR Review documentation](review-pr/README.md) for more details.

### Using a Local Agent File

```yaml
- name: Run Custom Agent
  uses: docker/cagent-action@latest
  with:
    agent: ./agents/my-agent.yaml
    prompt: "Analyze the codebase"
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run cagent with Custom Settings
  uses: docker/cagent-action@latest
  with:
    agent: docker/code-analyzer
    prompt: "Analyze this codebase"
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    cagent-version: v1.23.4
    mcp-gateway: true # Set to true to install mcp-gateway
    mcp-gateway-version: v0.22.0
    yolo: false # Require manual approval
    timeout: 600 # 10 minute timeout
    debug: true # Enable debug logging
    quiet: false # Show verbose tool calls (default: true)
    working-directory: ./src
    extra-args: "--verbose"
    add-prompt-files: "AGENTS.md,CLAUDE.md" # Append these files to the prompt
```

### Using Outputs

```yaml
- name: Run cagent
  id: agent
  uses: docker/cagent-action@latest
  with:
    agent: docker/code-analyzer
    prompt: "Analyze this codebase"
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

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

| Input                 | Description                                                                          | Required | Default                         |
| --------------------- | ------------------------------------------------------------------------------------ | -------- | ------------------------------- |
| `agent`               | Agent identifier (e.g., `docker/code-analyzer`) or path to `.yaml` file              | Yes      | -                               |
| `prompt`              | Prompt to pass to the agent                                                          | No       | -                               |
| `cagent-version`      | Version of cagent to use                                                             | No       | `v1.23.4`                       |
| `mcp-gateway`         | Install mcp-gateway (`true`/`false`)                                                 | No       | `false`                         |
| `mcp-gateway-version` | Version of mcp-gateway to use (specifying this will enable mcp-gateway installation) | No       | `v0.22.0`                       |
| `anthropic-api-key`   | Anthropic API key for Claude models (at least one API key required)                  | No*      | -                                   |
| `openai-api-key`      | OpenAI API key (at least one API key required)                                       | No*      | -                                   |
| `google-api-key`      | Google API key for Gemini models (at least one API key required)                     | No*      | -                                   |
| `aws-bearer-token-bedrock` | AWS Bearer token for Bedrock models (at least one API key required)             | No*      | -                                   |
| `xai-api-key`         | xAI API key for Grok models (at least one API key required)                          | No*      | -                                   |
| `nebius-api-key`      | Nebius API key (at least one API key required)                                       | No*      | -                                   |
| `mistral-api-key`     | Mistral API key (at least one API key required)                                      | No*      | -                                   |
| `github-token`        | GitHub token for API access                                                          | No       | `github.token`                      |
| `github-app-id`       | GitHub App ID for custom identity (comments/reviews appear as the app)               | No       | -                                   |
| `github-app-private-key` | GitHub App private key (required if `github-app-id` is provided)                  | No       | -                                   |
| `timeout`             | Timeout in seconds for agent execution (0 for no timeout)                            | No       | `0`                             |
| `debug`               | Enable debug mode with verbose logging (`true`/`false`)                              | No       | `false`                         |
| `working-directory`   | Working directory to run the agent in                                                | No       | `.`                             |
| `yolo`                | Auto-approve all prompts (`true`/`false`)                                            | No       | `true`                          |
| `quiet`               | Suppress verbose tool call output (`true`/`false`). Set to `false` for debugging.    | No       | `true`                          |
| `max-retries`         | Maximum number of retries on failure (0 = no retries)                                | No       | `2`                             |
| `retry-delay`         | Seconds to wait between retries                                                      | No       | `5`                             |
| `extra-args`          | Additional arguments to pass to `cagent run`                                         | No       | -                               |
| `add-prompt-files`    | Comma-separated list of files to append to the prompt (e.g., `AGENTS.md,CLAUDE.md`)  | No       | -                               |

### Prompt Files (`add-prompt-files`)

The `add-prompt-files` input allows you to include additional context files (like `AGENTS.md`, `CLAUDE.md`) as system messages. This uses cagent's `--prompt-file` flag under the hood.

**File Resolution (handled by cagent):**
- Searches up the directory hierarchy (like `.gitignore`)
- Also checks the home folder (`~/`)
- Files are added as system messages, not appended to the user prompt

**Examples:**

```yaml
# Single file
add-prompt-files: "AGENTS.md"

# Multiple files
add-prompt-files: "AGENTS.md,CLAUDE.md"

# With custom working directory
working-directory: ./src
add-prompt-files: "AGENTS.md"  # Found via hierarchy search
```

## Outputs

| Output                  | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `exit-code`             | Exit code from cagent run                                |
| `output-file`           | Path to the output log file                              |
| `cagent-version`        | Version of cagent that was used                          |
| `mcp-gateway-installed` | Whether mcp-gateway was installed (`true`/`false`)       |
| `execution-time`        | Agent execution time in seconds                          |
| `secrets-detected`      | Whether secrets were detected in output                  |
| `prompt-suspicious`     | Whether suspicious patterns were detected in user prompt |

## API Keys

**At least one API key is required.** The action validates this at startup and fails fast with a clear error if no API key is provided.

Supported providers:
- **Anthropic** (`anthropic-api-key`): Claude models - [Get API key](https://console.anthropic.com/)
- **OpenAI** (`openai-api-key`): GPT models - [Get API key](https://platform.openai.com/)
- **Google** (`google-api-key`): Gemini models - [Get API key](https://aistudio.google.com/)
- **AWS Bedrock** (`aws-bearer-token-bedrock`): Various models via AWS
- **xAI** (`xai-api-key`): Grok models - [Get API key](https://console.x.ai/)
- **Nebius** (`nebius-api-key`): Nebius models
- **Mistral** (`mistral-api-key`): Mistral models - [Get API key](https://console.mistral.ai/)

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
        uses: docker/cagent-action@latest
        with:
          agent: docker/github-action-security-scanner
          prompt: "Analyze for security issues"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Code Quality Analysis
        uses: docker/cagent-action@latest
        with:
          agent: docker/code-quality-analyzer
          prompt: "Analyze code quality and best practices"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### PR Review Workflow

For comprehensive documentation on setting up AI-powered PR reviews, including features like automatic reviews, the `/review` command, feedback learning, and customization options, see the **[PR Review documentation](review-pr/README.md)**.

### Manual Trigger with Inputs

```yaml
name: Manual Agent Run
on:
  workflow_dispatch:
    inputs:
      agent:
        description: "Agent to run"
        required: true
        default: "docker/code-analyzer"
      prompt:
        description: "Prompt for the agent"
        required: true

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent
        uses: docker/cagent-action@latest
        with:
          agent: ${{ github.event.inputs.agent }}
          prompt: ${{ github.event.inputs.prompt }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
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

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Links

- [cagent Repository](https://github.com/docker/cagent)
- [MCP Gateway Repository](https://github.com/docker/mcp-gateway)
