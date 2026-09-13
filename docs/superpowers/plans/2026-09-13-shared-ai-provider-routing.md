# Shared AI Provider Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add explicit Google Gemini text-provider support to X Content Network and StartupScores using Vibe-Gate's existing provider/key contract, while preserving OpenAI/OpenCode behavior and avoiding duplicated key configuration.

**Architecture:** Vibe-Gate remains the contract reference and receives no runtime change. X Content Network gets one provider client in packages/core, reused by its web server and DB scripts; StartupScores gets one local provider client reused by its AI celebration utility. Explicit provider selection is strict, legacy X AI_* settings remain bounded migration fallbacks, and embeddings remain outside this text-provider change.

**Tech Stack:** TypeScript, Node fetch, @google/genai, Zod environment parsing, Node test runner, pnpm workspaces, Nuxt server utilities.

---

## File map

X Content Network:

- Create packages/core/src/ai-provider.ts and packages/core/tests/ai-provider.test.ts.
- Modify packages/core/src/env.ts, packages/core/src/index.ts, packages/core/package.json, pnpm-lock.yaml.
- Migrate packages/core/src/generator.ts and packages/core/src/research-provider.ts.
- Migrate apps/web/server/services/content-pipeline.ts and apps/web/server/api/admin/persona/architect.post.ts.
- Migrate text-AI calls in packages/db/src/bulk-generator.ts, quality-audit-all.ts, run-3-rounds-audit.ts, test-pipeline.ts, test-quality-full.ts, scripts/seed-racon-scenarios.ts, and scripts/test-llm.ts.
- Update .env.example, README.md, and affected core/web tests.

StartupScores:

- Create server/utils/ai-provider.ts and server/utils/ai-provider.test.ts.
- Modify server/utils/ai-celebrations.ts, its test, shared/config/environment.ts, package.json, pnpm-lock.yaml, and ops/systemd/startupscores.env.example.

Vibe-Gate:

- No runtime/provider source changes. Update docs/USAGE.md only if the final canonical example is missing.

Preserve C:/Github/mustafacagri/startupscores/.codex-x-content-gap-fix.patch exactly as-is.

## Task 1: Define the X Content Network contract with failing tests

Files: packages/core/tests/ai-provider.test.ts, packages/core/src/env.ts, packages/core/package.json, pnpm-lock.yaml.

- [ ] Add the dependency from C:/Github/mustafacagri/x-content-network:

  pnpm --filter @x-content-network/core add @google/genai

  Expected: only the core dependency and lockfile entries change.

- [ ] Write failing resolver tests for this exact matrix:

  resolveAiConfig({ CRITIC_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'g' })
  // => { provider: 'google', model: 'gemini-3.8-flash', apiKey: 'g', opencodePlan: 'go' }
  resolveAiConfig({ CRITIC_PROVIDER: 'google', OPENAI_API_KEY: 'o' })
  // => null; explicit provider never falls back
  resolveAiConfig({ OPENCODE_API_KEY: 'oc' })?.provider // => 'opencode'
  resolveAiConfig({ OPENAI_API_KEY: 'o' })?.provider // => 'openai'
  resolveAiConfig({ AI_API_KEY: 'legacy', AI_PROVIDER_URL: 'https://legacy.test/v1/responses' })?.legacy // => true

  Also test OPENCODE_PLAN=zen, missing keys, default models, and that Google is never auto-selected from key presence.

- [ ] Run and observe the expected failure:

  pnpm --filter @x-content-network/core test -- tests/ai-provider.test.ts

  Expected: FAIL because the resolver/client does not exist.

- [ ] Commit the red tests and dependency boundary:

  git add packages/core/package.json packages/core/tests/ai-provider.test.ts pnpm-lock.yaml
  git commit -m "test(core): define shared ai provider resolution"

## Task 2: Implement and test the X Content Network provider client

Files: create packages/core/src/ai-provider.ts; modify packages/core/src/env.ts and packages/core/src/index.ts; test packages/core/tests/ai-provider.test.ts.

