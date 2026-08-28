# MCP Tools API

Vibe-Gate exposes tools via MCP (Model Context Protocol). No HTTP API.

---

## submit_phase_review

**Purpose:** Implementer (IDE AI) submits phase completion report for Critic review.

**Handler:** `handleSubmitPhaseReview` (`src/tools/submit-phase-review.ts`)

### Data Flow

```
MCP Client → tools/call submit_phase_review
    ↓
args: { phaseId, report, files | semanticDiffPath | semanticDiff, updateStatus?, ... }
    ↓
exactly one payload source:
  files[] → buildSemanticDiffFromSourceFiles (read each path under VIBE_WORKSPACE_ROOT)
  semanticDiffPath → loadSemanticDiffFromWorkspacePath
  semanticDiff → use inline string
    ↓
parseSemanticDiff() → filesChanged count / context
    ↓
buildContextBlock() → blueprint, deps, FILE:…CONTENT: corpus
    ↓
provider.complete([system, user]) → Critic LLM
    ↓
parseVerdictFromResponse → ACCEPT | REJECT | …
    ↓
if ACCEPT && shouldPersistPhaseStatus(phaseId, updateStatus) → updatePhaseOnAccept → .vibe/status.json
    ↓
Response JSON: { verdict, model, usage, statusUpdated, statusSkipped?, statusError?, … }
```

### Input Schema

| Field            | Type     | Required | Description                                                                                    |
| ---------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| phaseId          | string   | yes      | Phase identifier (e.g. `phase-6-§1a`)                                                          |
| report           | string   | yes      | Implementer report                                                                             |
| files            | string[] | xor†     | **Preferred.** Workspace-relative source paths; MCP builds FILE:…CONTENT:. Max 10.             |
| semanticDiffPath | string   | xor†     | Pre-built payload file under `VIBE_WORKSPACE_ROOT` (raw or JSON `{"semanticDiff":"..."}`).     |
| semanticDiff     | string   | xor†     | Inline FILE:…CONTENT: payload (not git diff).                                                  |
| updateStatus     | boolean  | no       | `false` skips status.json on ACCEPT. Default skips `mcp-smoke-` / `vibe-gate-probe-` prefixes. |
| dependencies     | string[] | no       | New/updated packages                                                                           |
| round            | number   | no       | Round (1–3), default 1                                                                         |
| logToDebt        | object   | no       | When DEBT: `{ subject, rationale }`                                                            |

† **Exactly one** of `files` (non-empty), `semanticDiffPath` (non-empty), or `semanticDiff` (non-empty). See [SEMANTIC_DIFF_PAYLOAD.md](../../SEMANTIC_DIFF_PAYLOAD.md).

**ListTools note:** MCP registers `submitPhaseReviewFieldsSchema` (plain ZodObject). Exactly-one rules run in the handler via `submitPhaseReviewInputSchema`.

### Output

```json
{
  "verdict": "ACCEPT | REJECT | BLOCK | DEBT | CONCERNS_ADDRESSED | LOW_QUALITY | INSUFFICIENT_REVIEW",
  "model": "gpt-5.4",
  "usage": { "promptTokens": 0, "completionTokens": 0 },
  "statusUpdated": true,
  "statusSkipped": false,
  "statusError": "optional, when ACCEPT but status write failed"
}
```

- `statusUpdated`: `true` when verdict is ACCEPT and `.vibe/status.json` was updated.
- `statusSkipped`: `true` when ACCEPT but status write was skipped (probe policy / `updateStatus: false`).
- `statusError`: Present when ACCEPT but status update failed (e.g., permission denied).
- `semanticDiffHints` (optional): Soft advisory when a FILE block exceeds line threshold.

File-load errors return `{ error, code? }` (e.g. `PATH_OUTSIDE_WORKSPACE`, `FILE_TOO_LARGE`, `TOO_MANY_FILES`, `JSON_SCHEMA`, `REALPATH_FAILED`).

---

## log_human_decision

**Purpose:** Judge (human) records decision on deadlock; appends to `.vibe/preferences.log`.

### Data Flow

```
MCP Client → tools/call log_human_decision
    ↓
args: { caseId, decision, rationale?, confirmationToken? }
    ↓
if VIBE_HUMAN_CONFIRMATION_TOKEN set → require matching confirmationToken
    ↓
mkdir(.vibe) if needed
    ↓
append new entry → writeFile(preferences.log)
    ↓
Response: { success, path, message } | { success:false, code: HUMAN_CONFIRMATION_REQUIRED }
```

### Input Schema

| Field             | Type   | Required | Description                                                                           |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------- |
| caseId            | string | yes      | Conflict case identifier                                                              |
| decision          | string | yes      | ACCEPT_IMPLEMENTER \| ACCEPT_CRITIC \| CUSTOM                                         |
| rationale         | string | no       | Optional rationale                                                                    |
| confirmationToken | string | when env | Required when `VIBE_HUMAN_CONFIRMATION_TOKEN` is set (blocks implementer self-unlock) |

### Structured ≠ prose

`submit_phase_review` may return `code: STRUCTURED_PROSE_MISMATCH`. Resolve by **another Critic round** (`submit_phase_review`) — not `ACCEPT_IMPLEMENTER`, not a human. Mid-loop `ACCEPT_IMPLEMENTER` returns `CONTINUE_CRITIC_DEBATE`.

### Output

```json
{ "success": true, "path": ".vibe/preferences.log", "message": "Decision logged to preferences.log" }
```
