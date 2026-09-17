import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-cordis-host-runner'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createBrowserHandoff } from '@deepseek-ai/dsh-experimental-mcp-creator/src/browser-handoff.ts'
import { createCreatorServer } from '@deepseek-ai/dsh-experimental-mcp-creator/src/server.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { chromium, type Browser } from 'playwright'
import { describe, expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

function valueOf(response: unknown): unknown {
  const result = CallToolResultSchema.parse(response)
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toHaveProperty('value')
  return result.structuredContent!.value
}

describe('creator MCP in native DSH Web', () => {
  it('queries live slots, waits for approval, and removes only its own Client UI', async () => {
    const scaffold = await launchWebScaffold()
    const resources: {
      browser?: Browser
      handle?: AgentHandle
      endpoint?: ReturnType<typeof createCreatorServer>
      client?: Client
      handoff?: Awaited<ReturnType<typeof createBrowserHandoff>>
    } = {}
    onTestFinished(async () => {
      try { await resources.browser?.close() } finally {
        try { await resources.client?.close(); await resources.endpoint?.close() } finally {
          try { await resources.handle?.dispose() } finally {
            try { await resources.handoff?.close() } finally { await scaffold.close() }
          }
        }
      }
    })
    const handle = resources.handle = await scaffold.ctx.agents.create({
      sessionId: SessionId('creator-mcp-native-ui'),
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'cordis' },
      setup: async (agentCtx, agent) => {
        await scaffold.ctx.agentPresets.mount(agentCtx, 'cordis')
        agentCtx.on('agent/pre-step', () => Promise.resolve({ kind: 'reject' }))
        await agentCtx.plugin({
          name: 'creator-mcp-test-endpoint', inject: ['agents', 'commands', 'tools'],
          apply(ctx) { resources.endpoint = createCreatorServer(ctx, agent, 30000) },
        })
      },
    })
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    await workspace.attachSession(handle.agent.id)
    scaffold.ctx.sessionTitle.rename(handle.agent.session, 'MCP UI check')
    const client = resources.client = new Client({ name: 'creator-native-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await resources.endpoint!.server.connect(serverTransport)
    await client.connect(clientTransport)
    const browser = resources.browser = await chromium.launch()
    const page = await newEnglishPage(browser)
    const diagnostics = watchConsole(page)
    const cleanUrl = `${new URL(scaffold.authenticatedUrl).origin}/`
    expect((await page.goto(cleanUrl))?.status()).toBe(401)
    const handoff = resources.handoff = await createBrowserHandoff(scaffold.authenticatedUrl, scaffold.workspaceCwd)
    await page.goto(handoff.url)
    await page.waitForURL(cleanUrl)
    expect((await page.context().cookies(cleanUrl)).some(cookie => cookie.httpOnly && cookie.sameSite === 'Strict')).toBe(true)
    expect((await page.goto(cleanUrl))?.status()).toBe(200)
    await page.getByRole('button', { name: 'New session', exact: true }).last().click()
    await page.locator('[data-composer-input]').waitFor()
    await expect.poll(() => scaffold.ctx.cordisInspect.list().some(provider => provider.platform === 'client')).toBe(true)
    const directory = valueOf(
      await client.callTool({ name: 'cordis_inspect_list', arguments: {} }),
    ) as { providers: Array<{ id: string; platform: string; methods: Array<{ name: string }> }> }
    const slots = directory.providers.find(provider => provider.platform === 'client'
      && provider.methods.some(method => method.name === 'listSubTree'))
    expect(slots).toBeDefined()
    const slot = 'sidebar.footer.action'
    const inspected = await client.callTool({ name: 'cordis_inspect_query', arguments: {
      platform: 'client', provider: slots!.id, method: 'listSubTree', input: { root: slot },
    } })
    expect(inspected.isError).not.toBe(true)
    expect(JSON.stringify(inspected.structuredContent)).toContain(slot)
    const definition = valueOf(await client.callTool({
      name: 'cordis_define',
      arguments: {
        plugin: { kind: 'new', idPrefix: 'mcpui' }, name: 'Creator MCP proof', purpose: 'Show a reversible native Client slot change.',
        code: { client: `return { apply(ctx) { const slots = ctx.get('slots'); if (!slots) throw new Error('slots unavailable'); slots.inject('${slot}', () => slots.register({ name: '${slot}', id: 'mcp-proof' }, () => React.createElement('span', { 'data-mcp-creator-demo': 'visible' }, 'Creator MCP connected'))); } }` },
      },
    })) as { pluginId: string; packageId: string }
    const running = valueOf(await client.callTool({ name: 'cordis_run', arguments: { ...definition, mode: 'run' } })) as { status: string }
    expect(running.status).toBe('awaiting-approval')
    expect(await page.locator('[data-mcp-creator-demo]').count()).toBe(0)
    await page.locator('[data-cordis-approve]').first().click()
    await page.locator('[data-mcp-creator-demo]').waitFor()
    const evidence = await mkdtemp(join(tmpdir(), 'dsh-native-creator-evidence-'))
    await page.screenshot({ path: join(evidence, 'native-client-slot.png') })
    expect((await client.callTool({ name: 'cordis_stop', arguments: { pluginId: definition.pluginId } })).isError).not.toBe(true)
    await page.locator('[data-mcp-creator-demo]').waitFor({ state: 'detached' })
    expect(await page.locator('[data-composer-input]').isVisible()).toBe(true)
    expect((await client.callTool({ name: 'cordis_undefine', arguments: { pluginId: definition.pluginId } })).isError).not.toBe(true)
    expect(handle.agent.session.snapshotEvents().some(event => event.type === 'assistant/message' || event.type === 'request/header')).toBe(false)
    expect(diagnostics.pageErrors).toEqual([])
    console.log(`Native creator evidence: ${evidence}`)
  })
})
