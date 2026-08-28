/**
 * Google Gemini API integration.
 */

import { GoogleGenAI } from '@google/genai'
import { LLM_MAX_TOKENS } from '@/constants'
import type { LLMMessage, LLMResponse } from '@/llm/types'

type GeminiContent = {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

function splitMessages(messages: LLMMessage[]): { systemInstruction?: string; contents: GeminiContent[] } {
  const systemParts: string[] = []
  const contents: GeminiContent[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content)
      continue
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    })
  }

  return {
    ...(systemParts.length > 0 ? { systemInstruction: systemParts.join('\n\n') } : {}),
    contents
  }
}

export function createGoogleProvider(apiKey: string, model: string) {
  const client = new GoogleGenAI({ apiKey })

  return {
    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const { systemInstruction, contents } = splitMessages(messages)
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          maxOutputTokens: LLM_MAX_TOKENS,
          ...(systemInstruction ? { systemInstruction } : {})
        }
      })
      const usage = response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata.candidatesTokenCount ?? 0
          }
        : undefined
      return { content: response.text ?? '', usage }
    }
  }
}
