/**
 * Token estimation utility for LLM context management.
 * Estimates tokens using ~4 chars per token approximation.
 */

import type { ProviderId } from '@/constants'
import { TOKEN_ESTIMATION, CONTEXT_WINDOWS, MAX_CONTEXT_WINDOWS } from '@/constants'

export { CONTEXT_WINDOWS, MAX_CONTEXT_WINDOWS }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATION.CHARS_PER_TOKEN)
}

export function estimateMessages(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

export function getEffectiveContextBudget(provider: ProviderId): number {
  const raw = CONTEXT_WINDOWS[provider]
  return (
    Math.floor(raw * TOKEN_ESTIMATION.EFFECTIVE_CONTEXT_FACTOR) -
    TOKEN_ESTIMATION.SAFETY_MARGIN -
    TOKEN_ESTIMATION.RESPONSE_RESERVE
  )
}

export function getMaxContextBudget(provider: ProviderId): number {
  const raw = MAX_CONTEXT_WINDOWS[provider]
  return raw - TOKEN_ESTIMATION.SAFETY_MARGIN - TOKEN_ESTIMATION.RESPONSE_RESERVE
}

export function budgetToTokens(budgetChars: number): number {
  return Math.floor(budgetChars / TOKEN_ESTIMATION.CHARS_PER_TOKEN)
}
