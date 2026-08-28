import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  codeSplitting: false,
  sourcemap: false,
  clean: true,
  outputOptions: {
    banner: '#!/usr/bin/env node'
  },
  deps: {
    neverBundle: []
  }
})
