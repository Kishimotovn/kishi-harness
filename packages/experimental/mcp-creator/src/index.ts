/** Opt-in stdio MCP endpoint beside the native DSH Web application. */
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { exitOnStdinEnd } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import { createBrowserHandoff } from './browser-handoff.ts'
import { createCreatorServer } from './server.ts'

/** Cordis plugin identity. */
export const name = 'mcp-creator'
/** Host services required before a creator Session can be published. */
export const inject = ['agents', 'agentLoop', 'agentPresets', 'commands', 'tools', 'workspaceRegistry', 'webRuntime', 'webServer', 'sessionTitle', 'connection']

/** Explicit ownership and timeout settings for the local bridge. */
export interface Config {
  /** Existing absolute workspace directory used by the dedicated Session. */
  cwd: string
  /** New Session identity; a collision fails rather than adopting another Session. */
  sessionId: string
  /** Maximum elapsed time for one creator call, including waiting for a browser. */
  callTimeoutMs: number
}

/** Loader validation for the opt-in MCP endpoint. */
export const Config: z<Config> = z.object({
  cwd: z.string().required(),
  sessionId: z.string().required(),
  callTimeoutMs: z.number().step(1).min(1).max(2147483647).default(60000),
})

/**
 * Own one stdio connection and its model-free creator Session.
 * @param ctx - Host context mounted by a supported dsh Web Profile.
 * @param config - validated workspace, Session identity, and timeout.
 */
export function apply(ctx: Context, config: Config): void {
  if (!isAbsolute(config.cwd)) throw new Error('creator MCP cwd must be an absolute directory')
  if (config.sessionId.trim() === '') throw new Error('creator MCP sessionId must not be empty')
  if (ctx.webServer.host !== '127.0.0.1') throw new Error('creator MCP requires a loopback-only Web server')
  const webUrl = `http://127.0.0.1:${String(ctx.webServer.port)}`
  exitOnStdinEnd(ctx, 'creator-mcp.stdin')
  ctx.effect(async () => {
    const workspace = await ctx.workspaceRegistry.create(config.cwd)
    const handoff = await createBrowserHandoff(ctx.connection.authenticatedUrl(webUrl), config.cwd)
    const resources: { handle?: AgentHandle; endpoint?: ReturnType<typeof createCreatorServer> } = {}
    const close = async (): Promise<void> => {
      try { await resources.endpoint?.close() } finally {
        try { await resources.handle?.dispose() } finally { await handoff.close() }
      }
    }
    try {
      const handle = resources.handle = await ctx.agents.create({
        sessionId: SessionId(config.sessionId),
        meta: { cwd: config.cwd, agentPreset: 'cordis' },
        setup: async (agentCtx, agent) => {
          await ctx.agentPresets.mount(agentCtx, 'cordis')
          agentCtx.on('agent/pre-step', () => Promise.resolve({ kind: 'reject' }))
          await agentCtx.plugin({
            name: 'creator-mcp-command',
            inject: ['agents', 'commands', 'tools'],
            apply(scoped) {
              resources.endpoint = createCreatorServer(scoped, agent, config.callTimeoutMs, webUrl, handoff.url)
            },
          })
        },
      })
      if (resources.endpoint === undefined) throw new Error('creator MCP command did not activate')
      await workspace.attachSession(handle.agent.id)
      ctx.sessionTitle.rename(handle.agent.session, 'VS Code Creator')
      await resources.endpoint.server.connect(new StdioServerTransport())
      ctx.logger.info(`creator MCP UI: ${webUrl}; Session ${handle.agent.id}`)
      ctx.logger.info(`creator MCP browser sign-in file: ${handoff.url}`)
      return close
    } catch (error: unknown) {
      await close()
      throw error
    }
  }, 'creator-mcp.connection')
}
