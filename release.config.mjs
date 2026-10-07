/**
 * Version and changelog only. npm publish stays in the trusted-publisher workflow.
 * server.json (what the MCP Registry publishes from) gets the release version here, so it is part of the release commit.
 */
const releaseConfig = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: false }],
    ['@semantic-release/exec', { prepareCmd: 'node scripts/sync-server-json.mjs ${nextRelease.version}' }],
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md', 'server.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]'
      }
    ]
  ]
}

export default releaseConfig
