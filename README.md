# Vibe-Gate (MCP)

An **Adversarial Quality Gate** for AI-assisted IDEs: the IDE agent and a Critic LLM debate code; the human decides only on deadlock.

## Quick start (npm / npx)

### 1. Choose a Critic provider

Use a direct API provider with its key, or use a local CLI that is already installed and signed in. Local CLI providers do not need a separate provider API key.

Copy from the package’s [`.env.example`](.env.example):

```bash
# Direct API example
CRITIC_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY

# Or use the signed-in Codex CLI account (no API key)
# CRITIC_PROVIDER=codex-cli

# Or another signed-in local CLI (no separate API key)
# CRITIC_PROVIDER=claude-code
# CRITIC_PROVIDER=cursor-agent
# CRITIC_PROVIDER=opencode-cli
# CRITIC_MODEL=provider/model  # required for opencode-cli; see `opencode models`

# Or OpenCode (https://opencode.ai/auth)
# CRITIC_PROVIDER=opencode
# OPENCODE_API_KEY=...
# OPENCODE_PLAN=go
# CRITIC_MODEL=minimax-m3
```

| Provider      | `CRITIC_PROVIDER` | Authentication                                  |
| ------------- | ----------------- | ----------------------------------------------- |
| OpenAI        | `openai`          | `OPENAI_API_KEY`                                |
| Anthropic     | `anthropic`       | `ANTHROPIC_API_KEY`                             |
| Google Gemini | `google`          | `GOOGLE_GENERATIVE_AI_API_KEY`                  |
| MiniMax       | `minimax`         | `MINIMAX_API_KEY`                               |
| OpenCode      | `opencode`        | `OPENCODE_API_KEY` (+ optional `OPENCODE_PLAN`) |
| Codex CLI     | `codex-cli`       | Existing `codex login` session                  |
| Claude Code   | `claude-code`     | Existing Claude Code account session            |
| Cursor Agent  | `cursor-agent`    | Existing `cursor-agent login` session           |
| OpenCode CLI  | `opencode-cli`    | Saved `opencode auth login` credentials + model |

`opencode` is still the separate Zen/Go HTTP provider and needs `OPENCODE_API_KEY`. `opencode-cli` runs the local CLI and requires a `provider/model` value in `CRITIC_MODEL`; see the CLI guide for details.

See [CLI provider setup and alternatives](docs/CLI_PROVIDERS.md) for CLI installation, login, configuration, OpenCode session details, and other candidates we evaluated. Full variable list: [docs/project/VARIABLES.md](docs/project/VARIABLES.md).

### 2. Configure Cursor MCP (any consumer repo)

Project or user [`.cursor/mcp.json`](examples/cursor-mcp.codex-cli.json) for Codex CLI (or use the [API-key example](examples/cursor-mcp.project.json)):

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

For direct providers, prefer keys in a local `.env` next to the package or in the consumer project under `VIBE_WORKSPACE_ROOT` (never commit secrets). MCP `env` overrides `.env`. For a CLI provider, install and sign in to that CLI as the same OS user running the MCP server.

### 3. Call the tool (agents)

```json
{
  "phaseId": "phase-1-§3",
  "report": "What changed, why, file:line — no TODOs",
  "files": ["src/a.ts", "src/b.ts"],
  "round": 1
}
```

**Prefer `files[]`** — MCP reads disk and builds FILE:…CONTENT:. See [docs/SEMANTIC_DIFF_PAYLOAD.md](docs/SEMANTIC_DIFF_PAYLOAD.md).

## Local development (this repo)

```bash
corepack yarn install
npm run build
npm test
cp .env.example .env   # fill Critic key
npm start              # stdio MCP
```

User MCP while developing: [examples/cursor-mcp.user-local-dev.json](examples/cursor-mcp.user-local-dev.json) (`node dist/index.mjs` + `VIBE_WORKSPACE_ROOT=${workspaceFolder}`).

After `npm run build`, **restart** the vibe-gate MCP server in the IDE.

## Publish

```bash
npm pack --dry-run    # inspect the exact tarball contents
npm publish           # package name: vibe-gate-mcp
```

Consumers then use `npx -y vibe-gate-mcp` as above.

## Payload sources — prefer `files[]`

| Priority | Field              | Use                    |
| -------- | ------------------ | ---------------------- |
| 1        | `files[]`          | Normal batches         |
| 2        | `semanticDiffPath` | Pre-built payload file |
| 3        | `semanticDiff`     | Tiny inline payloads   |

Probes: `updateStatus: false` or `phaseId` prefixes `mcp-smoke-` / `vibe-gate-probe-`.

## Documentation

| Doc                                                            | Description               |
| -------------------------------------------------------------- | ------------------------- |
| [docs/INSTALLATION.md](docs/INSTALLATION.md)                   | Install + multi-repo MCP  |
| [docs/USAGE.md](docs/USAGE.md)                                 | First run and providers   |
| [docs/CLI_PROVIDERS.md](docs/CLI_PROVIDERS.md)                 | Local CLI providers       |
| [docs/SEMANTIC_DIFF_PAYLOAD.md](docs/SEMANTIC_DIFF_PAYLOAD.md) | `files[]` contract        |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)             | Stale MCP, path errors    |
| [docs/project/VARIABLES.md](docs/project/VARIABLES.md)         | Env SSoT                  |
| [examples/](examples/)                                         | Cursor mcp.json templates |
