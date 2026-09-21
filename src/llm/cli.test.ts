import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLI_DEFAULT_MODEL, PROVIDERS } from '@/constants'
import { configSchema } from '@/config'
import {
  createClaudeCodeProvider,
  createCodexCliProvider,
  createCursorAgentProvider,
  createOpenCodeCliProvider
} from '@/llm/cli'
import { createLLMProvider } from '@/llm'

interface CliCapture {
  args: string[]
  stdin: string
  cwd: string
  env: Record<string, string | null>
  cursorPolicy?: { permissions?: { deny?: string[] } }
  cursorMcp?: unknown
  opencodeConfig?: { permission?: Record<string, string>; mcp?: unknown; tools?: Record<string, boolean> }
}

describe('local CLI providers', () => {
  const originalEnv = process.env
  let testRoot: string
  let fakeCommand: string
  let capturePath: string

  beforeEach(async () => {
    process.env = { ...originalEnv }
    testRoot = await mkdtemp(join(tmpdir(), 'vibe-gate-cli-test-'))
    fakeCommand = join(testRoot, 'fake-cli')
    capturePath = join(testRoot, 'capture.json')
    process.env.VIBE_CLI_TEST_CAPTURE = capturePath
    process.env.VIBE_CLI_TEST_DELETE_CAPTURE = join(testRoot, 'delete-capture.json')
    process.env.OPENAI_API_KEY = 'should-not-be-forwarded'
    process.env.ANTHROPIC_API_KEY = 'should-not-be-forwarded'
    process.env.ANTHROPIC_AUTH_TOKEN = 'should-not-be-forwarded'
    process.env.CURSOR_API_KEY = 'should-not-be-forwarded'
    process.env.GEMINI_API_KEY = 'should-not-be-forwarded'
    process.env.OPENCODE_API_KEY = 'should-not-be-forwarded'
    process.env.OPENROUTER_API_KEY = 'should-not-be-forwarded'

    await writeFile(
      fakeCommand,
      `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const captured = {
  args,
  stdin: fs.readFileSync(0, 'utf8'),
  cwd: process.cwd(),
  env: Object.fromEntries(['HOME', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'OPENCODE_CONFIG', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CURSOR_API_KEY', 'GEMINI_API_KEY', 'OPENCODE_API_KEY', 'OPENROUTER_API_KEY'].map(key => [key, process.env[key] ?? null]))
}
if (fs.existsSync('.cursor/cli.json')) captured.cursorPolicy = JSON.parse(fs.readFileSync('.cursor/cli.json', 'utf8'))
if (fs.existsSync('.cursor/mcp.json')) captured.cursorMcp = JSON.parse(fs.readFileSync('.cursor/mcp.json', 'utf8'))
if (fs.existsSync('opencode.json')) captured.opencodeConfig = JSON.parse(fs.readFileSync('opencode.json', 'utf8'))
const capturePath = args[0] === 'session' ? process.env.VIBE_CLI_TEST_DELETE_CAPTURE : process.env.VIBE_CLI_TEST_CAPTURE
fs.writeFileSync(capturePath, JSON.stringify(captured))
if (args[0] === 'exec') {
  if (process.env.VIBE_CLI_TEST_CODEX_JSON) {
    process.stdout.write(process.env.VIBE_CLI_TEST_CODEX_JSON + '\\n')
  } else {
    process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Codex review' } }) + '\\n')
  }
  } else if (args[0] === 'run') {
  if (process.env.VIBE_CLI_TEST_OPENCODE_JSON) {
    process.stdout.write(process.env.VIBE_CLI_TEST_OPENCODE_JSON + '\\n')
  } else if (process.env.VIBE_CLI_TEST_FAIL_OPENCODE === '1') {
    process.stdout.write(JSON.stringify({ type: 'error', sessionID: 'fake-open-code-session', error: { data: { message: 'Insufficient balance. Manage your billing here: https://example.test/private' } } }) + '\\n')
    process.exitCode = 1
  } else {
    process.stdout.write(JSON.stringify({ type: 'text', sessionID: 'fake-open-code-session', part: { type: 'text', text: 'OpenCode review part one' } }) + '\\n')
    process.stdout.write(JSON.stringify({ type: 'text', sessionID: 'fake-open-code-session', part: { type: 'text', text: 'OpenCode review part two' } }) + '\\n')
  }
} else if (args[0] === 'session') {
  if (process.env.VIBE_CLI_TEST_FAIL_OPENCODE_DELETE === '1') {
    process.stderr.write('session deletion failed\\n')
    process.exitCode = 1
  } else {
    process.stdout.write('session deleted\\n')
  }
} else if (process.env.VIBE_CLI_TEST_CLI_JSON_RESULT) {
  process.stdout.write(process.env.VIBE_CLI_TEST_CLI_JSON_RESULT)
} else if (process.env.VIBE_CLI_TEST_FAIL_CLAUDE === '1') {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }))
  process.exitCode = 1
} else {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: args.includes('--safe-mode') ? 'Claude review' : 'Cursor review' }))
}
`,
      { mode: 0o700 }
    )
    await chmod(fakeCommand, 0o700)
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(testRoot, { recursive: true, force: true })
  })

  async function readCapture(): Promise<CliCapture> {
    return JSON.parse(await readFile(capturePath, 'utf8')) as CliCapture
  }

  const messages = [
    { role: 'system' as const, content: 'Return findings.' },
    { role: 'user' as const, content: 'Review this sample diff.' }
  ]

  it.each([PROVIDERS.CODEX_CLI, PROVIDERS.CLAUDE_CODE, PROVIDERS.CURSOR_AGENT])(
    'constructs %s without a separate API key',
    criticProvider => {
      const config = configSchema.parse({ criticProvider })
      expect(createLLMProvider(config)).not.toBeNull()
    }
  )

  it('constructs OpenCode CLI from saved CLI auth when an explicit model is selected', () => {
    const config = configSchema.parse({ criticProvider: PROVIDERS.OPENCODE_CLI, criticModel: 'opencode-go/minimax-m3' })
    expect(createLLMProvider(config)).not.toBeNull()
  })

  it('uses Codex stdin, ephemeral mode, and a read-only sandbox while reusing CLI login', async () => {
    const response = await createCodexCliProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)
    const captured = await readCapture()
    const args = captured.args as string[]

    expect(response.content).toBe('Codex review')
    expect(args).toEqual(
      expect.arrayContaining(['exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--json', '-'])
    )
    expect(captured.stdin).toContain('Review this sample diff.')
    expect(captured.cwd).toContain('vibe-gate-codex-cli-')
    expect(captured.env).toMatchObject({
      HOME: originalEnv.HOME ?? null,
      CODEX_HOME: originalEnv.CODEX_HOME ?? null,
      XDG_CONFIG_HOME: originalEnv.XDG_CONFIG_HOME ?? null,
      XDG_DATA_HOME: originalEnv.XDG_DATA_HOME ?? null,
      OPENAI_API_KEY: null,
      ANTHROPIC_API_KEY: null,
      ANTHROPIC_AUTH_TOKEN: null,
      CURSOR_API_KEY: null
    })
  })

  it.each(['null', '42', '[]'])('rejects non-object Codex JSON events (%s)', async output => {
    process.env.VIBE_CLI_TEST_CODEX_JSON = output

    await expect(createCodexCliProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)).rejects.toThrow(
      /Codex CLI returned an invalid JSONL event/
    )
  })

  it('rejects mixed valid and malformed Codex JSONL instead of accepting a partial response', async () => {
    process.env.VIBE_CLI_TEST_CODEX_JSON =
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Partial review' } }) + '\nnot-json'

    await expect(createCodexCliProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)).rejects.toThrow(
      /Codex CLI returned invalid JSONL output/
    )
  })

  it('disables Claude Code tools and session persistence without requiring the newer restricted flag', async () => {
    const response = await createClaudeCodeProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)
    const captured = await readCapture()
    const args = captured.args as string[]

    expect(response.content).toBe('Claude review')
    expect(args).toEqual(
      expect.arrayContaining([
        '--print',
        '--permission-mode',
        'plan',
        '--safe-mode',
        '--tools',
        '',
        '--disallowedTools',
        '*',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--output-format',
        'json'
      ])
    )
    expect(args).not.toContain('--restricted')
    expect(captured.stdin).toContain('Review this sample diff.')
    expect(captured.env.ANTHROPIC_API_KEY).toBeNull()
    expect(captured.env.ANTHROPIC_AUTH_TOKEN).toBe('should-not-be-forwarded')
  })

  it('surfaces Claude Code authentication errors returned in JSON output', async () => {
    process.env.VIBE_CLI_TEST_FAIL_CLAUDE = '1'

    await expect(createClaudeCodeProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)).rejects.toThrow(
      /Claude Code CLI reported an unsuccessful response\. Not logged in/
    )
  })

  it.each(['null', '42', '[]'])('rejects non-object Claude Code JSON results (%s)', async output => {
    process.env.VIBE_CLI_TEST_CLI_JSON_RESULT = output

    await expect(createClaudeCodeProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)).rejects.toThrow(
      /Claude Code CLI returned invalid JSON output/
    )
  })

  it('trusts its temporary workspace and runs Cursor Agent in ask mode with no API key', async () => {
    const response = await createCursorAgentProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)
    const captured = await readCapture()
    const args = captured.args as string[]

    expect(response.content).toBe('Cursor review')
    expect(args).toEqual(expect.arrayContaining(['--trust', '--print', '--mode', 'ask', '--output-format', 'json']))
    expect(args).not.toContain('--force')
    expect(args.at(-1)).toBe('json')
    expect(captured.stdin).toContain('Review this sample diff.')
    expect(captured.cursorPolicy?.permissions?.deny).toEqual(
      expect.arrayContaining(['Shell(*)', 'Read(**)', 'Read(/**)', 'Write(**)', 'Write(/**)'])
    )
    expect(Object.keys(captured.cursorPolicy ?? {})).toEqual(['permissions'])
    expect(captured.cursorMcp).toEqual({ mcpServers: {} })
    expect(captured.env.ANTHROPIC_AUTH_TOKEN).toBeNull()
    expect(captured.env.CURSOR_API_KEY).toBeNull()
  })

  it.each(['null', '42', '[]'])('rejects non-object Cursor Agent JSON results (%s)', async output => {
    process.env.VIBE_CLI_TEST_CLI_JSON_RESULT = output

    await expect(createCursorAgentProvider(fakeCommand, CLI_DEFAULT_MODEL, 5_000).complete(messages)).rejects.toThrow(
      /Cursor Agent CLI returned invalid JSON output/
    )
  })

  it('joins OpenCode text events in order, isolates config, denies tools, and removes its temporary session', async () => {
    const response = await createOpenCodeCliProvider(fakeCommand, 'opencode-go/minimax-m3', 5_000).complete(messages)
    const captured = await readCapture()
    const deleteCapture = JSON.parse(await readFile(process.env.VIBE_CLI_TEST_DELETE_CAPTURE!, 'utf8')) as CliCapture
    const args = captured.args as string[]

    expect(response.content).toBe('OpenCode review part one\nOpenCode review part two')
    expect(args).toEqual(
      expect.arrayContaining([
        'run',
        '--pure',
        '--format',
        'json',
        '--agent',
        'vibe-gate-critic',
        '--model',
        'opencode-go/minimax-m3'
      ])
    )
    expect(captured.stdin).toContain('Review this sample diff.')
    expect(captured.opencodeConfig?.mcp).toEqual({})
    expect(captured.opencodeConfig?.permission).toEqual({ '*': 'deny' })
    expect(captured.opencodeConfig?.tools?.bash).toBe(false)
    expect(captured.env.XDG_CONFIG_HOME).toContain('vibe-gate-opencode-cli-')
    expect(captured.env.OPENCODE_CONFIG).toContain('/opencode.json')
    expect(captured.env.HOME).toBe(originalEnv.HOME ?? null)
    expect(captured.env.XDG_DATA_HOME).toBe(originalEnv.XDG_DATA_HOME ?? null)
    expect(captured.env.OPENAI_API_KEY).toBeNull()
    expect(captured.env.OPENCODE_API_KEY).toBeNull()
    expect(captured.env.OPENROUTER_API_KEY).toBeNull()
    expect(captured.env.ANTHROPIC_AUTH_TOKEN).toBeNull()
    expect(deleteCapture.args).toEqual([
      'session',
      'delete',
      'fake-open-code-session',
      '--pure',
      '--log-level',
      'ERROR'
    ])
  })

  it.each(['null', '42', '[]'])('rejects non-object OpenCode JSON events (%s)', async output => {
    process.env.VIBE_CLI_TEST_OPENCODE_JSON = output

    await expect(
      createOpenCodeCliProvider(fakeCommand, 'opencode-go/minimax-m3', 5_000).complete(messages)
    ).rejects.toThrow(/OpenCode CLI returned invalid JSONL output/)
  })

  it('rejects mixed valid and malformed OpenCode JSONL and still removes its session', async () => {
    process.env.VIBE_CLI_TEST_OPENCODE_JSON =
      JSON.stringify({
        type: 'text',
        sessionID: 'fake-open-code-session',
        part: { type: 'text', text: 'Partial review' }
      }) + '\nnot-json'

    await expect(
      createOpenCodeCliProvider(fakeCommand, 'opencode-go/minimax-m3', 5_000).complete(messages)
    ).rejects.toThrow(/OpenCode CLI returned invalid JSONL output/)

    const deleteCapture = JSON.parse(await readFile(process.env.VIBE_CLI_TEST_DELETE_CAPTURE!, 'utf8')) as CliCapture
    expect(deleteCapture.args).toContain('fake-open-code-session')
  })

  it('removes the OpenCode session after a provider error', async () => {
    process.env.VIBE_CLI_TEST_FAIL_OPENCODE = '1'

    await expect(
      createOpenCodeCliProvider(fakeCommand, 'opencode-go/minimax-m3', 5_000).complete(messages)
    ).rejects.toThrow(/OpenCode CLI exited with code 1\. Insufficient balance\./)

    const deleteCapture = JSON.parse(await readFile(process.env.VIBE_CLI_TEST_DELETE_CAPTURE!, 'utf8')) as CliCapture
    expect(deleteCapture.args).toContain('fake-open-code-session')
  })

  it('preserves both the provider failure and session cleanup failure', async () => {
    process.env.VIBE_CLI_TEST_FAIL_OPENCODE = '1'
    process.env.VIBE_CLI_TEST_FAIL_OPENCODE_DELETE = '1'

    await expect(
      createOpenCodeCliProvider(fakeCommand, 'opencode-go/minimax-m3', 5_000).complete(messages)
    ).rejects.toThrow(/Insufficient balance\..*could not remove its temporary session\..*session deletion failed/s)
  })
})
