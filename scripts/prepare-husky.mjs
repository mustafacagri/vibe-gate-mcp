/**
 * Run husky only in a git checkout (skip for npm/npx consumers).
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

if (!existsSync('.git')) {
  process.exit(0)
}

const require = createRequire(import.meta.url)
let huskyBin
try {
  huskyBin = require.resolve('husky/bin.js')
} catch {
  process.exit(0)
}

const result = spawnSync(process.execPath, [huskyBin], { stdio: 'inherit' })
process.exit(result.status ?? 0)
