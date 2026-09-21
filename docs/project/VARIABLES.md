# Environment Variables

Copy [`.env.example`](../../.env.example) → `.env` in the package directory **or** set the same keys in MCP `env`. Choose a direct API provider with its key, or a signed-in local CLI provider without a separate API key.

## Required (pick one provider)

| Variable                       | When required                  | Description                                                                                                                        |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CRITIC_PROVIDER`              | Recommended (default `openai`) | `openai` \| `anthropic` \| `google` \| `minimax` \| `opencode` \| `codex-cli` \| `claude-code` \| `cursor-agent` \| `opencode-cli` |
| `OPENAI_API_KEY`               | `CRITIC_PROVIDER=openai`       | OpenAI API key                                                                                                                     |
| `ANTHROPIC_API_KEY`            | `CRITIC_PROVIDER=anthropic`    | Anthropic API key                                                                                                                  |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `CRITIC_PROVIDER=google`       | Google Gemini API key                                                                                                              |
| `MINIMAX_API_KEY`              | `CRITIC_PROVIDER=minimax`      | MiniMax API key                                                                                                                    |
| `OPENCODE_API_KEY`             | `CRITIC_PROVIDER=opencode`     | From https://opencode.ai/auth                                                                                                      |
| `CODEX_CLI_PATH`               | `CRITIC_PROVIDER=codex-cli`    | Optional path to the `codex` executable                                                                                            |
| `CLAUDE_CODE_CLI_PATH`         | `CRITIC_PROVIDER=claude-code`  | Optional path to the `claude` executable                                                                                           |
| `CURSOR_AGENT_CLI_PATH`        | `CRITIC_PROVIDER=cursor-agent` | Optional path to the `cursor-agent` executable                                                                                     |
| `OPENCODE_CLI_PATH`            | `CRITIC_PROVIDER=opencode-cli` | Optional path to the `opencode` executable                                                                                         |

## Optional

| Variable                | Default                   | Description                                                               |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `VIBE_WORKSPACE_ROOT`   | auto (`cwd` package root) | **Consumer project root.** In Cursor set `${workspaceFolder}` in mcp.json |
| `CRITIC_MODEL`          | provider default          | Model id override; required for `opencode-cli` as `provider/model`        |
| `CRITIC_PERSONA`        | `clean-code-monk`         | `security-first` \| `performance-freak` \| `clean-code-monk`              |
| `OPENCODE_PLAN`         | `go`                      | `go` (subscription) or `zen` (pay-as-you-go)                              |
| `CRITIC_CLI_TIMEOUT_MS` | `120000`                  | Local CLI timeout, from 1,000 to 600,000 milliseconds                     |
| `DEBUG`                 | unset                     | Log parse/read failures to stderr                                         |

## Priority

1. Process / MCP `env` block
2. `VIBE_WORKSPACE_ROOT/.env` (consumer)
3. Package-local `.env` (local development)

## Cursor example

```json
{
  "mcpServers": {
    "vibe-gate": {
      "command": "npx",
      "args": ["-y", "vibe-gate-mcp"],
      "env": {
        "VIBE_WORKSPACE_ROOT": "${workspaceFolder}",
        "CRITIC_PROVIDER": "codex-cli"
      }
    }
  }
}
```

**SEC-002:** Never commit real keys. Prefer local `.env` over committing secrets into mcp.json when possible.

For CLI authentication setup, runtime isolation, and other candidates evaluated, see [CLI_PROVIDERS.md](../CLI_PROVIDERS.md).
