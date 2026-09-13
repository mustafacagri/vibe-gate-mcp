# Minimal Shared AI Provider Contract

## Decision

Google Gemini will be selectable in `x-content-network` and `startupscores`
through the provider and key names already established by Vibe-Gate.
Vibe-Gate already has the required Google provider, so its runtime is not
changed; it is the configuration-contract source of truth.

This change does not create a proxy service, a third repository, a new shared
package, or a generic AI framework. The two applications are separate
deployables. They receive the same secret value from deployment secret
management; one process cannot and should not read another repository's
`.env` file.

DRY is enforced at the correct boundaries: one provider resolver and adapter
for all X Content Network consumers, one for StartupScores, and no provider
selection, endpoint construction, or response-shape parsing in call sites.
Extracting a new cross-repository package would add release and deployment
coupling disproportionate to this request, so it is out of scope.

## Current state and corrected scope

Vibe-Gate already supports `CRITIC_PROVIDER=google` with
`GOOGLE_GENERATIVE_AI_API_KEY`, as well as OpenAI and OpenCode plans.

X Content Network has independent OpenCode/Responses-shaped calls in core
tweet generation, web evaluation/research/persona architect, and DB bulk
generation, quality audits, pipeline test utilities, and scenario seeding.
They read `AI_PROVIDER_URL`, `AI_API_KEY`, and `AI_MODEL` directly. The
previous plan incorrectly omitted the DB call sites and incorrectly described
new OpenAI support as backward compatibility.

StartupScores has one production AI utility for celebration/mission copy. It
prefers OpenCode when `OPENCODE_API_KEY` exists and otherwise uses OpenAI. It
has no Google provider.

X Content Network embeddings are a separate capability. They remain on the
current OpenAI embedding endpoint plus deterministic fallback; this change
does not force a text provider switch onto embeddings.

## Canonical environment contract

```text
CRITIC_PROVIDER=openai|google|opencode
CRITIC_MODEL=<provider model id>
OPENAI_API_KEY=<OpenAI key>
GOOGLE_GENERATIVE_AI_API_KEY=<Google Gemini key>
OPENCODE_API_KEY=<OpenCode key>
OPENCODE_PLAN=go|zen
```

Resolution rules are deterministic:

1. With `CRITIC_PROVIDER` set, only that provider and matching key are used.
   Missing keys fail closed; there is no silent fallback.
2. Without it, X Content Network preserves its legacy custom path when any
   legacy `AI_PROVIDER_URL`, `AI_API_KEY`, or `AI_MODEL` setting is in use,
   retaining the current key precedence and request shape.
3. Otherwise both applications prefer `OPENCODE_API_KEY`, then
   `OPENAI_API_KEY`. The OpenAI branch is new additive support in X Content
   Network, not a claim about its current behavior.
4. Google is never auto-selected from key presence; use
   `CRITIC_PROVIDER=google` explicitly.

`AI_PROVIDER_URL`, `AI_API_KEY`, and `AI_MODEL` are transitional and are read
only when `CRITIC_PROVIDER` is unset. They cannot override an explicit
provider. Existing `RESEARCH_PROVIDER_URL`, `RESEARCH_API_KEY`, and
`RESEARCH_MODEL` remain supported as a legacy custom research override; when
absent, research uses the canonical adapter.

Defaults preserve current behavior where possible: OpenCode uses
`gpt-5.6-luna` and `OPENCODE_PLAN=go`; StartupScores' OpenAI default remains
`gpt-4o-mini`; Google defaults to `gemini-3.8-flash`.

## X Content Network implementation

Add one provider-aware client to `packages/core` with only the operations
needed by current callers: text completion and structured JSON completion,
with injectable transport dependencies. It returns normalized text or a
controlled failure; raw provider payloads do not escape the adapter.

The client owns provider/key/model/plan resolution, OpenAI Chat Completions,
Google Gemini, OpenCode Go/Zen Responses requests, response extraction, and
mapping the existing JSON schema into each provider's structured-output
mechanism.

Migrate every X Content Network text-generation call to this client, including
the DB package and operational scripts. The web server and DB package already
depend on core, so this removes duplicated fetch and response parsing without
introducing a new package boundary.

Source-page HTTP fetching, domain validation, JSON domain parsing, and
embeddings remain outside the client.

## StartupScores implementation

Add one small provider client next to `ai-celebrations.ts` and make
`executeCachedAiGeneration` call it. It owns provider resolution,
OpenCode/OpenAI/Google transport, model selection, and response extraction.
Cache, validators, prompts, null-on-unavailable behavior, and redacted error
handling remain unchanged.

Add the canonical optional keys to the StartupScores environment-key map and
deployment examples. AI remains optional; no new required production variable
is introduced.

## Vibe-Gate scope

No Vibe-Gate runtime or provider implementation changes are needed. Its
existing Google/OpenAI/OpenCode providers remain untouched.

## Test-first and verification plan

Write failing tests first for provider resolution, explicit key isolation,
legacy fallback, model/plan selection, OpenAI/Google/OpenCode request and
response normalization, and structured JSON mapping. Add call-site coverage
for core/web/DB X Content Network flows and deterministic StartupScores tests
with injected transports; no unit test may call a live endpoint because a
developer key exists.

Run the existing test suites and typechecks for all three repositories. Finish
with a source scan proving that no production text-AI call site outside the
two adapters reads provider keys, builds provider URLs, or parses provider
response shapes.

## Rollout and acceptance

```text
CRITIC_PROVIDER=google
CRITIC_MODEL=gemini-3.8-flash
GOOGLE_GENERATIVE_AI_API_KEY=<the same secret value used by Vibe-Gate>
```

The same secret value must be provisioned into each process that needs it; no
credential is copied into source control and no runtime dependency on
Vibe-Gate is introduced.

Success means Google text generation/evaluation/research/architect flows work
in X Content Network, celebration/mission generation works in StartupScores,
existing OpenCode Go/Zen and OpenAI flows continue through the adapters, no
second Google key exists, and embeddings remain explicitly unchanged.
