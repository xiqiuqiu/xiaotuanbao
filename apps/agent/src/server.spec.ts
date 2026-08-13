import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
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

  it('exposes getTaskContext and submitReviewPackage', () => {
    expect(listAgentTools()).toEqual(['getTaskContext', 'submitReviewPackage'])
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
        tools: ['getTaskContext', 'submitReviewPackage'],
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

  it('rejects copilotkit requests without a delegation bearer', async () => {
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
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(response.status).toBe(401)
      const payload = await response.json()
      expect(payload).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('rejects copilotkit requests missing task or run headers', async () => {
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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId: 'task-1', runId: 'run-1' }),
      })
      expect(response.status).toBe(400)
      const payload = await response.json()
      expect(payload).toMatchObject({
        data: { code: 'INVALID_FORMAT' },
      })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('rejects copilotkit POSTs when fetchTaskContext fails and does not invoke the runtime', async () => {
    let handlerInvoked = false
    mockCreateCopilotNodeHandler.mockImplementation(
      () => async (_request: IncomingMessage, response: ServerResponse) => {
        handlerInvoked = true
        response.writeHead(204)
        response.end()
      },
    )
    mockFetchTaskContext.mockRejectedValue(AiCollaborationError.fromCode('DELEGATION_INVALID'))

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
          Authorization: 'Bearer bad-deleg',
          'X-Ai-Task-Id': 'task-1',
          'X-Ai-Run-Id': 'run-1',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: {
          code: 'DELEGATION_INVALID',
          message: expect.any(String),
          retryable: false,
        },
      })
      expect(handlerInvoked).toBe(false)
      expect(mockFetchTaskContext).toHaveBeenCalledWith(
        {
          apiBaseUrl: 'http://api.local',
          serviceSecret: 'secret',
          delegationToken: 'bad-deleg',
        },
        { taskId: 'task-1', runId: 'run-1' },
      )
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('returns 403 when fetchTaskContext denies permission and does not invoke the runtime', async () => {
    let handlerInvoked = false
    mockCreateCopilotNodeHandler.mockImplementation(
      () => async (_request: IncomingMessage, response: ServerResponse) => {
        handlerInvoked = true
        response.writeHead(204)
        response.end()
      },
    )
    mockFetchTaskContext.mockRejectedValue(AiCollaborationError.fromCode('PERMISSION_DENIED'))

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
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({
        data: { code: 'PERMISSION_DENIED', retryable: false },
      })
      expect(handlerInvoked).toBe(false)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('destroys the response when copilotNode throws after headers are sent', async () => {
    let capturedResponse: ServerResponse | undefined
    mockCreateCopilotNodeHandler.mockImplementation(
      () => async (_request: IncomingMessage, response: ServerResponse) => {
        capturedResponse = response
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write(': ping\n\n')
        throw new Error('stream failed after headers')
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
      await Promise.race([
        originalFetch(`http://127.0.0.1:${port}/copilotkit`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer deleg-1',
            'X-Ai-Task-Id': 'task-1',
            'X-Ai-Run-Id': 'run-1',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
          .then((response) => response.text())
          .catch(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1000)
        }),
      ])

      expect(capturedResponse).toBeDefined()
      expect(capturedResponse!.destroyed || capturedResponse!.writableEnded).toBe(true)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
