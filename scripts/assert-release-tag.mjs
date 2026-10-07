/**
 * semantic-release chooses the next version from the latest v* tag, not package.json.
 * Fail when that tag is missing or behind the version already published from this repo.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const TAG_PREFIX = 'v'
const MANIFEST_PATH = 'package.json'

const parseSemver = value => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) {
    throw new Error(`Invalid semver: ${value}`)
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const compareSemver = (left, right) => {
  const a = parseSemver(left)
  const b = parseSemver(right)

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) {
      continue
    }

    if (a[index] > b[index]) {
      return 1
    }

    return -1
  }

  return 0
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
const packageVersion = manifest.version
parseSemver(packageVersion)

const output = execFileSync('git', ['tag', '-l', `${TAG_PREFIX}[0-9]*`, '--sort=-v:refname'], {
  encoding: 'utf8'
})
const latestTag = output.split('\n').find(line => line.startsWith(TAG_PREFIX))

if (!latestTag) {
  console.error(`No ${TAG_PREFIX}* release tag. Create and push ${TAG_PREFIX}${packageVersion} before publishing.`)
  process.exit(1)
}

const tagVersion = latestTag.slice(TAG_PREFIX.length)
const comparison = compareSemver(tagVersion, packageVersion)

if (comparison < 0) {
  console.error(
    `Latest tag ${latestTag} is behind package.json ${packageVersion}. Push ${TAG_PREFIX}${packageVersion} on the current release commit before this workflow runs.`
  )
  process.exit(1)
}

console.log(`Release tag ${latestTag} is at or ahead of package.json ${packageVersion}.`)
