/**
 * LLM provider factory and local CLI auto-detection.
 */

import type { Config } from '@/config'
import type { LLMProvider } from '@/llm/types'
import { createOpenAIProvider } from '@/llm/openai'
import { createAnthropicProvider } from '@/llm/anthropic'
import { createGoogleProvider } from '@/llm/google'
import { createMiniMaxProvider } from '@/llm/minimax'
import { createOpenCodeProvider } from '@/llm/opencode'
import {
  createClaudeCodeProvider,
  createCodexCliProvider,
  createCursorAgentProvider,
  createOpenCodeCliProvider
} from '@/llm/cli'
import {
  CLI_DEFAULT_COMMANDS,
  CURSOR_AGENT_LEGACY_COMMAND,
  PROVIDERS,
  type CliProviderId,
  type ProviderId
} from '@/constants'
import { getEffectiveModel } from '@/config'
import { findExecutable } from '@/llm/cli-command'

const AUTO_DETECT_CLI_ORDER: readonly CliProviderId[] = [
  PROVIDERS.CODEX_CLI,
  PROVIDERS.CLAUDE_CODE,
  PROVIDERS.CURSOR_AGENT,
  PROVIDERS.OPENCODE_CLI
]

interface DetectedCli {
  id: CliProviderId
  command: string
}

function configuredCliPath(id: CliProviderId, config: Config): string | undefined {
  switch (id) {
    case PROVIDERS.CODEX_CLI:
      return config.codexCliPath
    case PROVIDERS.CLAUDE_CODE:
      return config.claudeCodeCliPath
    case PROVIDERS.CURSOR_AGENT:
      return config.cursorAgentCliPath
    case PROVIDERS.OPENCODE_CLI:
      return config.opencodeCliPath
  }
}

function commandCandidates(id: CliProviderId, config: Config): string[] {
  const configuredPath = configuredCliPath(id, config)
  if (configuredPath) return [configuredPath]
  if (id === PROVIDERS.CURSOR_AGENT) return [CLI_DEFAULT_COMMANDS[id], CURSOR_AGENT_LEGACY_COMMAND]
  return [CLI_DEFAULT_COMMANDS[id]]
}

function hasOpenCodeModel(config: Config): boolean {
  const model = config.criticModel
  const separator = model?.indexOf('/') ?? -1
  return Boolean(model && separator > 0 && separator < model.length - 1)
}

function detectLocalCli(config: Config): DetectedCli | undefined {
  const configuredOrder = AUTO_DETECT_CLI_ORDER.filter(id => configuredCliPath(id, config))
  const defaultOrder = AUTO_DETECT_CLI_ORDER.filter(id => !configuredCliPath(id, config))
  const openCodeHasExplicitModel = hasOpenCodeModel(config) && defaultOrder.includes(PROVIDERS.OPENCODE_CLI)
  const preferredOrder = [
    ...configuredOrder,
    ...(openCodeHasExplicitModel ? [PROVIDERS.OPENCODE_CLI] : []),
    ...defaultOrder.filter(id => !openCodeHasExplicitModel || id !== PROVIDERS.OPENCODE_CLI)
  ]

  for (const id of preferredOrder) {
    if (id === PROVIDERS.OPENCODE_CLI && !hasOpenCodeModel(config)) continue
    for (const candidate of commandCandidates(id, config)) {
      const command = findExecutable(candidate)
      if (command) return { id, command }
    }
  }
  return undefined
}

const providerLabels: Record<ProviderId, string> = {
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.ANTHROPIC]: 'Anthropic',
  [PROVIDERS.GOOGLE]: 'Google Gemini',
  [PROVIDERS.MINIMAX]: 'MiniMax',
  [PROVIDERS.OPENCODE]: 'OpenCode',
  [PROVIDERS.CODEX_CLI]: 'Codex CLI',
  [PROVIDERS.CLAUDE_CODE]: 'Claude Code',
  [PROVIDERS.CURSOR_AGENT]: 'Cursor Agent',
  [PROVIDERS.OPENCODE_CLI]: 'OpenCode CLI'
}

export function isCliProvider(id: ProviderId): id is CliProviderId {
  return AUTO_DETECT_CLI_ORDER.includes(id as CliProviderId)
}

export function getProviderLabel(id: ProviderId): string {
  return providerLabels[id]
}

export function createLLMProvider(config: Config): LLMProvider | null {
  const detected = config.criticProvider ? undefined : detectLocalCli(config)
  // Preserve the former OpenAI default when no local CLI can be found.
  const providerId = config.criticProvider ?? detected?.id ?? PROVIDERS.OPENAI
  const autoDetected = !config.criticProvider && detected !== undefined
  const model = getEffectiveModel(config, providerId)
  const command = (id: CliProviderId, configuredPath: string | undefined): string => {
    if (detected && id === detected.id) return detected.command
    return configuredPath ?? CLI_DEFAULT_COMMANDS[id]
  }

  const providerMap: Record<ProviderId, () => LLMProvider | null> = {
    [PROVIDERS.OPENAI]: () => (config.openaiApiKey ? createOpenAIProvider(config.openaiApiKey, model) : null),
    [PROVIDERS.ANTHROPIC]: () =>
      config.anthropicApiKey ? createAnthropicProvider(config.anthropicApiKey, model) : null,
    [PROVIDERS.GOOGLE]: () => (config.googleApiKey ? createGoogleProvider(config.googleApiKey, model) : null),
    [PROVIDERS.MINIMAX]: () => (config.minimaxApiKey ? createMiniMaxProvider(config.minimaxApiKey, model) : null),
    [PROVIDERS.OPENCODE]: () =>
      config.opencodeApiKey ? createOpenCodeProvider(config.opencodeApiKey, model, config.opencodePlan) : null,
    [PROVIDERS.CODEX_CLI]: () =>
      createCodexCliProvider(command(PROVIDERS.CODEX_CLI, config.codexCliPath), model, config.criticCliTimeoutMs),
    [PROVIDERS.CLAUDE_CODE]: () =>
      createClaudeCodeProvider(
        command(PROVIDERS.CLAUDE_CODE, config.claudeCodeCliPath),
        model,
        config.criticCliTimeoutMs
      ),
    [PROVIDERS.CURSOR_AGENT]: () =>
      createCursorAgentProvider(
        command(PROVIDERS.CURSOR_AGENT, config.cursorAgentCliPath),
        model,
        config.criticCliTimeoutMs,
        !config.cursorAgentCliPath
      ),
    [PROVIDERS.OPENCODE_CLI]: () =>
      createOpenCodeCliProvider(
        command(PROVIDERS.OPENCODE_CLI, config.opencodeCliPath),
        model,
        config.criticCliTimeoutMs
      )
  }

  const provider = providerMap[providerId]()
  if (!provider) return null
  return {
    ...provider,
    providerId,
    autoDetected: autoDetected && isCliProvider(providerId),
    ...(autoDetected && detected ? { providerCommand: detected.command } : {})
  }
}
