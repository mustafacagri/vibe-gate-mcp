# Installation Guide

## Prerequisites

- **Node.js** ≥24
- A Critic LLM API key (see [`.env.example`](../.env.example))

## Consumers (npm) — recommended

### 1. Configure keys

You need **one** provider. Put keys in MCP `env` and/or a `.env` file loaded by vibe-gate.

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

See [project/VARIABLES.md](project/VARIABLES.md) for every variable.

### 2. Cursor MCP

Copy [examples/cursor-mcp.project.json](../examples/cursor-mcp.project.json) into your project’s `.cursor/mcp.json` (or user MCP), and add your key:

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

`${workspaceFolder}` is required so `files[]` resolves inside the open repo.

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
cp .env.example .env   # fill Critic key — REQUIRED before reviews work
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
- [SEMANTIC_DIFF_PAYLOAD.md](SEMANTIC_DIFF_PAYLOAD.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [project/VARIABLES.md](project/VARIABLES.md)
