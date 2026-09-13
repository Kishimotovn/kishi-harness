/** Private browser navigation file that keeps the DSH launch token out of tool results. */
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Create an owner-only file that enters DSH through its normal token exchange.
 * @param authenticatedUrl - launch URL supplied by the running DSH Connection service.
 * @param workspaceDirectory - trusted workspace containing the ignored browser-handoff cache.
 * @returns the non-secret file URL and cleanup for its private directory.
 */
export async function createBrowserHandoff(authenticatedUrl: string, workspaceDirectory: string): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const cache = join(workspaceDirectory, '.cache')
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const cacheStat = await lstat(cache)
  if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) throw new Error('creator browser cache must be a real directory')
  const directory = await mkdtemp(join(cache, 'dsh-creator-browser-'))
  const file = join(directory, 'sign-in.html')
  const target = JSON.stringify(authenticatedUrl).replaceAll('<', '\\u003c')
  try {
    await writeFile(file,
      '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">'
      + `<title>DSH browser sign-in</title><script>location.replace(${target})</script>\n`,
      { flag: 'wx', mode: 0o600 })
  } catch (error: unknown) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  return {
    url: pathToFileURL(file).href,
    close: () => rm(directory, { recursive: true, force: true }),
  }
}