- [ ] Implement this small public interface:

  export type AiCompletionRequest = {
  system?: string
  user: string
  temperature?: number
  maxOutputTokens?: number
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  }

  export type AiProviderId = 'openai' | 'google' | 'opencode'
  export type AiClient = {
  complete(request: AiCompletionRequest): Promise<string | null>
  }

  export function resolveAiConfig(environment?: NodeJS.ProcessEnv): AiConfig | null
  export function createAiClient(options?: {
  environment?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  googleClientFactory?: (apiKey: string) => GoogleClient
  }): AiClient | null

  No raw provider payload or provider metadata escapes the adapter.

- [ ] Implement strict resolution: explicit CRITIC_PROVIDER uses only its matching key; with no provider, preserve the legacy X path when any legacy AI_PROVIDER_URL, AI_API_KEY, or AI_MODEL setting is active, then prefer OpenCode, then OpenAI. Use CRITIC_MODEL first. Defaults are OpenCode gpt-5.6-luna, OpenAI gpt-4o-mini, and Google gemini-3.8-flash. OPENCODE_PLAN is go|zen with go as the default.

- [ ] Implement transports inside this file only:

  OpenAI -> https://api.openai.com/v1/chat/completions
  OpenCode Go -> https://opencode.ai/zen/go/v1/responses
  OpenCode Zen -> https://opencode.ai/zen/v1/responses
  Google -> GoogleGenAI.models.generateContent({ model, contents, config })

  Map system/user content, preserve OpenCode text.format, use Chat Completions response_format for OpenAI, and use Google JSON response configuration for structured requests. Normalize Chat Completions content, Responses output_text, and Gemini response.text to string or null. Preserve the legacy custom Responses payload only in the legacy branch.

- [ ] Add injected transport tests for URLs, models, system/user mapping, JSON settings, empty output, non-2xx responses, malformed payloads, and secret-free errors.

- [ ] Run:

  pnpm --filter @x-content-network/core test -- tests/ai-provider.test.ts
  pnpm --filter @x-content-network/core typecheck

  Expected: PASS. Commit with:

  git add packages/core/src/ai-provider.ts packages/core/src/env.ts packages/core/src/index.ts packages/core/tests/ai-provider.test.ts
  git commit -m "feat(core): add canonical ai provider client"

## Task 3: Migrate X Content Network runtime callers

Files: packages/core/src/generator.ts, packages/core/src/research-provider.ts, apps/web/server/services/content-pipeline.ts, apps/web/server/api/admin/persona/architect.post.ts, and their existing tests.

- [ ] Replace raw environment reads/fetches in tweet generation, evaluation, and architect with createAiClient().complete({ system, user, jsonSchema }). Keep prompt text, validators, parseAiEvaluation, response statuses, and tweet embedding extraction unchanged.

- [ ] Change normal research to receive the canonical completion function. Preserve RESEARCH_PROVIDER_URL, RESEARCH_API_KEY, and RESEARCH_MODEL as a legacy custom Responses override only; the canonical path must not construct provider URLs in research-provider.ts.

- [ ] Update fixtures to use explicit provider-specific test keys and injected completions. Keep one legacy AI_* compatibility test. Do not add a live-key test.

- [ ] Run:

  pnpm --filter @x-content-network/core test -- tests/generator.test.ts tests/research-provider.test.ts
  pnpm --filter web test
  pnpm --filter @x-content-network/core typecheck

  Expected: PASS. Commit with:

  git add packages/core/src/generator.ts packages/core/src/research-provider.ts apps/web/server/services/content-pipeline.ts apps/web/server/api/admin/persona/architect.post.ts packages/core/tests/generator.test.ts packages/core/tests/research-provider.test.ts apps/web/tests
  git commit -m "refactor(x-content): route runtime ai calls through provider client"

## Task 4: Migrate X Content Network DB and operational scripts

Files: packages/db/src/bulk-generator.ts, quality-audit-all.ts, run-3-rounds-audit.ts, test-pipeline.ts, test-quality-full.ts, scripts/seed-racon-scenarios.ts, scripts/test-llm.ts.

- [ ] Replace each raw text-generation request with createAiClient().complete({ system, user, temperature, jsonSchema }). Remove direct provider-key/URL reads from these text paths while preserving prompts, retries, logging, database writes, and domain parsers.

- [ ] Leave computeEmbedding on its existing OpenAI embedding endpoint and deterministic fallback. Google text selection must not be mistaken for embedding support.

- [ ] Make test-llm.ts report only provider/model/key-presence and use the configured client; never print endpoint credentials.

