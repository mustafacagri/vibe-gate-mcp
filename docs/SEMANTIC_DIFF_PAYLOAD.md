# Semantic diff payload sources

`submit_phase_review` always reviews a **FILE:…CONTENT:** corpus (full file bodies, not git diff). Agents choose **exactly one** payload source:

| Priority          | Field              | When to use                                                                             |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------- |
| **1 (preferred)** | `files: string[]`  | Normal batches. Workspace-relative source paths; MCP reads disk and builds the payload. |
| 2                 | `semanticDiffPath` | Pre-built payload file already on disk (CI artifacts, offline dumps).                   |
| 3                 | `semanticDiff`     | Tiny one-file smoke payloads.                                                           |

## Why `files[]` is best practice

| Layer                      | `files[]`               | Inline `semanticDiff`                                  |
| -------------------------- | ----------------------- | ------------------------------------------------------ |
| Agent / MCP tool-call JSON | Path list only          | Full source in args (burns IDE context + chat history) |
| Critic LLM                 | Full source (MCP-built) | Full source (same)                                     |

`files[]` does **not** reduce Critic tokens. It stops the IDE agent from re-serializing every file into the tool call.

Limits (SSoT: `SEMANTIC_DIFF_SOURCE_FILES` in `src/constants.ts`):

- Max **10** paths per call
- Max **1 MiB** per file
- Max **5 MiB** total
- The resolved payload must also stay under **500,000 characters**; the same limit applies to inline payloads and payload files.

Paths must be **relative to `VIBE_WORKSPACE_ROOT`**. Absolute paths and `..` traversal are rejected.

## Example (preferred)

```json
{
  "phaseId": "phase-6-§1a",
  "report": "…",
  "files": ["features/compliance/constants.ts", "packages/compliance/src/export-zip.ts"],
  "round": 1
}
```

## `semanticDiffPath` (optional)

Write the same FILE:…CONTENT: string to a UTF-8 file under the workspace (raw text or JSON `{"semanticDiff":"..."}`), then pass the relative path. Size ≤ 5 MiB (`SEMANTIC_DIFF_FILE.MAX_BYTES`).

## Inline `semanticDiff`

Same FILE:…CONTENT: string as the tool argument. Prefer `files[]`.

## Critic-requested context

On a later review round, the MCP reads paths from the previous Critic response's `REQUEST:` lines under `VIBE_WORKSPACE_ROOT`. Paths are subject to workspace and symlink checks. Each request is limited to 10 files, 1 MiB per file, and 120 context lines; the combined requested context is limited to 500,000 characters. Use a narrower line range when a file needs more context.

The review loop allows three rounds. A rejected or blocked third round produces a deadlock case for human review.

Source payloads are submitted again with each review round and are not stored in `.vibe/review-session.json`.

## Payload format (what the Critic sees)

```
FILE: packages/shared/src/result.ts
CONTENT:
[FULL FILE CONTENT]

FILE: packages/shared/src/domain-error.ts
CONTENT:
[FULL FILE CONTENT]
```

Markers are SSoT: `SEMANTIC_DIFF_PAYLOAD_MARKERS` in `src/constants.ts`.

## Soft advisory

If any FILE block exceeds `SEMANTIC_DIFF_FILE.SOFT_WARN_LINES_PER_FILE_BLOCK` (default 500), responses may include `semanticDiffHints` (non-blocking).

## Status updates on ACCEPT

By default ACCEPT writes `.vibe/status.json`. Skip pollution for probes:

- `updateStatus: false`, or
- `phaseId` starting with `mcp-smoke-` / `vibe-gate-probe-` (`PHASE_STATUS_POLICY`)

## Workspace root (multi-repo / public)

Set **`VIBE_WORKSPACE_ROOT`** to the **consumer project** root (Cursor: `${workspaceFolder}` in **project** `.cursor/mcp.json`). Do **not** hardcode a single repo path in user-level MCP config — that breaks other projects.

See `examples/cursor-mcp.project.json` and [INSTALLATION.md](INSTALLATION.md).
