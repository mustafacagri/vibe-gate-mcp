# Usage Guide

## First Run

1. Ensure `.env` and MCP config are set (see [INSTALLATION.md](INSTALLATION.md)).
2. Restart your IDE or Cursor so it picks up the MCP server.
3. Create `.vibe/` in your project root (or let the tool create it).

## Project Setup

### rules.json (optional)

Define hard and soft rules for the Critic:

```json
{
  "hardRules": [{ "id": "SEC-1", "description": "No hardcoded secrets", "category": "security" }],
  "softRules": [{ "id": "STYLE-1", "description": "Prefer named exports", "category": "style" }]
}
```

### DEBT.md (optional)

Created automatically when the Critic issues a DEBT verdict and the Implementer accepts:

```
## Records

### YYYY-MM-DD - Duplicate subject

- **Phase:** example-phase
- **Rationale:** ...
- **Status:** Open
```

## Configuration & API Keys

Vibe-Gate requires an AI provider API key. You can place your configuration (`API_KEY`, `CRITIC_PROVIDER`, `CRITIC_MODEL`, `CRITIC_PERSONA`, etc.) in **any** of the following locations:

1. **Your Project's `.env` (Recommended for Monorepos/Projects):**
   Simply place a `.env` file in the root of the project you are working on (the one defined by `VIBE_WORKSPACE_ROOT`). Vibe-Gate will automatically read it.
2. **MCP Config (`mcpServers.vibe-gate.env`):**
   Add it directly to your IDE's MCP settings. Variables here overwrite any `.env` files.
3. **Package-local `.env` (local development):**
   Copy `.env.example` to `.env` in the package directory, or set the same keys in MCP `env`.

> **Tip:** You can mix and match. For example, define `CRITIC_PROVIDER` broadly in the MCP config, but set a specific `OPENAI_API_KEY` inside your current project's `.env` file.

### OpenAI (default)

```env
CRITIC_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
# CRITIC_MODEL=gpt-5.4  # optional, default
```

### Anthropic

```env
CRITIC_PROVIDER=anthropic
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY
# CRITIC_MODEL=claude-4.6-sonnet  # optional
```

### Google Gemini

```env
CRITIC_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=YOUR_GOOGLE_API_KEY
# CRITIC_MODEL=gemini-3.1-pro  # optional
```

### MiniMax

```env
CRITIC_PROVIDER=minimax
MINIMAX_API_KEY=...
# CRITIC_MODEL=MiniMax-M3  # default; also: MiniMax-M2.7, MiniMax-M2.5
```

MiniMax uses an Anthropic-compatible API endpoint. Default model: `MiniMax-M3`. Also available: `MiniMax-M2.7`, `MiniMax-M2.5`, and high-speed variants.

### OpenCode (Zen or Go)

```env
CRITIC_PROVIDER=opencode
OPENCODE_API_KEY=...
OPENCODE_PLAN=go
# CRITIC_MODEL=minimax-m3
```

OpenCode has two plans sharing the same API key from [opencode.ai/auth](https://opencode.ai/auth):

| Plan                    | `OPENCODE_PLAN` | Base URL                        | Billing              |
| ----------------------- | --------------- | ------------------------------- | -------------------- |
| **Go** (subscription)   | `go`            | `https://opencode.ai/zen/go/v1` | Monthly subscription |
| **Zen** (pay-as-you-go) | `zen`           | `https://opencode.ai/zen/v1`    | Per-token credits    |

**Important:** On Go, `minimax-m3` uses the Anthropic `/messages` endpoint (not chat completions). On Zen, it uses `/chat/completions`.

Model IDs are lowercase (`minimax-m3`). Display names like `MiniMax-M3` are accepted as aliases.

For the **direct MiniMax provider** (`CRITIC_PROVIDER=minimax`), use PascalCase: `MiniMax-M3`.

### Personas

```env
CRITIC_PERSONA=security-first   # or performance-freak, clean-code-monk
```

## MCP Tools

| Tool                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `submit_phase_review` | Implementer reports phase completion; Critic reviews |
| `log_human_decision`  | Judge records decision on deadlock                   |

`submit_phase_review` — **prefer `files[]`** (workspace-relative source paths; MCP builds FILE:…CONTENT:). Alternatives: `semanticDiffPath` or inline `semanticDiff` — exactly one. Use `updateStatus: false` for probes. See [SEMANTIC_DIFF_PAYLOAD.md](SEMANTIC_DIFF_PAYLOAD.md).

See [docs/project/api/mcp-tools.md](project/api/mcp-tools.md) for full API docs.

## References

- [docs/VIBE-GATE.md](VIBE-GATE.md) — Purpose and flow
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) — Common issues
