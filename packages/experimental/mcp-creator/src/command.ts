/** Session-scoped command adapter for externally requested creator tools. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'

/** Exact tool allowlist exposed by the development bridge. */
export const CREATOR_TOOLS = [
  'cordis_inspect_list', 'cordis_inspect_query', 'cordis_inspect_self',
  'cordis_define', 'cordis_run', 'cordis_stop', 'cordis_undefine',
] as const

/**
 * Register a logged creator command for one exact Agent.
 * @param ctx - command/tools-injected context scoped to the receiving Agent.
 * @param owner - only Agent allowed to execute this registration.
 * @returns command disposer and a waiter for any tool still draining after cancellation.
 */
export function registerCreatorCommand(ctx: Context, owner: Agent): {
  dispose: () => void
  drain: () => Promise<void>
} {
  let pending: Promise<unknown> | undefined
  const dispose = ctx.commands.register({
    name: 'creator-mcp',
    description: 'Execute a creator tool requested by the local MCP client.',
    handler: async ({ agent, commandId, rawInput, signal }) => {
      if (agent !== owner) throw new Error('creator MCP command belongs to another Session')
      if (pending !== undefined) throw new Error('a creator tool call is already running in this Session')
      const request: unknown = JSON.parse(rawInput)
      if (typeof request !== 'object' || request === null
        || !('name' in request) || typeof request.name !== 'string'
        || !CREATOR_TOOLS.some(name => name === request.name)
        || !('arguments' in request) || typeof request.arguments !== 'object'
        || request.arguments === null || Array.isArray(request.arguments)) {
        throw new Error('creator MCP command requires an allowed tool name and an arguments object')
      }
      const execution = ctx.tools.execute({
        agent, signal, callId: ToolCallId(String(commandId)),
        name: request.name, arguments: request.arguments,
      })
      pending = execution
      try {
        const result = await execution
        return { kind: result.isError ? 'error' : 'success', text: JSON.stringify(result) }
      } finally {
        pending = undefined
      }
    },
  })
  return { dispose, drain: async () => { await pending } }
}
