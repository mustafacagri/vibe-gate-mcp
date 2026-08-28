/**
 * Environment variable loader
 * Priorities:
 * 1. process.env (MCP / Shell)
 * 2. Workspace .env (VIBE_WORKSPACE_ROOT)
 * 3. Package Root .env (vibe-gate)
 */

import { config as dotenvConfig } from 'dotenv'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const debugLog = (msg: string) => {
  if (process.env.DEBUG === '1') process.stderr.write(`[vibe-gate debug] ${msg}\n`)
}

export function loadEnvironmentVariables(packageRoot: string): void {
  // 2. Workspace .env
  const workspaceRootEnv = process.env.VIBE_WORKSPACE_ROOT
  debugLog(`VIBE_WORKSPACE_ROOT raw: "${workspaceRootEnv}"`)

  if (workspaceRootEnv?.trim()) {
    const resolved = workspaceRootEnv.trim().replace(/^["']|["']$/g, '')
    const workspaceEnvPath = join(resolved, '.env')

    debugLog(`Checking workspace .env at: "${workspaceEnvPath}" (exists: ${existsSync(workspaceEnvPath)})`)

    if (existsSync(workspaceEnvPath)) {
      dotenvConfig({ path: workspaceEnvPath, override: false, quiet: true })
      debugLog('Loaded workspace .env')
    } else {
      debugLog(`Workspace .env not found at: ${workspaceEnvPath}`)
    }
  } else {
    debugLog('VIBE_WORKSPACE_ROOT not provided or empty; skipping workspace .env')
  }

  // 3. Package root .env
  const packageEnvPath = join(packageRoot, '.env')
  debugLog(`Checking package .env at: "${packageEnvPath}"`)

  if (existsSync(packageEnvPath)) {
    dotenvConfig({ path: packageEnvPath, override: false, quiet: true })
    debugLog('Loaded package .env')
  }

  debugLog(`Env check after load -> CRITIC_PROVIDER: ${process.env.CRITIC_PROVIDER || 'none'}`)
}
