/**
 * Vibe-Gate MCP Server
 * Adversarial Quality Gate: IDE AI vs Critic AI, human decides on deadlock.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvironmentVariables } from './env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageEnvRoot = join(__dirname, '..')

loadEnvironmentVariables(packageEnvRoot)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ENV_KEYS, ERROR_MESSAGES, PROVIDERS, SERVER_NAME, SERVER_VERSION } from '@/constants'
import { loadConfig } from '@/config'
import { registerTools } from '@/tools'

function checkApiKeys(): void {
  const config = loadConfig()
  const provider = config.criticProvider as (typeof PROVIDERS)[keyof typeof PROVIDERS]

  const missingKeys: string[] = []

  if (provider === PROVIDERS.OPENAI && !config.openaiApiKey) {
    missingKeys.push(ENV_KEYS.OPENAI_API_KEY)
  } else if (provider === PROVIDERS.ANTHROPIC && !config.anthropicApiKey) {
    missingKeys.push(ENV_KEYS.ANTHROPIC_API_KEY)
  } else if (provider === PROVIDERS.GOOGLE && !config.googleApiKey) {
    missingKeys.push(ENV_KEYS.GOOGLE_GENERATIVE_AI_API_KEY)
  } else if (provider === PROVIDERS.MINIMAX && !config.minimaxApiKey) {
    missingKeys.push(ENV_KEYS.MINIMAX_API_KEY)
  } else if (provider === PROVIDERS.OPENCODE && !config.opencodeApiKey) missingKeys.push(ENV_KEYS.OPENCODE_API_KEY)

  if (missingKeys.length > 0) {
    console.error(`[vibe-gate] WARNING: Missing API keys: ${missingKeys.join(', ')}`)
    console.error('[vibe-gate] Set them in .env or environment, then restart.')
  }
}

async function main(): Promise<void> {
  checkApiKeys()

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    { capabilities: { tools: {} } }
  )

  registerTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(err => {
  console.error(ERROR_MESSAGES.STARTUP_FAILED, err)
  process.exit(1)
})
