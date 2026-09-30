/**
 * LLM provider types and unified response interface.
 */

import type { ProviderId } from '@/constants'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface LLMProvider {
  /** Provider selected for this instance (also set for automatic selection). */
  providerId?: ProviderId
  /** True when the provider was selected because CRITIC_PROVIDER was omitted. */
  autoDetected?: boolean
  /** Resolved executable used when selecting a local CLI automatically. */
  providerCommand?: string
  /** @param messages - Conversation messages for completion */
  complete(messages: LLMMessage[]): Promise<LLMResponse>
}
