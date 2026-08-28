# Vibe-Gate (MCP)

An **Adversarial Quality Gate** for AI-assisted IDEs: the IDE agent and a Critic LLM debate code; the human decides only on deadlock.

## Quick start (npm / npx)

### 1. Critic API key

Create a `.env` where you run vibe-gate **or** put the same keys in MCP `env`.

Copy from the package’s [`.env.example`](.env.example):

```bash
# Minimal OpenAI example
CRITIC_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY

# Or OpenCode (https://opencode.ai/auth)
# CRITIC_PROVIDER=opencode
# OPENCODE_API_KEY=...
# OPENCODE_PLAN=go
# CRITIC_MODEL=minimax-m3
```

| Provider      | `CRITIC_PROVIDER` | Required key env                                |
| ------------- | ----------------- | ----------------------------------------------- |
| OpenAI        | `openai`          | `OPENAI_API_KEY`                                |
| Anthropic     | `anthropic`       | `ANTHROPIC_API_KEY`                             |
| Google Gemini | `google`          | `GOOGLE_GENERATIVE_AI_API_KEY`                  |
| MiniMax       | `minimax`         | `MINIMAX_API_KEY`                               |
| OpenCode      | `opencode`        | `OPENCODE_API_KEY` (+ optional `OPENCODE_PLAN`) |

Full list: [docs/project/VARIABLES.md](docs/project/VARIABLES.md).

### 2. Cursor MCP (any consumer repo)

Project or user [`.cursor/mcp.json`](examples/cursor-mcp.project.json):

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

Prefer keys in a local `.env` next to the package or in the consumer project under `VIBE_WORKSPACE_ROOT` (never commit secrets). MCP `env` overrides `.env`.

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
| [docs/USAGE.md](docs/USAGE.md)                                 | First run                 |
| [docs/SEMANTIC_DIFF_PAYLOAD.md](docs/SEMANTIC_DIFF_PAYLOAD.md) | `files[]` contract        |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)             | Stale MCP, path errors    |
| [docs/project/VARIABLES.md](docs/project/VARIABLES.md)         | Env SSoT                  |
| [examples/](examples/)                                         | Cursor mcp.json templates |
