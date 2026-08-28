/**
 * Anthropic API integration.
 */

import Anthropic from '@anthropic-ai/sdk'
import { LLM_MAX_TOKENS } from '@/constants'
import type { LLMMessage, LLMResponse } from '@/llm/types'

function splitMessages(messages: LLMMessage[]): {
  system: string | undefined
  chat: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const systemParts: string[] = []
  const chat: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
    } else {
      chat.push({ role: m.role, content: m.content })
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    chat
  }
}

export function createAnthropicProvider(apiKey: string, model: string) {
  const client = new Anthropic({ apiKey })

  return {
    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const { system, chat } = splitMessages(messages)
      const message = await client.messages.create({
        model,
        max_tokens: LLM_MAX_TOKENS,
        system,
        messages: chat
      })
      const textBlock = message.content.find(b => b.type === 'text')
      const content = textBlock && 'text' in textBlock ? textBlock.text : ''
      const usage = message.usage
        ? {
            promptTokens: message.usage.input_tokens,
            completionTokens: message.usage.output_tokens
          }
        : undefined
      return { content, usage }
    }
  }
}
