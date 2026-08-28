/**
 * Smoke: build FILE:…CONTENT: from files[] under VIBE_WORKSPACE_ROOT.
 * Usage: VIBE_WORKSPACE_ROOT=/path/to/project npm run smoke:files -- [relPath...]
 */
import { buildSemanticDiffFromSourceFiles } from '../src/utils/build-semantic-diff-from-files.ts'
import { submitPhaseReviewInputSchema } from '../src/tools/submit-phase-review.ts'
import { shouldPersistPhaseStatus } from '../src/roadmap/phase-status-policy.ts'

async function main(): Promise<void> {
  const root = process.env.VIBE_WORKSPACE_ROOT?.trim()
  if (!root) {
    console.error('Set VIBE_WORKSPACE_ROOT to the target project root')
    process.exit(1)
  }

  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Pass at least one workspace-relative file path')
    process.exit(1)
  }

  const built = await buildSemanticDiffFromSourceFiles(root, files)
  console.log('build.ok:', built.ok)
  if (!built.ok) {
    console.log(built)
    process.exit(1)
  }
  console.log('filesLoaded:', built.filesLoaded)
  console.log('chars:', built.semanticDiff.length)

  const parsed = submitPhaseReviewInputSchema.safeParse({
    phaseId: 'mcp-smoke-files',
    report: 'smoke',
    files,
    updateStatus: false
  })
  console.log('schema.filesOnly:', parsed.success)
  console.log('status.persist.defaultProbe:', shouldPersistPhaseStatus('mcp-smoke-files'))
  console.log('status.persist.explicitFalse:', shouldPersistPhaseStatus('phase-x', false))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
