# Troubleshooting

## Common Issues

### "No LLM provider available"

**Cause:** The selected provider is not configured, or the selected local CLI cannot start or authenticate.

**Fix:**

1. For direct API providers, set its key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MINIMAX_API_KEY`, or `OPENCODE_API_KEY`.
2. For a local CLI provider, install the selected CLI, sign in with its account, and check the executable path.
3. Ensure `CRITIC_PROVIDER` matches one of: `openai`, `anthropic`, `google`, `minimax`, `opencode`, `codex-cli`, `claude-code`, `cursor-agent`, or `opencode-cli`.
4. For `opencode-cli`, set `CRITIC_MODEL` to an available `provider/model` value from `opencode models`.
5. Verify `.env` is loaded (MCP config must pass `env` or the process must inherit it).

### Local CLI not found or not authenticated

**Cause:** IDE-launched MCP servers may have a shorter `PATH` than an interactive terminal, or the CLI may not have an account session for this OS user.

**Fix:** Run the CLI's login flow in a terminal as the same user running the IDE, then set its matching `*_CLI_PATH` to the absolute executable path if needed. For Claude Code, `claude auth login` defaults to Claude subscription sign-in; `--console` selects API billing. See [CLI_PROVIDERS.md](CLI_PROVIDERS.md) for provider-specific setup.

### OpenCode CLI reports insufficient balance

**Cause:** The saved OpenCode provider credential is recognized, but that account or provider has no available credit for the selected model.

**Fix:** Check `opencode auth list`, review the provider's billing/plan, and select a model you are entitled to with `CRITIC_MODEL`. Vibe-Gate does not retry with another provider or account.

### MCP server not connecting

**Cause:** Wrong `cwd`, missing build/dependencies, or env not passed.

**Fix:**

1. Use `npx -y vibe-gate-mcp`, or an absolute `node dist/index.mjs` path while developing.
2. Ensure `npm run build` completes from the project root.
3. For API providers, pass the API key in MCP `env`; for CLI providers, make sure the executable path and the CLI's saved login are available to this process.

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
- [docs/CLI_PROVIDERS.md](CLI_PROVIDERS.md) — Local CLI providers
