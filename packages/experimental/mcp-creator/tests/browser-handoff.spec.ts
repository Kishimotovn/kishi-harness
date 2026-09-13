import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createBrowserHandoff } from '../src/browser-handoff.ts'

describe('creator browser handoff', () => {
  it('keeps the token in a private file and removes that file on cleanup', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'creator-handoff-test-'))
    onTestFinished(async () => { await rm(workspace, { recursive: true, force: true }) })
    const target = 'http://127.0.0.1:55945/?token=example-only-token'
    const handoff = await createBrowserHandoff(target, workspace)
    onTestFinished(handoff.close)
    const file = fileURLToPath(handoff.url)
    expect(dirname(dirname(file))).toBe(join(workspace, '.cache'))
    expect(handoff.url).not.toContain('example-only-token')
    expect(await readFile(file, 'utf8')).toContain(`location.replace(${JSON.stringify(target)})`)
    if (process.platform !== 'win32') {
      expect((await stat(dirname(file))).mode & 0o777).toBe(0o700)
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
    await handoff.close()
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a cache symlink instead of writing the launch credential outside the workspace', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'creator-handoff-link-test-'))
    onTestFinished(async () => { await rm(workspace, { recursive: true, force: true }) })
    await symlink(workspace, join(workspace, '.cache'), 'junction')
    await expect(createBrowserHandoff('http://127.0.0.1:55945/?token=example-only-token', workspace))
      .rejects.toThrow('creator browser cache must be a real directory')
  })
})
