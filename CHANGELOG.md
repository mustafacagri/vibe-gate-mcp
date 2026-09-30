# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.9] - 2026-10-01

### Fixed

- Add optional `readOnly: true` to phase reviews to prevent all workspace state, session, debt and deadlock writes while retaining genuine verdicts.
- Enforce ten actual full source content slots across every payload carrier and additional Critic requests; reject document/data endpoints and malformed corpus before review.
- Read complete requested source files without silently truncating line ranges or tails.

## [0.1.8] - 2026-09-24

### Fixed

- Resolve explicitly selected CLI names through Windows `PATH` and `PATHEXT` before spawning, including Cursor's `agent.cmd` and legacy `cursor-agent.cmd` shims.
- Launch Windows `.cmd` and `.bat` shims through `cmd.exe` while keeping native executables on the direct spawn path.

### Tests

- Cover Windows `PATHEXT` resolution for explicit `agent` and `cursor-agent` commands and safely quoted batch-shim invocation.

## [0.1.7] - 2026-09-24

### Fixed

- Detect and launch Windows `.cmd` and `.bat` CLI shims through `cmd.exe` while keeping native executables on the direct spawn path.

### Tests

- Cover Windows `PATHEXT` shim resolution and safely quoted batch-shim invocation.

## [0.1.6] - 2026-09-24

### Added

- Auto-detect an installed local CLI when `CRITIC_PROVIDER` is unset and report the selected CLI in the first review response.

### Fixed

- Use Cursor's current `agent` command by default and fall back to the legacy `cursor-agent` command when it is unavailable.

### Tests

- Cover local CLI auto-detection and Cursor Agent's legacy executable fallback.

## [0.1.5] - 2026-09-23

### Fixed

- Enforce bounded review inputs, close the conflict loop as deadlocked after a rejected third round, and avoid duplicating or persisting source payloads between rounds.
- Load Critic `REQUEST:` paths from the workspace with path, file-count, file-size, line-count, and total-context limits; reject traversal and symlink escapes in changed-file reads.
- Use the OpenAI Responses API so current reasoning models work without model-specific request parameters or a Vibe-Gate model allowlist.

### Docs

- Document the review limits and requested-context behavior, and add a release checklist and scope review.

## [0.1.4] - 2026-09-21

### Added

- Add local Critic providers for Codex CLI, Claude Code, Cursor Agent, and OpenCode CLI, reusing existing CLI sign-ins without requiring separate API keys.
- Add CLI path overrides, bounded execution time, and temporary per-run working directories.
- Isolate OpenCode CLI config, deny agent tools, and remove OpenCode sessions after each request.
- Document CLI provider setup, authentication, process restrictions, and researched adapter candidates.

### Fixed

- Reject malformed CLI JSON and JSONL responses instead of accepting partial output, and preserve provider errors if OpenCode session cleanup also fails.
- Send Cursor Agent's review conversation through stdin in the form expected by its CLI.

### Tests

- Add coverage for CLI authentication reuse, process isolation, output parsing, malformed streams, and OpenCode session cleanup.

## [0.1.3] - 2026-09-04

### Added

- Support GPT model family (including `gpt-5.6-luna`) on OpenCode Go by routing requests to OpenCode Go Responses API (`/zen/go/v1/responses`).

### Tests

- Added endpoint routing test for GPT models on OpenCode Go.
- Added OpenCode provider integration test verifying Go Responses endpoint URL and payload.

## [0.1.2] - 2026-09-02

### Fixed

- Reject malformed cited line ranges with non-positive or reversed line numbers.

### Tests

- Added configuration loading and effective model resolution coverage.
- Added critical snippet extraction coverage for matching, ignored directories, limits, missing roots, and case-insensitive paths.

## [0.1.1] - 2026-08-31

### Fixed

- Added a 30-second timeout to OpenCode external fetch calls.
- Stopped logging `CRITIC_PROVIDER` in debug output.
- Added safe fallback handling for invalid, unreadable, or oversized `rules.json` files.

### Tests

- Added unit coverage for token estimation, error handling, debug logging, configuration, and OpenCode timeout behavior.

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
