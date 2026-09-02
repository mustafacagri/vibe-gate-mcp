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
  for (let i = 0; i < fileCount; i++) {
    const relPath = `src/file_${i}.ts`
    paths.push(relPath)
    const content =
      `// File ${i}\n` + 'export const data = ' + JSON.stringify(Array.from({ length: 1000 }, (_, k) => k)) + '\n'
    await writeFile(join(root, relPath), content, 'utf8')
  }

  // Warmup
  for (let i = 0; i < 20; i++) {
    await buildSemanticDiffFromSourceFiles(root, paths)
  }

  // Measure
  const iterations = 200
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    await buildSemanticDiffFromSourceFiles(root, paths)
  }
  const elapsed = performance.now() - start

  console.log(`Iterations: ${iterations}`)
  console.log(`Total time: ${elapsed.toFixed(2)} ms`)
  console.log(`Average per call: ${(elapsed / iterations).toFixed(3)} ms`)
  console.log(`Operations per sec: ${((iterations / elapsed) * 1000).toFixed(1)} ops/s`)

  await rm(root, { recursive: true, force: true })
}

runBenchmark().catch(err => {
  console.error(err)
  process.exit(1)
})
