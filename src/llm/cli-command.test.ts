import { describe, expect, it } from 'vitest'
import { buildCliSpawnTarget, executableCandidates, executableExtensions, findExecutable } from '@/llm/cli-command'

describe('CLI command platform helpers', () => {
  it('includes batch shims from Windows PATHEXT', () => {
    expect(executableExtensions('agent', true, '.COM;.EXE;.BAT;.CMD;.PS1')).toEqual(['.COM', '.EXE', '.BAT', '.CMD'])
  })

  it.each(['agent', 'cursor-agent'])('resolves %s to a Windows .CMD shim from PATH', command => {
    const pathDirectory = 'C:\\Users\\cagri.guven\\AppData\\Local\\cursor-agent'
    const candidates = executableCandidates(command, {
      platform: 'win32',
      pathValue: pathDirectory,
      pathExt: '.COM;.EXE;.BAT;.CMD'
    })

    expect(candidates).toEqual([
      `${pathDirectory}\\${command}.COM`,
      `${pathDirectory}\\${command}.EXE`,
      `${pathDirectory}\\${command}.BAT`,
      `${pathDirectory}\\${command}.CMD`
    ])
    expect(
      findExecutable(command, {
        platform: 'win32',
        pathValue: pathDirectory,
        pathExt: '.COM;.EXE;.BAT;.CMD',
        canAccess: candidate => candidate.endsWith('.CMD')
      })
    ).toBe(`${pathDirectory}\\${command}.CMD`)
  })

  it('does not append extensions to an explicit executable path', () => {
    expect(executableExtensions('C:\\Users\\test\\agent.CMD', true, '.EXE;.CMD')).toEqual([''])
  })

  it('runs Windows batch shims through cmd.exe without enabling shell mode', () => {
    expect(
      buildCliSpawnTarget(
        'C:\\Users\\A User\\AppData\\Local\\cursor-agent\\agent.cmd',
        ['--trust', '--mode', 'ask', '--model', 'gpt-5.4'],
        'win32',
        'C:\\Windows\\System32\\cmd.exe'
      )
    ).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/v:off',
        '/c',
        '""C:\\Users\\A User\\AppData\\Local\\cursor-agent\\agent.cmd" "--trust" "--mode" "ask" "--model" "gpt-5.4""'
      ],
      windowsVerbatimArguments: true
    })
  })

  it('passes native executables directly through spawn', () => {
    expect(buildCliSpawnTarget('C:\\tools\\agent.exe', ['--version'], 'win32', 'cmd.exe')).toEqual({
      command: 'C:\\tools\\agent.exe',
      args: ['--version']
    })
  })

  it('rejects cmd metacharacter expansion before spawning a batch shim', () => {
    expect(() => buildCliSpawnTarget('agent.cmd', ['--model', '%PATH%'], 'win32')).toThrow(
      /cannot contain percent signs/
    )
    expect(() => buildCliSpawnTarget('agent.cmd', ['--model', 'model" & whoami'], 'win32')).toThrow(
      /cannot contain percent signs/
    )
  })
})
