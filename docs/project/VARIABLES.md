# Environment Variables

Copy [`.env.example`](../../.env.example) → `.env` in the package directory **or** set the same keys in MCP `env`. Without a Critic key, `submit_phase_review` cannot run.

## Required (pick one provider)

| Variable                       | When required                  | Description                                                    |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------- |
| `CRITIC_PROVIDER`              | Recommended (default `openai`) | `openai` \| `anthropic` \| `google` \| `minimax` \| `opencode` |
| `OPENAI_API_KEY`               | `CRITIC_PROVIDER=openai`       | OpenAI API key                                                 |
| `ANTHROPIC_API_KEY`            | `CRITIC_PROVIDER=anthropic`    | Anthropic API key                                              |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `CRITIC_PROVIDER=google`       | Google Gemini API key                                          |
| `MINIMAX_API_KEY`              | `CRITIC_PROVIDER=minimax`      | MiniMax API key                                                |
| `OPENCODE_API_KEY`             | `CRITIC_PROVIDER=opencode`     | From https://opencode.ai/auth                                  |

## Optional

| Variable              | Default                   | Description                                                               |
| --------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `VIBE_WORKSPACE_ROOT` | auto (`cwd` package root) | **Consumer project root.** In Cursor set `${workspaceFolder}` in mcp.json |
| `CRITIC_MODEL`        | provider default          | Model id override                                                         |
| `CRITIC_PERSONA`      | `clean-code-monk`         | `security-first` \| `performance-freak` \| `clean-code-monk`              |
| `OPENCODE_PLAN`       | `go`                      | `go` (subscription) or `zen` (pay-as-you-go)                              |
| `DEBUG`               | unset                     | Log parse/read failures to stderr                                         |

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
        "CRITIC_PROVIDER": "openai",
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY"
      }
    }
  }
}
```

**SEC-002:** Never commit real keys. Prefer local `.env` over committing secrets into mcp.json when possible.
