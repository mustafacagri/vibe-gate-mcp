import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REVIEW_INPUT_LIMITS } from '@/constants'
import { readChangedFileContent, readRequestedFiles } from '@/summarizer/read-changed-files'

describe('requested file context', () => {
  let tempRoot = ''

  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
    tempRoot = ''
  })

  async function createWorkspace(): Promise<string> {
    tempRoot = await mkdtemp(join(tmpdir(), 'vibe-gate-context-'))
    const workspace = join(tempRoot, 'workspace')
    await mkdir(workspace)
    return workspace
  }

  it('reads requested line ranges and reports when context is capped', async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, 'src'))
    await writeFile(join(workspace, 'src/file.ts'), Array.from({ length: 200 }, (_, i) => `line-${i + 1}`).join('\n'))

    const requested = await readRequestedFiles(workspace, 'REQUEST: src/file.ts:40-42')
    expect(requested.filesAnalyzed).toBe(1)
    expect(requested.semanticDiff).toContain('40 | line-40')
    expect(requested.semanticDiff).toContain('42 | line-42')
    expect(requested.semanticDiff).not.toContain('43 | line-43')

    const wholeFileRequest = await readRequestedFiles(workspace, 'REQUEST: src/file.ts')
    expect(wholeFileRequest.semanticDiff).toContain(
      `Context limited to ${REVIEW_INPUT_LIMITS.MAX_REQUESTED_CONTEXT_LINES} lines`
    )
    expect(wholeFileRequest.semanticDiff).not.toContain('121 | line-121')
  })

  it('rejects sibling-prefix traversal and symlinks outside the workspace', async () => {
    const workspace = await createWorkspace()
    const sibling = join(tempRoot, 'workspace-sibling')
    await mkdir(sibling)
    await writeFile(join(sibling, 'secret.ts'), 'secret')
    await symlink(sibling, join(workspace, 'linked'))

    const siblingResult = await readChangedFileContent(workspace, '../workspace-sibling/secret.ts')
    const symlinkResult = await readChangedFileContent(workspace, 'linked/secret.ts')
    expect(siblingResult.error).toBeDefined()
    expect(symlinkResult.error).toBeDefined()
    await expect(readRequestedFiles(workspace, 'REQUEST: linked/secret.ts')).rejects.toThrow()
  })
})
