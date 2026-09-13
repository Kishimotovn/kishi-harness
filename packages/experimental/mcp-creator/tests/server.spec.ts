import { Context } from '@deepseek-ai/cordis'
import Agents, { type Agent } from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import { createScope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, onTestFinished } from 'vitest'
import { CREATOR_TOOLS } from '../src/command.ts'
import { createCreatorServer } from '../src/server.ts'

describe('creator MCP connection', () => {
  it.each(['cancellation', 'timeout'])('preserves schemas, denials, Session ownership, and %s', async (ending) => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(Commands)
    await ctx.plugin(Agents)
    const session = ctx.sessions.create(SessionId('mcp-transport-test'))
    const agent = { id: session.id, session, ctx } as Agent
    const queryStarted = Promise.withResolvers<undefined>()
    const queryStopped = Promise.withResolvers<undefined>()
    let endpoint!: ReturnType<typeof createCreatorServer>
    let removeOwner!: () => void
    let definitions = 0
    await ctx.plugin({
      name: 'mcp-test-scope', inject: ['agents', 'commands', 'tools'],
      apply(inner) {
        const scope = createScope(inner, agent)
        removeOwner = inner.agents.register(agent)
        scope.ctx.on('tools/pre-execute', (execution, next) => execution.name === 'cordis_define'
          ? Promise.resolve({ kind: 'deny', reason: 'permission declined' })
          : next())
        for (const name of CREATOR_TOOLS) scope.ctx.tools.register(defineTool({
          name, description: `Test ${name}`, parameters: {},
          output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
          execute: async (_args, execution) => {
            if (name === 'cordis_define') definitions += 1
            if (name !== 'cordis_inspect_query') return { ok: true }
            queryStarted.resolve(undefined)
            await new Promise<void>((resolve) => { execution.signal.addEventListener('abort', () => { resolve() }, { once: true }) })
            queryStopped.resolve(undefined)
            execution.signal.throwIfAborted()
            return {}
          },
        }))
        endpoint = createCreatorServer(scope.ctx, agent, ending === 'timeout' ? 1000 : 60000)
      },
    })
    onTestFinished(async () => { await endpoint.close() })
    const client = new Client({ name: 'creator-test', version: '1.0.0' })
    onTestFinished(async () => { await client.close() })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await endpoint.server.connect(serverTransport)
    await client.connect(clientTransport)
    const list = await client.listTools()
    expect(list.tools.map(tool => tool.name)).toEqual(CREATOR_TOOLS)
    expect(list.tools[0]?.inputSchema).toEqual(ctx.tools.schemas(agent)[0]?.parameters)
    expect(await client.callTool({ name: 'cordis_inspect_list', arguments: {} })).toMatchObject({ content: [{ type: 'text', text: '{"ok":true}' }] })
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['command/run', 'command/done'])
    await expect(client.callTool({ name: 'bash', arguments: {} })).rejects.toThrow('not exposed')
    expect(await client.callTool({ name: 'cordis_define', arguments: {} })).toMatchObject({ isError: true })
    expect(definitions).toBe(0)
    const cancellation = new AbortController()
    const waiting = client.callTool({ name: 'cordis_inspect_query' }, CallToolResultSchema, { signal: cancellation.signal })
    if (ending === 'cancellation') {
      const cancelled = expect(waiting).rejects.toThrow('cancelled')
      await queryStarted.promise
      await expect(client.callTool({ name: 'cordis_inspect_list' })).rejects.toThrow('already running')
      cancellation.abort(new Error('cancelled by test'))
      await cancelled
      await queryStopped.promise
    } else {
      expect(await waiting).toMatchObject({ isError: true })
    }
    removeOwner()
    await expect(client.listTools()).rejects.toThrow('Session is unavailable')
    await endpoint.close()
    expect(session.snapshotEvents().filter(event => event.type === 'command/done').at(-1)?.data).toMatchObject({ kind: 'error' })
  })
})
