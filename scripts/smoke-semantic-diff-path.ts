/**
 * Smoke: load semanticDiffPath under VIBE_WORKSPACE_ROOT + validate xor schema.
 * Usage: VIBE_WORKSPACE_ROOT=/path/to/project npm run smoke:semantic-diff-path -- [relativePath]
 */
import { submitPhaseReviewInputSchema } from '../src/tools/submit-phase-review.ts'
import { loadSemanticDiffFromWorkspacePath } from '../src/utils/resolve-semantic-diff-from-path.ts'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'

async function main(): Promise<void> {
  const root = process.env.VIBE_WORKSPACE_ROOT?.trim()
  if (!root) {
    console.error('Set VIBE_WORKSPACE_ROOT to the target project root')
    process.exit(1)
  }

  const relativePath = process.argv[2] ?? '.vibe/mcp-smoke-semanticDiffPath-r1.txt'

  const loaded = await loadSemanticDiffFromWorkspacePath(root, relativePath)
  console.log('load.ok:', loaded.ok)
  if (!loaded.ok) {
    console.log(loaded)
    process.exit(1)
  }
  console.log('load.chars:', loaded.semanticDiff.length)
  console.log('load.head:', JSON.stringify(loaded.semanticDiff.slice(0, 100)))

  const pathOnly = submitPhaseReviewInputSchema.safeParse({
    phaseId: 'mcp-smoke-semanticDiffPath',
    report: 'smoke',
    semanticDiffPath: relativePath,
    round: 1
  })
  console.log('schema.pathOnly:', pathOnly.success)

  const both = submitPhaseReviewInputSchema.safeParse({
    phaseId: 'x',
    report: 'y',
    semanticDiff: 'FILE: a.ts\nCONTENT:\nz\n',
    semanticDiffPath: relativePath
  })
  console.log('schema.bothRejected:', !both.success)

  const jsonSchema = toJsonSchemaCompat(submitPhaseReviewInputSchema)
  const props = (jsonSchema as { properties?: Record<string, unknown> }).properties ?? {}
  const required = (jsonSchema as { required?: string[] }).required ?? []
  console.log('jsonSchema.hasSemanticDiffPath:', 'semanticDiffPath' in props)
  console.log('jsonSchema.required:', required)
  console.log('jsonSchema.propertyKeys:', Object.keys(props))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
