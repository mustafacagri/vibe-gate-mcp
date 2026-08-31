import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { buildSemanticDiffFromSourceFiles } from '../src/utils/build-semantic-diff-from-files.ts'

async function runBenchmark() {
  const root = join(tmpdir(), `vibe-bench-${Date.now()}`)
  await mkdir(join(root, 'src'), { recursive: true })

  const fileCount = 10
  const paths: string[] = []
  const content = 'export const x = 12345;\n'.repeat(100) // ~2.3KB per file

  for (let i = 0; i < fileCount; i++) {
    const relPath = `src/file_${i}.ts`
    paths.push(relPath)
    await writeFile(join(root, relPath), content, 'utf8')
  }

  // Warmup
  for (let i = 0; i < 5; i++) {
    await buildSemanticDiffFromSourceFiles(root, paths)
  }

  const iterations = 100
  const start = performance.now()

  for (let i = 0; i < iterations; i++) {
    const res = await buildSemanticDiffFromSourceFiles(root, paths)
    if (!res.ok) {
      throw new Error(`Benchmark failed: ${res.message}`)
    }
  }

  const durationMs = performance.now() - start
  const avgMs = durationMs / iterations

  console.log(`[Benchmark] ${iterations} iterations for ${fileCount} files:`)
  console.log(`  Total time: ${durationMs.toFixed(2)} ms`)
  console.log(`  Average time per call: ${avgMs.toFixed(3)} ms`)

  await rm(root, { recursive: true, force: true })
}

runBenchmark().catch(err => {
  console.error(err)
  process.exit(1)
})
