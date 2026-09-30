/** Platform-specific executable lookup and process invocation for local CLIs. */

import { extname } from 'node:path'
import { accessSync, constants as fsConstants } from 'node:fs'
import * as path from 'node:path'

const WINDOWS_EXECUTABLE_EXTENSIONS = new Set(['.COM', '.EXE', '.BAT', '.CMD'])
const WINDOWS_BATCH_EXTENSIONS = new Set(['.BAT', '.CMD'])

export function executableExtensions(
  command: string,
  isWindows: boolean,
  pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD'
): string[] {
  const commandExtension = isWindows ? path.win32.extname(command) : extname(command)
  if (!isWindows || commandExtension) return ['']
  return pathExt.split(';').filter(extension => WINDOWS_EXECUTABLE_EXTENSIONS.has(extension.toUpperCase()))
}

export interface ExecutableLookupOptions {
  platform?: string
  pathValue?: string
  pathExt?: string
  canAccess?: (candidate: string, isWindows: boolean) => boolean
}

export function executableCandidates(command: string, options: ExecutableLookupOptions = {}): string[] {
  const platform = options.platform ?? process.platform
  const isWindows = platform === 'win32'
  const pathApi = isWindows ? path.win32 : path
  const hasDirectory = pathApi.isAbsolute(command) || command.includes('/') || command.includes('\\')
  const pathValue = options.pathValue ?? process.env.PATH ?? process.env.Path ?? ''
  const pathDelimiter = isWindows ? ';' : path.delimiter
  const bases = hasDirectory
    ? [pathApi.resolve(command)]
    : pathValue
        .split(pathDelimiter)
        .filter(Boolean)
        .map(directory => pathApi.join(directory, command))
  const extensions = executableExtensions(command, isWindows, options.pathExt)

  return bases.flatMap(base => extensions.map(extension => (extension ? `${base}${extension}` : base)))
}

export function findExecutable(command: string, options: ExecutableLookupOptions = {}): string | undefined {
  const platform = options.platform ?? process.platform
  const isWindows = platform === 'win32'
  const canAccess =
    options.canAccess ??
    ((candidate: string, windows: boolean) => {
      try {
        accessSync(candidate, windows ? fsConstants.F_OK : fsConstants.X_OK)
        return true
      } catch {
        return false
      }
    })
  for (const candidate of executableCandidates(command, options)) {
    if (canAccess(candidate, isWindows)) return candidate
  }
  return undefined
}

export interface CliSpawnTarget {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

function quoteCmdToken(value: string): string {
  // Percent expansion occurs even inside quotes. Reject these characters instead of
  // allowing configuration values to be interpreted as cmd.exe syntax.
  if (/[%"\0\r\n]/.test(value)) {
    throw new Error('Windows CLI arguments cannot contain percent signs, quotes, or line breaks.')
  }
  return `"${value}"`
}

export function buildCliSpawnTarget(
  command: string,
  args: string[],
  platform: string = process.platform,
  comspec = process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe'
): CliSpawnTarget {
  const extension = extname(command).toUpperCase()
  if (platform !== 'win32' || !WINDOWS_BATCH_EXTENSIONS.has(extension)) return { command, args }

  const invocation = [command, ...args].map(quoteCmdToken).join(' ')
  return {
    command: comspec,
    // /s strips only the outer quote pair, leaving the quoted script path and args.
    args: ['/d', '/s', '/v:off', '/c', `"${invocation}"`],
    windowsVerbatimArguments: true
  }
}
