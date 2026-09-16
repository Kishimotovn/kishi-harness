import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Commands, { CommandId, type CommandDefinition } from '@deepseek-ai/dsh-commands'
import { createScope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { registerCreatorCommand } from '../src/command.ts'

describe('creator command', () => {
  it.each([false, true])('uses tool middleware and paired command events without a model turn (reentry: %s)', async (reenter) => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SessionStore)
    await ctx.plugin(Commands)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const session = ctx.sessions.create(SessionId('creator-mcp-test'))
    const agent = { id: session.id, session } as Agent
    let calls = 0
    let nested: Promise<string> | undefined
    let handler!: CommandDefinition['handler']
    await ctx.plugin({
      name: 'creator-command-test',
      inject: ['commands', 'tools'],
      apply(inner) {
        const scope = createScope(inner, agent)
        scope.ctx.tools.register(defineTool({
          name: 'cordis_inspect_list', parameters: {}, description: 'List inspect providers.',
          output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
          execute: async () => ({ providers: ['test'] }),
        }))
        scope.ctx.on('tools/pre-execute', (execution, next) => {
          expect(execution.agent).toBe(agent)
          calls += 1
          if (reenter && calls === 1) {
            nested = scope.ctx.commands.execute(agent, '/creator-mcp {"name":"cordis_inspect_list","arguments":{}}', [], execution.signal)
              .then(() => 'accepted', (error: unknown) => error instanceof Error ? error.message : String(error))
          }
          return next()
        })
        const registration = vi.spyOn(scope.ctx.commands, 'register')
        registerCreatorCommand(scope.ctx, agent)
        handler = registration.mock.calls[0]![0].handler
        registration.mockRestore()
      },
    })

    const result = await ctx.commands.execute(agent, '/creator-mcp {"name":"cordis_inspect_list","arguments":{}}', [], new AbortController().signal)

    expect(result?.result.kind).toBe('success')
    const recorded: unknown = JSON.parse(result!.result.text!)
    expect(recorded).toMatchObject({ content: [{ type: 'text', text: '{"providers":["test"]}' }] })
    if (reenter) expect(await nested).toBe('a creator tool call is already running in this Session')
    expect(calls).toBe(1)
    expect(session.snapshotEvents().map(event => event.type)).toEqual(reenter
      ? ['command/run', 'command/run', 'command/done', 'command/done']
      : ['command/run', 'command/done'])
    expect(await ctx.commands.execute({ ...agent }, '/creator-mcp {"name":"cordis_inspect_list","arguments":{}}', [], new AbortController().signal)).toBeUndefined()
    await expect(handler({
      agent: { ...agent }, commandId: CommandId('wrong-owner'), rawInput: '{}',
      attachments: [], signal: new AbortController().signal,
    })).rejects.toThrow('creator MCP command belongs to another Session')
    await expect(ctx.commands.execute(agent, '/creator-mcp {"name":"bash","arguments":{}}', [], new AbortController().signal)).rejects.toThrow('allowed tool name')
  })
})
