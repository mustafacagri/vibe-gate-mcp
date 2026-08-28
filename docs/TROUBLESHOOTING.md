# Troubleshooting

## Common Issues

### "No LLM provider available"

**Cause:** Missing API key or wrong `CRITIC_PROVIDER`.

**Fix:**

1. Set the correct API key for your provider: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MINIMAX_API_KEY`, or `OPENCODE_API_KEY`.
2. Ensure `CRITIC_PROVIDER` matches one of: `openai`, `anthropic`, `google`, `minimax`, `opencode`.
3. Verify `.env` is loaded (MCP config must pass `env` or the process must inherit it).

### MCP server not connecting

**Cause:** Wrong `cwd`, missing build/dependencies, or env not passed.

**Fix:**

1. Use `npx -y vibe-gate-mcp`, or an absolute `node dist/index.mjs` path while developing.
2. Ensure `npm run build` completes from the project root.
3. Pass API keys in `env` in the MCP config.

### Status and Roadmap out of sync

**Cause:** Phase completed without using `submit_phase_review`, or manual edits.

**Fix:** Manually update `.vibe/status.json` to match the completed phase.

### Wrong workspace root (monorepo)

**Cause:** MCP runs from monorepo root; project is in a subdirectory.

**Fix:** Set `VIBE_WORKSPACE_ROOT=/path/to/subproject` in env (project `.cursor/mcp.json` → `${workspaceFolder}`).

### IDE shows empty `submit_phase_review` properties / missing `files`

**Cause:** The running MCP process has not been restarted after a build, or the tool input schema is not exposed as a plain object — MCP SDK then advertises `properties: {}`.

**Fix:**

1. Run `npm run build` in the package directory.
2. **Toggle/restart** the vibe-gate MCP server in the IDE after rebuilding. Reload the IDE if necessary.
3. Confirm tool description mentions `files` and properties include `files`, `semanticDiffPath`, `semanticDiff`.
4. The server registers `submitPhaseReviewFieldsSchema` (plain object) for ListTools.

### `files` / `semanticDiffPath` file not found

**Cause:** `VIBE_WORKSPACE_ROOT` points at the wrong repo (often hardcoded in **user-level** MCP), or path is absolute / outside the workspace.

**Fix:** Set `VIBE_WORKSPACE_ROOT` only in **project** `.cursor/mcp.json` → `${workspaceFolder}`. Paths must be relative to that root. Remove hardcoded consumer paths from user-level MCP.

### Debug logging

**Cause:** Need to see parse/read failures.

**Fix:** Set `DEBUG=1` in env. Logs go to stderr.

## References

- [docs/project/VARIABLES.md](project/VARIABLES.md) — Env reference
