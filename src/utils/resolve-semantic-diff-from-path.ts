/**
 * Load semanticDiff from a workspace-relative file (alternative to inline MCP JSON for large payloads).
 * Security: lexical resolve() jail first, then realpath + path.relative containment (symlinks, junctions).
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve } from 'node:path'
import { SEMANTIC_DIFF_FILE, WORKSPACE_PATH_KIND } from '@/constants'
import { isResolvedPathWithinRoot } from '@/utils/path-within-root'

export type WorkspacePathKind = (typeof WORKSPACE_PATH_KIND)[keyof typeof WORKSPACE_PATH_KIND]

export type ResolveSemanticDiffErrorCode =
  | 'EMPTY_PATH'
  | 'ABSOLUTE_PATH_FORBIDDEN'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READABLE'
  | 'FILE_TOO_LARGE'
  | 'JSON_PARSE'
  | 'JSON_SCHEMA'
  | 'EMPTY_SEMANTIC_DIFF'
  | 'REALPATH_FAILED'

export type ResolveSemanticDiffResult =
  | { ok: true; semanticDiff: string; resolvedFromPath: string }
  | { ok: false; code: ResolveSemanticDiffErrorCode; message: string }

/** Strip UTF-8 BOM so JSON / FILE detection is reliable. */
export function stripUtf8Bom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
}

function isStrictlyInsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const normRoot = normalize(workspaceRoot)
  const normFile = normalize(candidate)
  if (normRoot === normFile) return true
  const useBackslash = normRoot.includes('\\')
  const s = useBackslash ? '\\' : '/'
  const prefix = normRoot.endsWith(s) ? normRoot : normRoot + s
  return normFile === normRoot || normFile.startsWith(prefix)
}

/**
 * Ensure resolved file path is under workspace after symlink resolution (defense in depth).
 */
export async function verifyCanonicalPathUnderWorkspace(
  workspaceRoot: string,
  absolutePath: string,
  pathKind: WorkspacePathKind = WORKSPACE_PATH_KIND.SEMANTIC_DIFF_PAYLOAD
): Promise<{ ok: true } | { ok: false; code: 'PATH_OUTSIDE_WORKSPACE' | 'REALPATH_FAILED'; message: string }> {
  let rootReal: string
  let fileReal: string
  try {
    rootReal = await realpath(workspaceRoot)
    fileReal = await realpath(absolutePath)
  } catch {
    return {
      ok: false,
      code: 'REALPATH_FAILED',
      message: `${pathKind}: could not resolve canonical paths for workspace or file.`
    }
  }

  if (!isResolvedPathWithinRoot(rootReal, fileReal)) {
    return {
      ok: false,
      code: 'PATH_OUTSIDE_WORKSPACE',
      message: `${pathKind} resolves outside VIBE_WORKSPACE_ROOT after canonical resolution.`
    }
  }

  return { ok: true }
}

/**
 * Resolve a user-supplied relative path to an absolute path confined to workspaceRoot.
 */
export function resolveSafePathInWorkspace(
  workspaceRoot: string,
  userRelativePath: string,
  pathKind: WorkspacePathKind = WORKSPACE_PATH_KIND.SEMANTIC_DIFF_PAYLOAD
): { ok: true; absolutePath: string } | { ok: false; code: ResolveSemanticDiffErrorCode; message: string } {
  const trimmed = userRelativePath?.trim()
  if (!trimmed) {
    return { ok: false, code: 'EMPTY_PATH', message: `${pathKind} is empty.` }
  }
  if (isAbsolute(trimmed)) {
    return {
      ok: false,
      code: 'ABSOLUTE_PATH_FORBIDDEN',
      message: `${pathKind} must be relative to VIBE_WORKSPACE_ROOT (absolute paths are not allowed).`
    }
  }
  const resolved = resolve(workspaceRoot, trimmed)
  if (!isStrictlyInsideWorkspace(workspaceRoot, resolved)) {
    return {
      ok: false,
      code: 'PATH_OUTSIDE_WORKSPACE',
      message: `${pathKind} resolves outside VIBE_WORKSPACE_ROOT (path traversal is not allowed).`
    }
  }
  return { ok: true, absolutePath: resolved }
}

/** Parse on-disk payload: raw FILE:…CONTENT: text, or JSON object with string semanticDiff. */
export function parseSemanticDiffFileBody(
  rawUtf8: string
): { ok: true; semanticDiff: string } | { ok: false; code: 'JSON_PARSE' | 'JSON_SCHEMA'; message: string } {
  const withoutBom = stripUtf8Bom(rawUtf8)
  const trimmed = withoutBom.trim()
  if (!trimmed.startsWith('{')) {
    return { ok: true, semanticDiff: withoutBom }
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        code: 'JSON_SCHEMA',
        message: 'semanticDiff file: JSON must be an object with a string property "semanticDiff".'
      }
    }
    const rec = parsed as Record<string, unknown>
    if (!('semanticDiff' in rec)) {
      return {
        ok: false,
        code: 'JSON_SCHEMA',
        message: 'semanticDiff file: JSON object must include a string property "semanticDiff".'
      }
    }
    const v = rec.semanticDiff
    if (typeof v !== 'string') {
      return {
        ok: false,
        code: 'JSON_SCHEMA',
        message: 'semanticDiff file: property "semanticDiff" must be a string.'
      }
    }
    return { ok: true, semanticDiff: v }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'parse error'
    return {
      ok: false,
      code: 'JSON_PARSE',
      message: `semanticDiff file: invalid JSON (${msg}).`
    }
  }
}

export async function loadSemanticDiffFromWorkspacePath(
  workspaceRoot: string,
  userRelativePath: string
): Promise<ResolveSemanticDiffResult> {
  const pathResult = resolveSafePathInWorkspace(workspaceRoot, userRelativePath)
  if (!pathResult.ok) return pathResult
  const { absolutePath } = pathResult

  let st
  try {
    st = await stat(absolutePath)
  } catch {
    return {
      ok: false,
      code: 'FILE_NOT_FOUND',
      message: `semanticDiffPath: file not found or inaccessible: ${userRelativePath.trim()}`
    }
  }
  if (!st.isFile()) {
    return {
      ok: false,
      code: 'FILE_NOT_READABLE',
      message: `semanticDiffPath: not a regular file: ${userRelativePath.trim()}`
    }
  }

  const canonical = await verifyCanonicalPathUnderWorkspace(workspaceRoot, absolutePath)
  if (!canonical.ok) {
    return { ok: false, code: canonical.code, message: canonical.message }
  }

  if (st.size > SEMANTIC_DIFF_FILE.MAX_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `semanticDiffPath: file exceeds maximum size (${SEMANTIC_DIFF_FILE.MAX_BYTES} bytes).`
    }
  }

  let raw: string
  try {
    raw = await readFile(absolutePath, 'utf8')
  } catch {
    return {
      ok: false,
      code: 'FILE_NOT_READABLE',
      message: `semanticDiffPath: could not read file: ${userRelativePath.trim()}`
    }
  }

  const parsed = parseSemanticDiffFileBody(raw)
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, message: parsed.message }
  }
  if (!parsed.semanticDiff.trim()) {
    return {
      ok: false,
      code: 'EMPTY_SEMANTIC_DIFF',
      message: 'semanticDiffPath: resolved content is empty (FILE:...CONTENT: text or JSON.semanticDiff).'
    }
  }

  return { ok: true, semanticDiff: parsed.semanticDiff, resolvedFromPath: absolutePath }
}
