/** MCP transport endpoint over the live creator tool schemas and command log. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CREATOR_TOOLS, registerCreatorCommand } from './command.ts'

/**
 * Create one MCP connection bound to an exact live creator Agent.
 * @param ctx - Host context carrying the Agent, command, and tool registries.
 * @param owner - Session owner; its removal permanently invalidates this connection.
 * @param timeoutMs - maximum duration of a tool call, including a Client inspection wait.
 * @param webUrl - native local Web UI when the connection is hosted by a Web Profile.
 * @param browserSignInUrl - owner-only local redirect file for browsers without a DSH cookie.
 * @returns MCP server and cleanup that drains its current call.
 */
export function createCreatorServer(ctx: Context, owner: Agent, timeoutMs: number, webUrl?: string, browserSignInUrl?: string): {
  // oxlint-disable-next-line typescript/no-deprecated -- raw DSH JSON schemas require the SDK's lower-level request handlers.
  server: Server
  close: () => Promise<void>
} {
  const lifetime = new AbortController()
  const command = registerCreatorCommand(ctx, owner)
  let pending: Promise<CallToolResult> | undefined
  // oxlint-disable-next-line typescript/no-deprecated -- preserve live DSH schemas without conversion to another validator.
  const server = new Server(
    { name: 'dsh-creator', version: '0.1.5-rc.1' },
    {
      capabilities: { tools: {} },
      instructions: `Creator tools are bound to DSH Session ${owner.id}. ${webUrl === undefined ? '' : `Native DSH UI: ${webUrl}. `}`
        + (browserSignInUrl === undefined ? '' : `Browser sign-in file: ${browserSignInUrl}. Open it in the browser; never read or print its credential-bearing contents. `)
        + 'Client queries require a connected DSH browser. This Session does not call a model.',
    },
  )
  const removeDisposed = ctx.on('agent/disposed', ({ agent }) => {
    if (agent.id === owner.id) lifetime.abort(new Error('creator MCP Session was disposed'))
  })
  const requireOwner = (): void => {
    if (lifetime.signal.aborted || ctx.agents.get(owner.id) !== owner) {
      throw new Error('creator MCP Session is unavailable; restart the connection')
    }
  }
  server.setRequestHandler(ListToolsRequestSchema, () => {
    requireOwner()
    const tools = ctx.tools.schemas(owner)
      .filter(tool => CREATOR_TOOLS.some(name => name === tool.name))
      .map(tool => ToolSchema.parse({
        name: tool.name, description: tool.description, inputSchema: tool.parameters,
      }))
    if (tools.length !== CREATOR_TOOLS.length) throw new Error('creator Session does not expose all required creator tools')
    return { tools }
  })
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    requireOwner()
    if (!CREATOR_TOOLS.some(name => name === request.params.name)) throw new Error('tool is not exposed by the creator MCP bridge')
    if (pending !== undefined) throw new Error('a creator tool call is already running in this Session')
    const signal = AbortSignal.any([lifetime.signal, extra.signal, AbortSignal.timeout(timeoutMs)])
    pending = (async (): Promise<CallToolResult> => {
      try {
        const execution = await ctx.commands.execute(owner, `/creator-mcp ${JSON.stringify({
          name: request.params.name, arguments: request.params.arguments ?? {},
        })}`, [], signal)
        if (execution === undefined || execution.result.text === undefined) throw new Error('creator command is unavailable')
        const result = CallToolResultSchema.parse(JSON.parse(execution.result.text))
        return { ...result, structuredContent: result }
      } catch (error: unknown) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
      } finally {
        await command.drain()
      }
    })().finally(() => { pending = undefined })
    return pending
  })
  server.onclose = () => { lifetime.abort(new Error('creator MCP connection closed')) }
  return {
    server,
    close: async () => {
      lifetime.abort(new Error('creator MCP connection closed'))
      removeDisposed()
      command.dispose()
      try { await server.close() } finally { await pending; await command.drain() }
    },
  }
}
