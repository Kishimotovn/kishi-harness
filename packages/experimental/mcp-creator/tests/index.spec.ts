import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Creator from '../src/index.ts'

const adapters = vi.hoisted(() => ({
  stdin: vi.fn(), handoff: vi.fn(), endpoint: vi.fn(),
}))

vi.mock('@deepseek-ai/dsh-cmdline', () => ({ exitOnStdinEnd: adapters.stdin }))
vi.mock('../src/browser-handoff.ts', () => ({ createBrowserHandoff: adapters.handoff }))
vi.mock('../src/server.ts', () => ({ createCreatorServer: adapters.endpoint }))

beforeEach(() => { vi.resetAllMocks() })

function fixture(failureAt?: string, host = '127.0.0.1') {
  const failure = new Error(`failure at ${failureAt ?? 'none'}`)
  const closed: string[] = []
  let start!: () => Promise<() => Promise<void>>
  let preStep!: () => Promise<{ kind: string }>
  const agent = { id: SessionId('creator-plugin-test'), session: {} } as Agent
  const handle = {
    agent,
    dispose: vi.fn(async () => {
      closed.push('handle')
      if (failureAt === 'handle-close') throw failure
    }),
  } as unknown as AgentHandle
  const handoff = {
    url: 'file:///creator-plugin-test/sign-in.html',
    close: vi.fn(async () => { closed.push('handoff') }),
  }
  const endpoint = {
    server: { connect: vi.fn(async () => { if (failureAt === 'connect') throw failure }) },
    close: vi.fn(async () => {
      closed.push('endpoint')
      if (failureAt === 'endpoint-close') throw failure
    }),
  }
  adapters.handoff.mockResolvedValue(handoff)
  adapters.endpoint.mockImplementation(() => {
    if (failureAt === 'endpoint') throw failure
    return endpoint
  })
  const workspace = { attachSession: vi.fn(async () => { if (failureAt === 'attach') throw failure }) }
  const agentContext = {
    on: vi.fn((_event: string, listener: typeof preStep) => { preStep = listener }),
    plugin: vi.fn(async (plugin: { apply: (ctx: Context) => void }) => {
      if (failureAt !== 'inactive') plugin.apply(agentContext as unknown as Context)
    }),
  }
  const create = vi.fn<Context['agents']['create']>(async (options) => {
    if (failureAt === 'create') throw failure
    await options.setup?.(agentContext as unknown as Context, agent)
    return handle
  })
  const mount = vi.fn(async () => { if (failureAt === 'preset') throw failure })
  const info = vi.fn()
  const rename = vi.fn()
  const ctx = {
    webServer: { host, port: 55945 },
    connection: { authenticatedUrl: (url: string) => `${url}/?token=example-only-token` },
    workspaceRegistry: { create: vi.fn(async () => workspace) },
    agents: { create }, agentPresets: { mount }, sessionTitle: { rename }, logger: { info },
    effect: (factory: typeof start) => { start = factory },
  } as unknown as Context
  const config: Creator.Config = { cwd: tmpdir(), sessionId: agent.id, callTimeoutMs: 60000 }
  return {
    ctx, config, failure, closed, start: () => start(), preStep: () => preStep(),
    create, mount, info, rename, workspace, agent, handle, handoff, endpoint,
  }
}

describe('creator Profile lifecycle', () => {
  it.each([
    ['cwd', 'relative', 'absolute directory'],
    ['sessionId', ' ', 'must not be empty'],
    ['host', '0.0.0.0', 'loopback-only'],
  ])('rejects invalid %s before acquiring resources', (field, value, message) => {
    const setup = fixture(undefined, field === 'host' ? value : undefined)
    if (field === 'cwd') setup.config.cwd = value
    else if (field === 'sessionId') setup.config.sessionId = value

    expect(() => { Creator.apply(setup.ctx, setup.config) }).toThrow(message)
    expect(adapters.stdin).not.toHaveBeenCalled()
    expect(setup.create).not.toHaveBeenCalled()
  })

  it('owns a model-free Session and drains resources on disposal', async () => {
    const setup = fixture()
    Creator.apply(setup.ctx, setup.config)
    const close = await setup.start()

    expect(adapters.stdin).toHaveBeenCalledWith(setup.ctx, 'creator-mcp.stdin')
    expect(setup.create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: setup.agent.id, meta: { cwd: setup.config.cwd, agentPreset: 'cordis' },
    }))
    expect(setup.mount).toHaveBeenCalledWith(expect.anything(), 'cordis')
    expect(await setup.preStep()).toEqual({ kind: 'reject' })
    expect(setup.workspace.attachSession).toHaveBeenCalledWith(setup.agent.id)
    expect(setup.rename).toHaveBeenCalledWith(setup.agent.session, 'VS Code Creator')
    expect(setup.endpoint.server.connect).toHaveBeenCalledOnce()
    expect(JSON.stringify(setup.info.mock.calls)).not.toContain('example-only-token')
    await close()
    expect(setup.closed).toEqual(['endpoint', 'handle', 'handoff'])
  })

  it.each(['create', 'preset', 'endpoint', 'inactive', 'attach', 'connect'])('rolls back acquired resources after %s failure', async (failureAt) => {
    const setup = fixture(failureAt)
    Creator.apply(setup.ctx, setup.config)
    await expect(setup.start()).rejects.toThrow(failureAt === 'inactive' ? 'command did not activate' : setup.failure.message)
    expect(setup.closed).toEqual(failureAt === 'attach' || failureAt === 'connect'
      ? ['endpoint', 'handle', 'handoff']
      : failureAt === 'inactive' ? ['handle', 'handoff'] : ['handoff'])
  })

  it.each(['endpoint-close', 'handle-close'])('finishes remaining cleanup after %s fails', async (failureAt) => {
    const setup = fixture(failureAt)
    Creator.apply(setup.ctx, setup.config)
    const close = await setup.start()
    await expect(close()).rejects.toBe(setup.failure)
    expect(setup.closed).toEqual(['endpoint', 'handle', 'handoff'])
  })
})
