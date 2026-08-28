import { describe, expect, it } from 'vitest'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import {
  SUBMIT_PHASE_REVIEW_SCHEMA,
  submitPhaseReviewFieldsSchema,
  submitPhaseReviewInputSchema
} from '@/tools/submit-phase-review'

describe('submitPhaseReviewInputSchema', () => {
  it('accepts files[] only (preferred)', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r',
      files: ['src/a.ts', 'src/b.ts']
    })
    expect(r.success).toBe(true)
  })

  it('accepts inline semanticDiff only', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r',
      semanticDiff: 'FILE: a.ts\nCONTENT:\nx\n'
    })
    expect(r.success).toBe(true)
  })

  it('accepts semanticDiffPath only', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r',
      semanticDiffPath: '.vibe/round1.txt'
    })
    expect(r.success).toBe(true)
  })

  it('rejects files + semanticDiff together', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r',
      files: ['a.ts'],
      semanticDiff: 'FILE: a\nCONTENT:\n'
    })
    expect(r.success).toBe(false)
  })

  it('rejects both semanticDiff and semanticDiffPath', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r',
      semanticDiff: 'FILE: a\nCONTENT:\n',
      semanticDiffPath: '.vibe/x.txt'
    })
    expect(r.success).toBe(false)
  })

  it('rejects neither payload source', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: '1.1.1',
      report: 'r'
    })
    expect(r.success).toBe(false)
  })

  it('accepts updateStatus flag', () => {
    const r = submitPhaseReviewInputSchema.safeParse({
      phaseId: 'mcp-smoke-x',
      report: 'r',
      files: ['a.ts'],
      updateStatus: false
    })
    expect(r.success).toBe(true)
  })
})

describe('SUBMIT_PHASE_REVIEW_SCHEMA ListTools shape', () => {
  it('advertises files and semanticDiffPath (not empty ZodEffects schema)', () => {
    const jsonSchema = toJsonSchemaCompat(SUBMIT_PHASE_REVIEW_SCHEMA.inputSchema)
    const props = (jsonSchema as { properties?: Record<string, unknown> }).properties ?? {}
    const required = (jsonSchema as { required?: string[] }).required ?? []
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining([
        'phaseId',
        'report',
        'files',
        'semanticDiff',
        'semanticDiffPath',
        'updateStatus',
        'dependencies',
        'round',
        'logToDebt'
      ])
    )
    expect(required).toEqual(['phaseId', 'report'])
    expect(submitPhaseReviewFieldsSchema).toBe(SUBMIT_PHASE_REVIEW_SCHEMA.inputSchema)
  })
})
