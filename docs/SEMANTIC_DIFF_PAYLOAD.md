# Semantic diff payload sources

For normal agent reviews, pass changed source paths in `submit_phase_review.files[]`. MCP reads each complete file and serializes **FILE:…CONTENT:** internally for the Critic. Agents supply paths and a completion report; no pasted file bodies or generated corpus is required. Exactly one input carrier is accepted:

| Priority          | Field              | When to use                                                                             |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------- |
| **1 (preferred)** | `files: string[]`  | Normal batches. Workspace-relative source paths; MCP reads disk and builds the payload. |
| 2                 | `semanticDiffPath` | Existing compatibility carrier for a pre-built corpus on disk.                          |
| 3                 | `semanticDiff`     | Existing compatibility carrier for an inline corpus.                                    |

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
  "readOnly": true,
  "round": 1
}
```

Callers positively classify the selected paths as source and bind them to a fixed candidate. MCP supplies the full bodies from disk. For deletes and old rename endpoints, an orchestrator such as Vibe-Pilot materializes the pinned Git base blobs into real snapshot paths under the workspace, then passes those paths in `files[]`. Both rename endpoints count even when their source bytes match. MCP does not read Git history itself.

## Compatibility carriers

### `semanticDiffPath`

An existing UTF-8 payload file under the workspace may contain raw FILE:…CONTENT: text or JSON `{"semanticDiff":"..."}`. Pass its relative path. Size ≤ 5 MiB (`SEMANTIC_DIFF_FILE.MAX_BYTES`). Normal agent calls use `files[]`.

### Inline `semanticDiff`

Existing callers may pass the same FILE:…CONTENT: string as the tool argument. Normal agent calls use `files[]`.

## Critic-requested context

On a later review round, the MCP reads paths from the previous Critic response's `REQUEST:` lines under `VIBE_WORKSPACE_ROOT`. Paths are subject to workspace and symlink checks. Requested context uses complete source files (including when a line range was requested), up to 1 MiB per file. Initial and requested blocks share the ten-slot and 500,000-character limits.

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

Compatibility corpora require a `FILE: path` line immediately followed by a `CONTENT:` line and a non-empty source body. LF and CRLF framing are accepted. Empty bodies, misplaced markers, recognizable patch/hunk payloads and explicit full-source placeholders fail before Critic invocation. Unindented `FILE:` lines are reserved framing markers. Validation preserves submitted source bytes and does not prove that arbitrary inline text is complete; that guarantee remains tied to the caller's fixed source identity.

## Soft advisory

If any FILE block exceeds `SEMANTIC_DIFF_FILE.SOFT_WARN_LINES_PER_FILE_BLOCK` (default 500), responses may include `semanticDiffHints` (non-blocking).

## Status updates on ACCEPT

By default ACCEPT writes `.vibe/status.json`. Skip pollution for probes:

- `updateStatus: false`, or
- `phaseId` starting with `mcp-smoke-` / `vibe-gate-probe-` (`PHASE_STATUS_POLICY`)

## Workspace root (multi-repo / public)

Set **`VIBE_WORKSPACE_ROOT`** to the **consumer project** root (Cursor: `${workspaceFolder}` in **project** `.cursor/mcp.json`). Do **not** hardcode a single repo path in user-level MCP config — that breaks other projects.

See `examples/cursor-mcp.project.json` and [INSTALLATION.md](INSTALLATION.md).

## Read-only review and full source slot limit

Set `readOnly: true` on `submit_phase_review` for a check that must leave the workspace untouched. It overrides `updateStatus: true` and prevents session clearing/saving, status updates, debt appends, conflict counter updates and deadlock case writes. Verdicts and concern verification still follow the ordinary review rules; deadlock case data is returned without saving it. Existing matching sessions can be read on later rounds, but read-only calls do not save a new round. `logToDebt` still expresses acceptance of debt when required, without writing the log. The default is `false`. `updateStatus: false` alone only disables phase status updates.

Every carrier (`files[]`, inline `semanticDiff`, raw/JSON `semanticDiffPath`) is limited to **ten actual FILE/CONTENT source blocks**, including additional `REQUEST:` context on later rounds. Duplicate blocks and both rename endpoints count separately, even if their paths or bytes match. An oversized corpus fails before the enlarged Critic request; it is never reduced to the first ten blocks. Requested line ranges are read as complete files, subject to the existing file and aggregate size limits. Markdown, JSON and other document/data endpoints are rejected as source context. Callers positively classify selected endpoints; MCP reads full source bodies when given `files[]`. Compatibility callers must provide complete source bodies rather than patches or summaries.
