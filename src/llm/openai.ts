/**
 * OpenAI API integration.
 */

import OpenAI from 'openai'
import { LLM_MAX_TOKENS } from '@/constants'
import type { LLMMessage, LLMResponse } from '@/llm/types'

const ROLE_MAP = {
  user: 'user',
  assistant: 'assistant',
  system: 'system'
} as const

function toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map(m => ({
    role: ROLE_MAP[m.role as keyof typeof ROLE_MAP],
    content: m.content
  }))
}

export function createOpenAIProvider(apiKey: string, model: string) {
  const client = new OpenAI({ apiKey })

  return {
    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const completion = await client.chat.completions.create({
        model,
        max_completion_tokens: LLM_MAX_TOKENS,
        temperature: 0.3, // Low temperature for consistent, deterministic responses
        messages: toOpenAIMessages(messages)
      })
      const choice = completion.choices[0]
      const content = choice?.message?.content ?? ''
      const usage = completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens
          }
        : undefined
      return { content, usage }
    }
  }
}
