import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendToDebt } from '@/debt/append'

const testDir = join(process.cwd(), '.vibe-debt-test')

describe('appendToDebt', () => {
  it('appends entry and creates DEBT.md with Records section', async () => {
    await mkdir(testDir, { recursive: true })
    try {
      const debtPath = join(testDir, 'DEBT.md')
      const header = `# Technical Debt

## Records

_(No entries yet)_
`
      await import('node:fs/promises').then(fs => fs.writeFile(debtPath, header, 'utf-8'))

      await appendToDebt(testDir, '2.3.1', 'Test subject', 'Test rationale')

      const content = await readFile(debtPath, 'utf-8')
      expect(content).toMatch(/### \d{4}-\d{2}-\d{2} - /)
      expect(content).toContain('Test subject')
      expect(content).toContain('**Phase:** 2.3.1')
      expect(content).toContain('**Rationale:** Test rationale')
      expect(content).not.toContain('_(No entries yet)_')
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  it('skips duplicate when same subject exists', async () => {
    await mkdir(testDir, { recursive: true })
    try {
      const debtPath = join(testDir, 'DEBT.md')
      const existing = `# Technical Debt

## Records

### 2026-02-26 - Duplicate Subject

- **Phase:** 1.1.1
- **Rationale:** First
- **Status:** Open
`
      await import('node:fs/promises').then(fs => fs.writeFile(debtPath, existing, 'utf-8'))

      await appendToDebt(testDir, '2.3.1', 'Duplicate Subject', 'Second rationale')

      const content = await readFile(debtPath, 'utf-8')
      const count = (content.match(/Duplicate Subject/g) ?? []).length
      expect(count).toBe(1)
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })
})
