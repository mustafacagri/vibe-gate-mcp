import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { PATHS } from '../src/constants'
import { readStatus } from '../src/roadmap/status'

const TEST_DIR = join(process.cwd(), '.test-tmp-benchmark')

async function setupEnv() {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(join(TEST_DIR, 'docs'), { recursive: true })
  // Scenario: .vibe/ROADMAP.md is missing, docs/ROADMAP.md exists
  // Sequential loop tries .vibe/ROADMAP.md first (fails ENOENT), then docs/ROADMAP.md
  await writeFile(join(TEST_DIR, PATHS.DOCS_ROADMAP), '# Docs Roadmap\n- [x] Phase 2.5.0 completed task\n')
}

async function cleanupEnv() {
  await rm(TEST_DIR, { recursive: true, force: true })
}

async function runBenchmark(iterations = 2000) {
  await setupEnv()

  // Warmup
  for (let i = 0; i < 100; i++) {
    await readStatus(TEST_DIR)
  }

  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    await readStatus(TEST_DIR)
  }
  const end = performance.now()

  const totalTimeMs = end - start
  const avgTimeMs = totalTimeMs / iterations
  const opsPerSec = (iterations / totalTimeMs) * 1000

  console.log(`Iterations: ${iterations}`)
  console.log(`Total Time: ${totalTimeMs.toFixed(2)} ms`)
  console.log(`Average Time per Op: ${avgTimeMs.toFixed(4)} ms`)
  console.log(`Ops/sec: ${opsPerSec.toFixed(2)}`)

  await cleanupEnv()
}

runBenchmark().catch(err => {
  console.error(err)
  process.exit(1)
})
