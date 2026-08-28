/**
 * LLM provider types and unified response interface.
 */

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface LLMProvider {
  /** @param messages - Conversation messages for completion */
  complete(messages: LLMMessage[]): Promise<LLMResponse>
}
