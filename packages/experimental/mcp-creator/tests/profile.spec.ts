import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { resolveExampleLaunch, LOADER_SMOKE_TEST_TIMEOUT_MS } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it, onTestFinished } from 'vitest'
import { CREATOR_TOOLS } from '../src/command.ts'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

describe('creator MCP Web profile', () => {
  it('discovers creator tools through the real dsh launcher without model requests', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-creator-profile-'))
    onTestFinished(async () => { await rm(home, { recursive: true, force: true }) })
    const invocation = {
      srcBin: join(root, 'apps/cli/src/bin.ts'),
      tsconfigPath: join(root, 'tsconfig.base.json'),
      sourceImport: 'tsx/esm' as const,
      env: { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    }
    const install = resolveExampleLaunch({
      ...invocation,
      configArgs: ['plugin', '--profile', 'web', 'add', `link:${join(root, 'packages/experimental/mcp-creator')}`, '--offline', '--ignore-scripts'],
    })
    execFileSync(install.command, install.args, {
      cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...install.env }, stdio: 'pipe',
    })
    const launch = resolveExampleLaunch({
      ...invocation,
      configArgs: ['--profile', 'web', '--port', '0', '--no-open'],
    })
    const transport = new StdioClientTransport({
      command: launch.command, args: launch.args, cwd: root, stderr: 'pipe',
      env: { ...launch.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    })
    const client = new Client({ name: 'creator-profile-test', version: '1.0.0' })
    onTestFinished(async () => { await client.close(); await transport.close() })
    const protocolErrors: string[] = []
    client.onerror = (error) => { protocolErrors.push(error.message) }
    let startup = ''
    transport.stderr?.on('data', (chunk: Buffer) => { startup = (startup + chunk.toString()).slice(-8000) })
    try { await client.connect(transport) } catch (error: unknown) { throw new Error(`creator startup failed: ${startup}`, { cause: error }) }
    const instructions = client.getInstructions()
    expect(instructions).not.toContain('?token=')
    const signInUrl = instructions?.match(/Browser sign-in file: (file:\S+)\. Open it/)?.[1]
    expect(signInUrl).toBeDefined()
    const signInFile = fileURLToPath(signInUrl!)
    expect((await stat(signInFile)).isFile()).toBe(true)
    const tools = await client.listTools()
    expect(tools.tools.map(tool => tool.name)).toEqual(expect.arrayContaining([...CREATOR_TOOLS]))
    expect(tools.tools).toHaveLength(7)
    const listed = CallToolResultSchema.parse(await client.callTool({ name: 'cordis_inspect_list', arguments: {} }))
    expect(listed.isError).not.toBe(true)
    expect(listed.content.filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('providers')
    expect(protocolErrors).toEqual([])
    await client.close()
    await transport.close()
    await expect.poll(() => existsSync(signInFile)).toBe(false)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
