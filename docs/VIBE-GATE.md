# Vibe-Gate: Purpose and Features

## Purpose

Vibe-Gate is a **Model Context Protocol (MCP)** server designed for developers who write code with AI-assisted IDEs (Cursor, Windsurf, Antigravity, etc.) using a "vibe coding" workflow — rapid iteration with minimal friction.

**Core problem:** When coding quickly with AI, security, architectural consistency, and long-term maintainability often get deprioritized. Reviewing entire codebases with another AI is expensive and hits context limits.

**Solution:** Vibe-Gate acts as an **Adversarial Quality Gate**. The IDE AI (Implementer) reports what it changed; a separate Critic AI reviews only the changed artifacts and side effects. The two models debate; the human (Judge) steps in only when they deadlock.

## Features

### 1. Three-Actor Model & Multi-Model Support

To prevent "echo chambers," the Critic should ideally be a different LLM than the Implementer. Vibe-Gate is LLM-agnostic, allowing you to configure the Critic with your preferred flagship model (e.g., Gemini 3.1 Pro, Claude 4.6 Sonnet, GPT-5.4) via standard API keys.

| Role            | Actor            | Responsibility                                                                |
| --------------- | ---------------- | ----------------------------------------------------------------------------- |
| **Implementer** | IDE AI           | Writes code, triggers the `submit_phase_review` MCP tool at phase completion. |
| **Critic**      | Vibe-Gate MCP AI | Reviews reports against rules, challenges violations.                         |
| **Judge**       | Human            | Resolves deadlocks; decisions feed project-specific learning.                 |

### 2. Roadmap Tracking & Phase Execution

Vibe-Gate tracks project progress via a local `.vibe/status.json` or `ROADMAP.md` file. It monitors the debate rounds (e.g., `count: x`) for each sub-phase. A phase is only marked as complete after a successful resolution between the AIs or a direct Judge override.

### 3. Rule System

- **Hard Rules:** Non-negotiable. Security (injection, secrets), core architecture, data integrity. No exceptions.
- **Soft Rules:** Deferrable. Style, refactoring, performance. If the Implementer objects, items are logged to `DEBT.md` instead of blocking.

### 4. Conflict Loop (Max 3 Rounds)

1. **Round 1:** Implementer reports → Critic responds with risks and gaps.
2. **Rounds 2–3:** Implementer fixes or argues (e.g., "Soft rule, log to debt").
3. **Deadlock:** If no agreement after 3 rounds → Conflict Alert → Judge decides.

### 5. Smart Context (Cost Control)

Vibe-Gate does not send full codebases to the Critic. It sends targeted payloads:

- **Project Blueprint:** Framework conventions (e.g., Nuxt 3 structures, Node.js workers, WebSocket handling).
- **Semantic Diff:** Logical changes and structural side effects.
- **Dependency List:** New packages (analyzed for bundle bloat and known CVEs).
- **Critical Snippets:** Only high-risk areas like Auth, DB schemas, or API endpoints.

### 6. Personas

The Critic can run in different modes (configurable):

- **Security First:** Strict on security, token leaks, and compliance.
- **Performance Freak:** Focus on latency, memory leaks, and bundle size.
- **Clean Code Monk:** Focus on readability, DRY principles, and maintainability.

### 7. Project-Local Learning

Judge decisions are written to a `preferences.log` file in the workspace. The Critic reads this on subsequent runs to align with the Judge’s specific coding style. Learning is strictly per-project (no automatic cross-project sharing).

---

## Language Policy (npm Publish)

- **No duplicate content** — single source, no TR/EN split.
- **Published files:** English only (`README.md`, `package.json`, `rules.json`, `docs/`, `.env.example`).
- **All project files:** English only. No TR/EN split.
- **Vibe-Gate output in user projects:** Always English.
