import { createCopilotNodeHandler } from '@copilotkit/runtime/v2/node'
import { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchTaskContext } from './get-task-context.client'
import { createAgentServer, listAgentTools } from './server'

jest.mock('@copilotkit/runtime/v2', () => ({
  CopilotRuntime: class CopilotRuntime {
    constructor(_options: unknown) {}
  },
  createCopilotRuntimeHandler: () => async () => new Response(null, { status: 204 }),
}))

jest.mock('@copilotkit/runtime/v2/node', () => ({
  createCopilotNodeHandler: jest.fn(() => async () => {}),
}))

const mockCreateCopilotNodeHandler = createCopilotNodeHandler as jest.MockedFunction<
  typeof createCopilotNodeHandler
>

jest.mock('@ag-ui/mastra', () => ({
  MastraAgent: {
    getLocalAgents: () => ({ 'ai-create-readonly-assist': {} }),
  },
}))

jest.mock('./mastra-agent', () => ({
  createAiCreateMastra: () => ({}),
  createAiCreateDiscoveryMastra: () => ({}),
}))

jest.mock('./get-task-context.client', () => ({
  fetchTaskContext: jest.fn(),
}))

const mockFetchTaskContext = fetchTaskContext as jest.MockedFunction<typeof fetchTaskContext>

describe('agent server', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockFetchTaskContext.mockResolvedValue({
      task: {
        id: 'task-1',
        status: 'in_progress',
        currentPhase: 'basic_info',
        creatorUserId: 'user-1',
      },
      snapshot: { mode: 'manual', routeName: '川西线' },
      objectVersion: 1,
      pending: { hasPendingReview: false, reviewPackageId: null },
      availableCapabilities: ['getTaskContext'],
      fieldCoverage: { filled: [], missing: [], optionalPresent: [] },
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    mockCreateCopilotNodeHandler.mockReset()
    mockCreateCopilotNodeHandler.mockImplementation(() => async () => {})
    mockFetchTaskContext.mockReset()
  })

  it('exposes getTaskContext, searchRouteTemplates, submitReviewPackage and getMaterialParseResult', () => {
    expect(listAgentTools()).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'submitReviewPackage',
      'getMaterialParseResult',
    ])
  })

  it('reports health with the readonly tool list without a model key', async () => {
    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await originalFetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        status: 'ok',
        tools: [
          'getTaskContext',
          'searchRouteTemplates',
          'submitReviewPackage',
          'getMaterialParseResult',
        ],
      })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('allows GET /copilotkit/info without Authorization and invokes the runtime handler', async () => {
    let handlerInvoked = false
    mockCreateCopilotNodeHandler.mockImplementation(
      () => async (_request: IncomingMessage, response: ServerResponse) => {
        handlerInvoked = true
        response.writeHead(204)
        response.end()
      },
    )

    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await originalFetch(`http://127.0.0.1:${port}/copilotkit/info`)
      expect(response.status).not.toBe(401)
      expect(response.status).toBe(204)
      expect(handlerInvoked).toBe(true)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('rejects POST /copilotkit interactive execution without invoking the runtime', async () => {
    let handlerInvoked = false
    mockCreateCopilotNodeHandler.mockImplementation(
      () => async (_request: IncomingMessage, response: ServerResponse) => {
        handlerInvoked = true
        response.writeHead(204)
        response.end()
      },
    )

    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await originalFetch(`http://127.0.0.1:${port}/copilotkit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer deleg-1',
          'X-Ai-Task-Id': 'task-1',
          'X-Ai-Run-Id': 'run-1',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ message: 'not found' })
      expect(handlerInvoked).toBe(false)
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
