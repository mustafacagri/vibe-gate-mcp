import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import sonarjs from 'eslint-plugin-sonarjs'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.yarn/**',
      '.pnp.*',
      '.vibe-test/**',
      '.vibe-*-test/**',
      'scripts/**',
      'vitest.config.ts',
      'tsdown.config.ts'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { project: './tsconfig.json' },
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'error',
      'sonarjs/cognitive-complexity': ['error', 15],
      // SonarJS 4.2's type-aware rules currently report false positives for
      // ordinary string/array narrowing in this strict TypeScript codebase.
      'sonarjs/null-dereference': 'off',
      'sonarjs/function-return-type': 'off',
      'sonarjs/argument-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          args: 'after-used',
          ignoreRestSiblings: true
        }
      ]
    }
  }
]
