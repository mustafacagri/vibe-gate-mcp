import { describe, expect, it } from 'vitest'
import { validateSourceCorpus } from '@/utils/source-corpus'

const block = 'FILE: same.ts\nCONTENT:\nexport const tail = 1\n'

describe('complete source slot guard', () => {
  it.each([1, 10])('accepts %i actual blocks', count => {
    expect(validateSourceCorpus(block.repeat(count))).toBe(count)
  })
  it.each([11, 21])('rejects %i duplicate blocks without path or content deduplication', count => {
    expect(() => validateSourceCorpus(block.repeat(count))).toThrow('full content slots')
  })
  it.each(['README.md', 'package.json', 'config.jsonc', '.env.local'])('rejects non-source endpoint %s', path => {
    expect(() => validateSourceCorpus(`FILE: ${path}\nCONTENT:\nconst snippet = 1`)).toThrow('Non-source endpoint')
  })
  it.each([
    '--- a/a.ts\n+++ b/a.ts\n@@ x',
    'FILE: a.ts\nmissing marker',
    'summary',
    'summary\nFILE: a.ts\nCONTENT:\nexport {}',
    'FILE: a.ts\nsummary before marker\nCONTENT:\nexport const value = 1\n',
    'FILE: a.ts\n\nCONTENT:\nexport {}',
    'FILE: a.ts\n CONTENT:\nexport {}',
    'FILE: a.ts\nCONTENT: export {}',
    'FILE: a.ts\nCONTENT:',
    'FILE: a.ts\nCONTENT:\n',
    'FILE: a.ts\nCONTENT:\n \t\r\n',
    'FILE: \nCONTENT:\nexport {}',
    'FILE:a.ts\nCONTENT:\nexport {}',
    `${block}FILE: empty.ts\nCONTENT:\n`
  ])('rejects malformed payload %s', corpus => {
    expect(() => validateSourceCorpus(corpus)).toThrow()
  })

  it.each([
    '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n',
    'diff --git a/a.ts b/a.ts\nindex 123..456 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new',
    '@@ -1,2 +1,2 @@\n-old\n+new',
    '[FULL FILE CONTENT]',
    'export {}\n[Context limited to 100 lines.]\n'
  ])('rejects recognizable partial source body %s', body => {
    expect(() => validateSourceCorpus(`FILE: a.ts\nCONTENT:\n${body}`)).toThrow('full source content')
  })

  it.each([
    ['a.ts', 'export const value = 1\n'],
    ['a.vue', '<script setup lang="ts">const value = 1</script>\n<template>{{ value }}</template>'],
    ['a.sql', 'SELECT value FROM items;'],
    ['a.prisma', 'model Item {\n  id Int @id\n}'],
    ['a.html', '<div>Hello</div>'],
    ['a.css', '.item { display: block; }'],
    ['a.sh', '#!/bin/sh\nprintf "hello"'],
    ['Dockerfile', 'FROM node:24\nCMD ["node", "app.js"]'],
    ['broken.ts', 'export const = {'],
    ['quotes.ts', 'const text = "FILE: a.ts\\nCONTENT:\\n--- a/a.ts\\n+++ b/a.ts";'],
    ['template.ts', 'const patch = `\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n`;'],
    ['comment.ts', '/*\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n*/\nexport {};'],
    ['comment.ts', '// --- a/a.ts\n// +++ b/a.ts\nexport {};'],
    ['crlf.ts', 'export const value = 1\r\n// tail\r\n']
  ])('accepts source body without inferring language syntax: %s', (path, body) => {
    expect(validateSourceCorpus(`FILE: ${path}\nCONTENT:\n${body}`)).toBe(1)
  })

  it('accepts CRLF protocol lines and mixed source line endings', () => {
    expect(validateSourceCorpus('FILE: a.ts\r\nCONTENT:\r\nexport {}\n')).toBe(1)
  })
})
