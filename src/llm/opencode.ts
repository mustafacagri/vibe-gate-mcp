/**
 * OpenCode API integration (Zen pay-as-you-go or Go subscription).
 * Routes requests to the correct endpoint based on model family and plan.
 * @see https://opencode.ai/docs/zen/
 * @see https://opencode.ai/docs/go/
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { LLM_MAX_TOKENS, OPENCODE_PLANS, OPENCODE_ZEN_URLS, type OpenCodePlanId } from '@/constants'
import {
  buildOpenCodeGeminiUrl,
  getOpenCodeAnthropicBaseUrl,
  getOpenCodeChatBaseUrl,
  normalizeOpenCodeModelId,
  OPENCODE_ENDPOINT_KINDS,
  resolveOpenCodeEndpoint
} from '@/llm/opencode-endpoint'
import type { LLMMessage, LLMResponse } from '@/llm/types'

const ROLE_MAP = {
  user: 'user',
  assistant: 'assistant',
  system: 'system'
} as const

const GEMINI_ROLE_MAP = {
  user: 'user',
  assistant: 'model',
  system: 'user'
} as const

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

function toRoleContentMessages(messages: LLMMessage[]): Array<{ role: string; content: string }> {
  return messages.map(m => ({
    role: ROLE_MAP[m.role as keyof typeof ROLE_MAP],
    content: m.content
  }))
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return toRoleContentMessages(messages) as OpenAI.ChatCompletionMessageParam[]
}

function toGeminiContents(messages: LLMMessage[]) {
  return messages.map(m => ({
    role: GEMINI_ROLE_MAP[m.role as keyof typeof GEMINI_ROLE_MAP],
    parts: [{ text: m.content }]
  }))
}

type ResponsesOutputItem = {
  type?: string
  content?: Array<{ type?: string; text?: string }>
}

type ResponsesApiBody = {
  output?: ResponsesOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

function extractResponsesText(body: ResponsesApiBody): string {
  const texts: string[] = []
  for (const item of body.output ?? []) {
    if (item.type !== 'message' || !item.content) continue
    for (const part of item.content) {
      if (part.type === 'output_text' && part.text) texts.push(part.text)
    }
  }
  return texts.join('')
}

async function completeViaAnthropic(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  plan: OpenCodePlanId
): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey, baseURL: getOpenCodeAnthropicBaseUrl(plan) })
  const { system, chat } = splitMessages(messages)
  const message = await client.messages.create({
    model: normalizeOpenCodeModelId(model),
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

async function completeViaChat(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  plan: OpenCodePlanId
): Promise<LLMResponse> {
  const client = new OpenAI({ apiKey, baseURL: getOpenCodeChatBaseUrl(plan) })
  const completion = await client.chat.completions.create({
    model: normalizeOpenCodeModelId(model),
    max_completion_tokens: LLM_MAX_TOKENS,
    temperature: 0.3,
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

async function completeViaResponses(apiKey: string, model: string, messages: LLMMessage[]): Promise<LLMResponse> {
  const response = await fetch(OPENCODE_ZEN_URLS.RESPONSES, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: normalizeOpenCodeModelId(model),
      input: toRoleContentMessages(messages),
      max_output_tokens: LLM_MAX_TOKENS
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenCode Zen responses API failed (${response.status}): ${errorBody}`)
  }

  const body = (await response.json()) as ResponsesApiBody
  const content = extractResponsesText(body)
  const usage = body.usage
    ? {
        promptTokens: body.usage.input_tokens ?? 0,
        completionTokens: body.usage.output_tokens ?? 0
      }
    : undefined
  return { content, usage }
}

type GeminiApiBody = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

async function completeViaGemini(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  plan: OpenCodePlanId
): Promise<LLMResponse> {
  const response = await fetch(buildOpenCodeGeminiUrl(model, plan), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: toGeminiContents(messages),
      generationConfig: { maxOutputTokens: LLM_MAX_TOKENS }
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenCode Zen Gemini API failed (${response.status}): ${errorBody}`)
  }

  const body = (await response.json()) as GeminiApiBody
  const parts = body.candidates?.[0]?.content?.parts ?? []
  const content = parts.map(part => part.text ?? '').join('')
  const usage = body.usageMetadata
    ? {
        promptTokens: body.usageMetadata.promptTokenCount ?? 0,
        completionTokens: body.usageMetadata.candidatesTokenCount ?? 0
      }
    : undefined
  return { content, usage }
}

export function createOpenCodeProvider(apiKey: string, model: string, plan: OpenCodePlanId = OPENCODE_PLANS.ZEN) {
  return {
    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
      const endpoint = resolveOpenCodeEndpoint(model, plan)

      if (endpoint === OPENCODE_ENDPOINT_KINDS.ANTHROPIC) return completeViaAnthropic(apiKey, model, messages, plan)
      if (endpoint === OPENCODE_ENDPOINT_KINDS.RESPONSES) return completeViaResponses(apiKey, model, messages)
      if (endpoint === OPENCODE_ENDPOINT_KINDS.GEMINI) return completeViaGemini(apiKey, model, messages, plan)
      return completeViaChat(apiKey, model, messages, plan)
    }
  }
}