- [ ] Run this source scan:

  rg -n "AI_PROVIDER_URL|AI_API_KEY|OPENCODE_API_KEY|OPENAI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|fetch\(" packages/db/src packages/core/src apps/web/server

  Expected: text-provider key/URL construction is confined to packages/core/src/ai-provider.ts, the bounded legacy research override, and StartupScores' separate adapter; embedding code is the only explicit exception.

- [ ] Run and commit:

  pnpm --filter @x-content-network/db typecheck
  pnpm --filter @x-content-network/db test
  git add packages/db/src
  git commit -m "refactor(db): use shared ai provider client"

## Task 5: Add StartupScores provider client with failing tests

Files: create server/utils/ai-provider.ts and server/utils/ai-provider.test.ts; modify package.json and pnpm-lock.yaml.

- [ ] From C:/Github/mustafacagri/startupscores, run pnpm add @google/genai.

- [ ] Write failing tests for strict Google/OpenAI/OpenCode selection, missing selected key, default models, OPENCODE_PLAN, OpenCode Responses extraction, OpenAI Chat Completions extraction, Gemini response.text, and injected non-live transport.

- [ ] Implement one local client with the same request/result concepts as X Content Network. With no explicit provider, preserve StartupScores' OpenCode-then-OpenAI preference. With CRITIC_PROVIDER=google, use only GOOGLE_GENERATIVE_AI_API_KEY and default gemini-3.8-flash; return string or null and redact keys in errors.

- [ ] Run pnpm exec tsx --test server/utils/ai-provider.test.ts; expected PASS. Commit with:

  git add package.json pnpm-lock.yaml server/utils/ai-provider.ts server/utils/ai-provider.test.ts
  git commit -m "feat(ai): add shared provider routing to startupscores"

## Task 6: Integrate StartupScores generation and configuration

Files: server/utils/ai-celebrations.ts, its test, shared/config/environment.ts, ops/systemd/startupscores.env.example.

- [ ] Add an optional completion dependency without changing existing two-argument call sites:

  type AiGenerationDeps = {
  complete: (prompt: string) => Promise<string | null>
  }

  Thread it through celebration, mission, and daily-enhancement functions. Production uses the configured provider client; tests pass a deterministic fake.

- [ ] Keep GUIDs, TTL/cache eviction, prompt text, parser, validators, and null-on-unavailable behavior unchanged. Remove tests that conditionally call a live provider when a developer key exists; add deterministic valid-output, cache-hit, Google-selection, and no-key tests.

- [ ] Add optional CRITIC_PROVIDER, CRITIC_MODEL, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENCODE_API_KEY, and OPENCODE_PLAN names to ENVIRONMENT_KEYS and the systemd example. Do not make AI required for boot.

- [ ] Run pnpm test:unit and pnpm typecheck; expected PASS. Commit with:

  git add server/utils/ai-celebrations.ts server/utils/ai-celebrations.test.ts shared/config/environment.ts ops/systemd/startupscores.env.example
  git commit -m "refactor(ai): route celebration generation through providers"

## Task 7: Document, verify, and hand off

Files: X Content Network .env.example and README.md; optional Vibe-Gate docs/USAGE.md.

- [ ] Document this exact Google configuration in both consuming deployments:

  CRITIC_PROVIDER=google
  CRITIC_MODEL=gemini-3.8-flash
  GOOGLE_GENERATIVE_AI_API_KEY=

  Mark X AI_PROVIDER_URL, AI_API_KEY, and AI_MODEL as transitional; state that embeddings are separate. Do not copy secrets.

- [ ] Run full verification from each repository:

  # x-content-network

  pnpm test
  pnpm typecheck
  pnpm lint

  # startupscores

  pnpm test
  pnpm typecheck
  pnpm lint

  # vibe-gate-mcp

  yarn test
  yarn typecheck

  Expected: all pass, no unrelated formatting churn, and no changes to the StartupScores patch file.

- [ ] Run the source scan from Task 4 again. Provider key reads, URL construction, and response-shape parsing must be confined to the two adapters plus the explicitly bounded legacy research path.

- [ ] Review git diff and git status --short in all three repositories. Preserve pre-existing user changes; do not reset or clean them. Report final commits and the fact that the same secret value must be provisioned into each process that needs it; Vibe-Gate does not expose its .env to the other applications.
