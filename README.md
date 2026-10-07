# Vibe-Gate (MCP)

An **Adversarial Quality Gate** for AI-assisted IDEs: the IDE agent and a Critic LLM debate code; the human decides only on deadlock.

## Quick start (npm / npx)

### 1. Choose a Critic provider

Use a direct API provider with its key, or use a local CLI that is already installed and signed in. Local CLI providers do not need a separate provider API key. If `CRITIC_PROVIDER` is omitted, Vibe-Gate selects the first installed local CLI in this order: Codex, Claude Code, Cursor Agent, then OpenCode CLI. OpenCode CLI moves to the front when `CRITIC_MODEL` is in `provider/model` form. The first review response includes a notice naming the selected CLI. If none is found, OpenAI remains the default and requires `OPENAI_API_KEY`. Set `CRITIC_PROVIDER` to choose explicitly.

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
| Cursor Agent  | `cursor-agent`    | Existing `agent login` session                  |
| OpenCode CLI  | `opencode-cli`    | Saved `opencode auth login` credentials + model |

For Cursor Agent, Vibe-Gate runs `agent` first and falls back to the legacy `cursor-agent` executable if the primary command is unavailable.

`opencode` is still the separate Zen/Go HTTP provider and needs `OPENCODE_API_KEY`. `opencode-cli` runs the local CLI and requires a `provider/model` value in `CRITIC_MODEL`; see the CLI guide for details.

`CRITIC_MODEL` is passed to the selected provider or CLI without a Vibe-Gate model allowlist; the provider must support that model ID. The OpenAI API provider uses the Responses API. See [provider configuration](docs/USAGE.md#configuration--providers).

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
  "readOnly": true,
  "round": 1
}
```

**Pass changed source paths in `files[]`.** MCP reads the complete files from disk and serializes FILE/CONTENT internally for the Critic. The agent supplies paths and a completion report; it does not need to paste file bodies or generate a corpus. The example uses `readOnly: true` to keep review state untouched. See [docs/SEMANTIC_DIFF_PAYLOAD.md](docs/SEMANTIC_DIFF_PAYLOAD.md).

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

Releases are automatic. Every push to `main` runs `.github/workflows/publish.yml`: it runs `yarn quality`, lets
semantic-release choose the version from the conventional commits (`fix:` is a patch, `feat:` a minor), publishes
`vibe-gate-mcp` to npm with provenance, and lists that version in the
[MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.mustafacagri/vibe-gate-mcp`. No token is
stored: npm and the registry both trust the workflow through GitHub OIDC. `server.json` is the registry entry and
is kept at the release version by `scripts/sync-server-json.mjs`.

```bash
yarn quality          # what the workflow checks before it tags anything
npm pack --dry-run    # inspect the exact tarball contents
```

Consumers then use `npx -y vibe-gate-mcp` as above.

## Payload sources — prefer `files[]`

| Priority | Field              | Use                            |
| -------- | ------------------ | ------------------------------ |
| 1        | `files[]`          | Normal batches                 |
| 2        | `semanticDiffPath` | Existing compatibility carrier |
| 3        | `semanticDiff`     | Existing compatibility carrier |

Use `readOnly: true` for probes. `updateStatus: false` and `mcp-smoke-` / `vibe-gate-probe-` phase prefixes only skip phase status writes.

## Documentation

| Doc                                                            | Description               |
| -------------------------------------------------------------- | ------------------------- |
| [docs/INSTALLATION.md](docs/INSTALLATION.md)                   | Install + multi-repo MCP  |
| [docs/USAGE.md](docs/USAGE.md)                                 | First run and providers   |
| [docs/CLI_PROVIDERS.md](docs/CLI_PROVIDERS.md)                 | Local CLI providers       |
| [docs/SEMANTIC_DIFF_PAYLOAD.md](docs/SEMANTIC_DIFF_PAYLOAD.md) | `files[]` contract        |
| [docs/ROADMAP.md](docs/ROADMAP.md)                             | Release checklist         |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)             | Stale MCP, path errors    |
| [docs/project/VARIABLES.md](docs/project/VARIABLES.md)         | Env SSoT                  |
| [examples/](examples/)                                         | Cursor mcp.json templates |

## Read-only review and full source slot limit

Set `readOnly: true` on `submit_phase_review` for a check that must leave the workspace untouched. It overrides `updateStatus: true` and prevents session clearing/saving, status updates, debt appends, conflict counter updates and deadlock case writes. Verdicts and concern verification still follow the ordinary review rules; deadlock case data is returned without saving it. Existing matching sessions can be read on later rounds, but read-only calls do not save a new round. `logToDebt` still expresses acceptance of debt when required, without writing the log. The default is `false`. `updateStatus: false` alone only disables phase status updates.

Every carrier (`files[]`, inline `semanticDiff`, raw/JSON `semanticDiffPath`) is limited to **ten actual FILE/CONTENT source blocks**, including additional `REQUEST:` context on later rounds. Duplicate blocks and both rename endpoints count separately, even if their paths or bytes match. An oversized corpus fails before the enlarged Critic request; it is never reduced to the first ten blocks. Requested line ranges are read as complete files, subject to the existing file and aggregate size limits. Markdown, JSON and other document/data endpoints are rejected as source context. Callers positively classify their selected source endpoints; `files[]` lets MCP supply the full source bodies. For deleted files and old rename endpoints, an orchestrator such as Vibe-Pilot materializes pinned Git base blobs at real snapshot paths before passing those paths to `files[]`. MCP reads those files from disk; it does not read Git history itself.
