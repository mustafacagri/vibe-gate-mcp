/**
 * OpenCode endpoint routing by model family and plan (Zen vs Go).
 * @see https://opencode.ai/docs/zen/
 * @see https://opencode.ai/docs/go/
 */

import {
  OPENCODE_ENDPOINT_KINDS,
  OPENCODE_ENDPOINT_ROUTING,
  OPENCODE_GO,
  OPENCODE_GO_ENDPOINT_ROUTING,
  OPENCODE_MODEL_NAMESPACE_REGEX,
  OPENCODE_PLANS,
  OPENCODE_ZEN,
  OPENCODE_ZEN_MODEL_ALIASES,
  type OpenCodeEndpointKind,
  type OpenCodePlanId
} from '@/constants'

export { OPENCODE_ENDPOINT_KINDS, type OpenCodeEndpointKind, type OpenCodePlanId }

export function normalizeOpenCodeModelId(model: string): string {
  const stripped = model.replace(OPENCODE_MODEL_NAMESPACE_REGEX, '')
  return OPENCODE_ZEN_MODEL_ALIASES[stripped] ?? stripped
}

function resolveFromRoutingTable(
  normalized: string,
  routing: ReadonlyArray<{ kind: OpenCodeEndpointKind; prefixes: readonly string[] }>
): OpenCodeEndpointKind | undefined {
  const match = routing.find(route => route.prefixes.some(prefix => normalized.startsWith(prefix)))
  return match?.kind
}

export function resolveOpenCodeEndpoint(
  model: string,
  plan: OpenCodePlanId = OPENCODE_PLANS.ZEN
): OpenCodeEndpointKind {
  const normalized = normalizeOpenCodeModelId(model).toLowerCase()

  if (plan === OPENCODE_PLANS.GO) {
    return resolveFromRoutingTable(normalized, OPENCODE_GO_ENDPOINT_ROUTING) ?? OPENCODE_ENDPOINT_KINDS.CHAT
  }

  return resolveFromRoutingTable(normalized, OPENCODE_ENDPOINT_ROUTING) ?? OPENCODE_ENDPOINT_KINDS.CHAT
}

export function getOpenCodeChatBaseUrl(plan: OpenCodePlanId): string {
  return plan === OPENCODE_PLANS.GO ? OPENCODE_GO.BASE_URL : OPENCODE_ZEN.BASE_URL
}

export function getOpenCodeAnthropicBaseUrl(plan: OpenCodePlanId): string {
  return plan === OPENCODE_PLANS.GO ? OPENCODE_GO.ANTHROPIC_BASE_URL : OPENCODE_ZEN.ANTHROPIC_BASE_URL
}

export function buildOpenCodeGeminiUrl(model: string, plan: OpenCodePlanId = OPENCODE_PLANS.ZEN): string {
  const modelId = normalizeOpenCodeModelId(model)
  const { BASE_URL, PATHS } = OPENCODE_ZEN
  if (plan === OPENCODE_PLANS.GO) {
    throw new Error('Gemini models are not available on OpenCode Go. Use OPENCODE_PLAN=zen or a different model.')
  }
  return `${BASE_URL}/${PATHS.MODELS}/${modelId}:${PATHS.GEMINI_GENERATE_ACTION}`
}
