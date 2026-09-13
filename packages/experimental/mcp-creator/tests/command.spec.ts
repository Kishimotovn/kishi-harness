import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import { createScope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { registerCreatorCommand } from '../src/command.ts'

describe('creator command', () => {
  it('uses tool middleware and paired command events without a model turn', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(SessionStore)
    await ctx.plugin(Commands)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    const session = ctx.sessions.create(SessionId('creator-mcp-test'))
    const agent = { id: session.id, session } as Agent
    let calls = 0
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
          return next()
        })
        registerCreatorCommand(scope.ctx, agent)
      },
    })

    const result = await ctx.commands.execute(agent, '/creator-mcp {"name":"cordis_inspect_list","arguments":{}}', [], new AbortController().signal)

    expect(result?.result.kind).toBe('success')
    const recorded: unknown = JSON.parse(result!.result.text!)
    expect(recorded).toMatchObject({ content: [{ type: 'text', text: '{"providers":["test"]}' }] })
    expect(calls).toBe(1)
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['command/run', 'command/done'])
    await expect(ctx.commands.execute(agent, '/creator-mcp {"name":"bash","arguments":{}}', [], new AbortController().signal)).rejects.toThrow('allowed tool name')
  })
})
