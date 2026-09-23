/**
 * OpenAI API integration.
 */

import OpenAI from 'openai'
import { LLM_MAX_TOKENS } from '@/constants'
import type { LLMMessage, LLMResponse } from '@/llm/types'

function toOpenAIInput(messages: LLMMessage[]): OpenAI.Responses.ResponseInputItem[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }))
}

export function createOpenAIProvider(apiKey: string, model: string) {
  const client = new OpenAI({ apiKey })

  return {
    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const response = await client.responses.create({
        model,
        max_output_tokens: LLM_MAX_TOKENS,
        input: toOpenAIInput(messages)
      })
      const usage = response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens
          }
        : undefined
      return { content: response.output_text, usage }
    }
  }
}
