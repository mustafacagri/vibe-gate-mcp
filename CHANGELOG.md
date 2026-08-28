# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-28

Initial release of `vibe-gate-mcp`.

### Added

- **MCP server (stdio)** with tools:
  - `submit_phase_review` — Implementer → Critic adversarial review
  - `log_human_decision` — human deadlock decisions → `.vibe/preferences.log`
- **Preferred payload: `files[]`** — workspace-relative source paths; MCP reads disk and builds FILE:…CONTENT: (`SEMANTIC_DIFF_SOURCE_FILES` limits)
- **Payload sources:** `semanticDiffPath` (pre-built payload file) or inline `semanticDiff` — exactly one source
- **`updateStatus` / `PHASE_STATUS_POLICY`** — skip `.vibe/status.json` for probes (`mcp-smoke-`, `vibe-gate-probe-`)
- **npm CLI:** `bin` → `dist/index.mjs` (shebang); `npx -y vibe-gate-mcp`
- **Config:** Critic providers (OpenAI, Anthropic, Google, MiniMax, OpenCode); personas; Zod-validated env
- **Conflict loop:** up to 3 rounds; DEBT logging; project preferences
- **Docs & examples:** INSTALLATION, USAGE, SEMANTIC_DIFF_PAYLOAD, VARIABLES, Cursor mcp.json templates, `.env.example`

### Quality

- TypeScript strict, ESLint + SonarJS (cognitive complexity ≤ 15), Vitest, Husky (dev checkout only)
