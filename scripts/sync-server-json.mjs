/**
 * Writes a release version into server.json, the file the MCP Registry publishes from.
 * semantic-release calls it (through @semantic-release/exec) before it commits, so server.json is part of the
 * release commit. The result goes through Prettier because `prettier --check .` covers server.json.
 * Usage: node scripts/sync-server-json.mjs <version>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as prettier from 'prettier'

const SERVER_JSON = fileURLToPath(new URL('../server.json', import.meta.url))
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const fail = message => {
  console.error(message)
  process.exit(1)
}

const version = process.argv[2]

if (version === undefined || !SEMVER.test(version)) {
  fail(`Expected a version such as 1.2.3, got ${JSON.stringify(version)}`)
}

const server = JSON.parse(readFileSync(SERVER_JSON, 'utf8'))
const { name } = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
const npmPackages = (server.packages ?? []).filter(entry => entry.registryType === 'npm' && entry.identifier === name)

if (npmPackages.length === 0) {
  fail(`server.json lists no npm package named ${name}`)
}

server.version = version

for (const entry of npmPackages) {
  entry.version = version
}

const options = (await prettier.resolveConfig(SERVER_JSON)) ?? {}

writeFileSync(
  SERVER_JSON,
  await prettier.format(JSON.stringify(server, null, 2), { ...options, filepath: SERVER_JSON })
)
console.log(`server.json -> ${version}`)
