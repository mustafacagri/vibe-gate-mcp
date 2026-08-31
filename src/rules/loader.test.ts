import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { loadRules, formatRulesForPrompt } from './loader.js'

describe('loadRules', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibe-rules-test-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('loads valid rules.json successfully', async () => {
    const validRules = {
      hardRules: [
        {
          id: 'SEC-001',
          description: 'No hardcoded secrets',
          category: 'security'
        }
      ],
      softRules: [
        {
          id: 'STYLE-001',
          description: 'Follow camelCase naming conventions',
          category: 'style'
        }
      ]
    }
    await writeFile(join(testDir, 'rules.json'), JSON.stringify(validRules), 'utf-8')

    const rules = await loadRules(testDir)
    expect(rules).toEqual(validRules)
  })

  it('returns DEFAULT_RULES when file does not exist', async () => {
    const rules = await loadRules(testDir)
    expect(rules).toEqual({ hardRules: [], softRules: [] })
  })

  it('returns DEFAULT_RULES when rules.json contains invalid JSON', async () => {
    await writeFile(join(testDir, 'rules.json'), '{ invalid json payload... ', 'utf-8')

    const rules = await loadRules(testDir)
    expect(rules).toEqual({ hardRules: [], softRules: [] })
  })

  it('returns DEFAULT_RULES when rules.json fails schema validation', async () => {
    const invalidSchemaRules = {
      hardRules: [
        {
          id: 'invalid-id-format',
          description: 'Missing correct id regex format',
          category: 'security'
        }
      ],
      softRules: []
    }
    await writeFile(join(testDir, 'rules.json'), JSON.stringify(invalidSchemaRules), 'utf-8')

    const rules = await loadRules(testDir)
    expect(rules).toEqual({ hardRules: [], softRules: [] })
  })

  it('returns DEFAULT_RULES when file size exceeds maximum limit', async () => {
    // Create payload larger than 1MB
    const largeContent = ' ' + 'a'.repeat(1024 * 1024 + 100)
    await writeFile(join(testDir, 'rules.json'), largeContent, 'utf-8')

    const rules = await loadRules(testDir)
    expect(rules).toEqual({ hardRules: [], softRules: [] })
  })
})

describe('formatRulesForPrompt', () => {
  it('formats rules correctly when rules exist', () => {
    const rulesConfig = {
      hardRules: [{ id: 'SEC-001', description: 'No hardcoded secrets', category: 'security' }],
      softRules: [{ id: 'STYLE-001', description: 'Follow style guidelines', category: 'style' }]
    }
    const formatted = formatRulesForPrompt(rulesConfig)
    expect(formatted).toContain('[SEC-001] No hardcoded secrets')
    expect(formatted).toContain('[STYLE-001] Follow style guidelines')
  })

  it('returns empty string when rules are empty', () => {
    const formatted = formatRulesForPrompt({ hardRules: [], softRules: [] })
    expect(formatted).toBe('')
  })
})
