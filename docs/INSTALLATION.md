# Installation Guide

## Prerequisites

- **Node.js** ≥24
- One Critic provider: a direct API key or an installed, signed-in local CLI (see [CLI providers](CLI_PROVIDERS.md))

## Consumers (npm) — recommended

### 1. Configure a Critic provider

Choose one direct API provider or local CLI provider. Put API keys in MCP `env` and/or a `.env` file loaded by vibe-gate. Local CLI providers reuse the CLI's existing account session and need no separate API key.

Minimal (OpenAI):

```env
CRITIC_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

OpenCode:

```env
CRITIC_PROVIDER=opencode
OPENCODE_API_KEY=...
OPENCODE_PLAN=go
CRITIC_MODEL=minimax-m3
```

Local CLI providers (no separate provider API key):

```env
CRITIC_PROVIDER=codex-cli
# Or: claude-code | cursor-agent | opencode-cli
# OpenCode CLI reuses its saved auth but needs an explicit provider/model:
# CRITIC_PROVIDER=opencode-cli
# CRITIC_MODEL=provider/model
```

The selected CLI must be installed and authenticated for the same OS user as the MCP process. If the MCP host does not inherit the CLI's `PATH`, set the matching `*_CLI_PATH` variable. See [CLI provider setup](CLI_PROVIDERS.md).

See [project/VARIABLES.md](project/VARIABLES.md) for every variable.

### 2. Cursor MCP

For a local Codex CLI account, copy [examples/cursor-mcp.codex-cli.json](../examples/cursor-mcp.codex-cli.json) into your project’s `.cursor/mcp.json` (or user MCP). For a direct API provider, use the [API-key example](../examples/cursor-mcp.project.json):

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

`${workspaceFolder}` is required so `files[]` resolves inside the open repo.

For direct API providers, replace `codex-cli` with the provider ID and add its API key to `env`. For local CLI providers, do not add an API key; ensure the CLI is logged in for the user running Cursor.

### 3. Use `files[]`

```json
{
  "phaseId": "my-feature",
  "report": "…",
  "files": ["src/a.ts"],
  "round": 1
}
```

## Developers (this repository)

```bash
git clone https://github.com/mustafacagri/vibe-gate-mcp.git
cd vibe-gate-mcp
corepack yarn install
npm run build
cp .env.example .env   # choose a Critic provider; API providers need a key, local CLIs need a signed-in session
npm test
```

Local MCP template: [examples/cursor-mcp.user-local-dev.json](../examples/cursor-mcp.user-local-dev.json).

After rebuild: **toggle** vibe-gate MCP (do not rely on Reload Window alone).

## Multi-repo layout

| Layer              | Responsibility                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| User / project MCP | `npx -y vibe-gate-mcp` (or `node dist/index.mjs` while developing) + `VIBE_WORKSPACE_ROOT=${workspaceFolder}` + Critic key env |
| Consumer repo      | Agents call `submit_phase_review` with `files[]`                                                                               |

Never hardcode one consumer absolute path as `VIBE_WORKSPACE_ROOT`.

## Publish checklist

```bash
npm run prepublishOnly
npm pack --dry-run
npm publish
```

Package name on npm: **`vibe-gate-mcp`** (`bin`: `vibe-gate-mcp` → `dist/index.mjs`).

## References

- [USAGE.md](USAGE.md)
- [CLI_PROVIDERS.md](CLI_PROVIDERS.md)
- [SEMANTIC_DIFF_PAYLOAD.md](SEMANTIC_DIFF_PAYLOAD.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [project/VARIABLES.md](project/VARIABLES.md)
