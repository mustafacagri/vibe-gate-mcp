import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('reads the complete source even when a range is requested', async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, 'src'))
    await writeFile(join(workspace, 'src/file.ts'), Array.from({ length: 200 }, (_, i) => `line-${i + 1}`).join('\n'))

    const requested = await readRequestedFiles(workspace, 'REQUEST: src/file.ts:40-42')
    expect(requested.filesAnalyzed).toBe(1)
    expect(requested.semanticDiff).toContain('line-1\nline-2')
    expect(requested.semanticDiff).toContain('line-200')
    const wholeFileRequest = await readRequestedFiles(workspace, 'REQUEST: src/file.ts')
    expect(wholeFileRequest.semanticDiff).toBe(requested.semanticDiff)
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
