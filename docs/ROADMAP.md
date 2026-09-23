# Roadmap and release checklist

## 0.1.5 — review safety and conflict-loop fixes

- [x] Bound MCP review inputs and resolved payload size.
- [x] End a rejected third Critic round with a deadlock case.
- [x] Keep source payloads out of the system prompt and conflict-session history.
- [x] Read Critic `REQUEST:` paths within the workspace and enforce file and context limits.
- [x] Use canonical paths for changed-file reads to reject traversal and symlink escapes.
- [x] Keep model IDs configurable and use the OpenAI Responses API for current reasoning-model compatibility.
- [x] Add focused tests and update user documentation.
- [x] Run typecheck, lint, unit tests, build, MCP tool smoke test, and npm package inspection.
- [ ] Publish `vibe-gate-mcp@0.1.5` from the maintainer's npm account.

## Scope review

The earlier release plan included extra diagnostics and automatic provider fallback. Those do not address a demonstrated defect in the current package. Fallback could also select a different account or incur unexpected provider charges, so providers remain explicitly configured. The 0.1.5 scope is limited to behavior that was broken or unbounded in the existing review path; broader provider work should wait for a concrete user need.

The npm package is not published by the current GitHub Actions workflow; CI only validates and builds it. After the commit is pushed, publish the version from an authenticated maintainer environment.
