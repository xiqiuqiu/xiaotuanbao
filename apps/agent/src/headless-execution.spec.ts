import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { AddressInfo } from 'node:net'
import { getAssistRequestContext } from './assist-request-context'
import { fetchTaskContext } from './get-task-context.client'
import { fetchMaterialParseResult } from './get-material-parse-result.client'
import * as mastraAgent from './mastra-agent'
import {
  createAgentServer,
  createDeterministicAgentAdapter,
  listAgentTools,
} from './server'

jest.mock('@copilotkit/runtime/v2', () => ({
  CopilotRuntime: class CopilotRuntime {
    constructor(_options: unknown) {}
  },
  createCopilotRuntimeHandler: () => async () => new Response(null, { status: 204 }),
}))

jest.mock('@copilotkit/runtime/v2/node', () => ({
  createCopilotNodeHandler: jest.fn(() => async () => {}),
}))

jest.mock('@ag-ui/mastra', () => ({
  MastraAgent: {
    getLocalAgents: () => ({ 'ai-create-readonly-assist': {} }),
  },
}))

jest.mock('./mastra-agent', () => {
  const generate = jest.fn().mockResolvedValue({
    text: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。',
    toolCalls: [],
  })
  return {
    AI_CREATE_AGENT_ID: 'ai-create-readonly-assist',
    createAiCreateMastra: () => ({
      getAgent: () => ({ generate }),
    }),
    mastraGenerateMock: generate,
  }
})

jest.mock('./get-task-context.client', () => ({
  fetchTaskContext: jest.fn(),
}))

jest.mock('./get-material-parse-result.client', () => ({
  fetchMaterialParseResult: jest.fn(),
}))

const mockFetchTaskContext = fetchTaskContext as jest.MockedFunction<typeof fetchTaskContext>
const mockFetchParseResult = fetchMaterialParseResult as jest.MockedFunction<typeof fetchMaterialParseResult>
const mockMastraGenerate = (mastraAgent as unknown as { mastraGenerateMock: jest.Mock }).mastraGenerateMock

const IDENTITY = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
}

const USER_TEXT = '帮我建一个喀纳斯3日团'
const REQUEST = { ...IDENTITY, userText: USER_TEXT }

const REVIEW_PACKAGE = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

function delegationToken(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      typ: 'ai-op-delegation',
      aud: 'ai-op-delegation',
      sub: 'user-1',
      organizationId: 'org-1',
      taskId: IDENTITY.taskId,
      runId: 'run-1',
      conversationId: IDENTITY.conversationId,
      inputBatchId: IDENTITY.inputBatchId,
      attemptId: IDENTITY.attemptId,
      contextManifestId: IDENTITY.contextManifestId,
      ...claims,
    }),
  ).toString('base64url')
  return `${header}.${payload}.sig`
}

function sessionToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      typ: 'session',
      sub: 'user-1',
      organizationId: 'org-1',
    }),
  ).toString('base64url')
  return `${header}.${payload}.sig`
}

async function listen() {
  const server = createAgentServer({
    port: 0,
    apiBaseUrl: 'http://api.local',
    serviceSecret: 'secret',
    allowedOrigins: ['http://localhost:5173'],
    headlessExecutor: createDeterministicAgentAdapter({
      kind: 'completed',
      message: '已根据当前资料整理出团基础信息。',
    }),
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    server,
    port,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

async function postHeadless(
  port: number,
  options: {
    serviceSecret?: string | null
    authorization?: string | null
    body?: unknown
  } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.serviceSecret !== null) {
    headers['X-Agent-Service-Key'] = options.serviceSecret ?? 'secret'
  }
  if (options.authorization !== null) {
    headers.Authorization = options.authorization ?? `Bearer ${delegationToken()}`
  }
  return fetch(`http://127.0.0.1:${port}/v1/headless-runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body ?? REQUEST),
  })
}

describe('headless Agent runtime contract', () => {
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
    mockFetchTaskContext.mockReset()
    mockFetchParseResult.mockReset()
  })

  it('accepts a trusted service identity plus matching short-lived delegation and returns a completed outcome', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        data: {
          kind: 'completed',
          message: '已根据当前资料整理出团基础信息。',
        },
      })
      expect(mockFetchTaskContext).toHaveBeenCalledWith(
        {
          apiBaseUrl: 'http://api.local',
          serviceSecret: 'secret',
          delegationToken: delegationToken(),
        },
        { taskId: 'task-1', runId: 'run-1' },
      )
      expect(listAgentTools()).toEqual([
        'getTaskContext',
        'searchRouteTemplates',
        'submitReviewPackage',
        'getMaterialParseResult',
      ])
    } finally {
      await runtime.close()
    }
  })

  it('rejects a missing or untrusted service identity without calling the API', async () => {
    const runtime = await listen()
    try {
      const missing = await postHeadless(runtime.port, { serviceSecret: null })
      expect(missing.status).toBe(403)
      expect(await missing.json()).toMatchObject({
        data: { code: 'SERVICE_IDENTITY_INVALID' },
      })

      const wrong = await postHeadless(runtime.port, { serviceSecret: 'wrong-secret' })
      expect(wrong.status).toBe(403)
      expect(await wrong.json()).toMatchObject({
        data: { code: 'SERVICE_IDENTITY_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects a missing User delegation', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, { authorization: null })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects a browser session JWT as a background credential', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, {
        authorization: `Bearer ${sessionToken()}`,
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects a request missing conversation, batch, attempt or context manifest identity', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, {
        body: { taskId: 'task-1', attemptId: 'attempt-1' },
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        data: { code: 'INVALID_FORMAT' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects an identity mismatch between the request and the bound delegation', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, {
        body: { ...REQUEST, conversationId: 'conversation-other' },
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('binds API and tool runId from the delegation claim, not the request attemptId', async () => {
    let seen: ReturnType<typeof getAssistRequestContext> | undefined
    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
      headlessExecutor: async () => {
        seen = getAssistRequestContext()
        return { kind: 'completed', message: '已根据当前资料整理出团基础信息。' }
      },
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await postHeadless(port)
      expect(response.status).toBe(200)
      expect(mockFetchTaskContext).toHaveBeenCalledWith(
        {
          apiBaseUrl: 'http://api.local',
          serviceSecret: 'secret',
          delegationToken: delegationToken(),
        },
        { taskId: 'task-1', runId: 'run-1' },
      )
      expect(seen).toMatchObject({
        taskId: 'task-1',
        runId: 'run-1',
        attemptId: 'attempt-1',
        conversationId: 'conversation-1',
        inputBatchId: 'batch-1',
        contextManifestId: 'manifest-1',
      })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('rejects a matching headless identity when the delegation omits runId', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, {
        authorization: `Bearer ${delegationToken({ runId: undefined })}`,
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects a CopilotKit-shaped delegation that lacks batch and context manifest identity', async () => {
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port, {
        authorization: `Bearer ${delegationToken({
          conversationId: undefined,
          inputBatchId: undefined,
          attemptId: undefined,
          contextManifestId: undefined,
          runId: 'run-1',
        })}`,
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
      expect(mockFetchTaskContext).not.toHaveBeenCalled()
    } finally {
      await runtime.close()
    }
  })

  it('rejects an expired or invalid delegation reported by the API', async () => {
    mockFetchTaskContext.mockRejectedValue(AiCollaborationError.fromCode('DELEGATION_INVALID'))
    const runtime = await listen()
    try {
      const response = await postHeadless(runtime.port)
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({
        data: { code: 'DELEGATION_INVALID' },
      })
    } finally {
      await runtime.close()
    }
  })

  it('returns configured clarification, review and structured tool-failure outcomes without calling a model', async () => {
    const cases = [
      {
        outcome: {
          kind: 'awaiting_user_input' as const,
          interaction: { type: 'free_text' as const, prompt: '出团日期是哪一天？' },
        },
      },
      {
        outcome: {
          kind: 'awaiting_review' as const,
          reviewPackage: REVIEW_PACKAGE,
        },
      },
      {
        outcome: {
          kind: 'failed' as const,
          error: AiCollaborationError.fromCode('PERMISSION_DENIED').toJSON(),
        },
      },
    ]

    for (const { outcome } of cases) {
      const server = createAgentServer({
        port: 0,
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        allowedOrigins: ['http://localhost:5173'],
        headlessExecutor: createDeterministicAgentAdapter(outcome),
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const { port } = server.address() as AddressInfo
      try {
        const response = await postHeadless(port)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ data: outcome })
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      }
    }
  })

  it('returns a structured failed outcome when a declared tool throws', async () => {
    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
      headlessExecutor: async () => {
        throw AiCollaborationError.fromCode('PERMISSION_DENIED')
      },
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await postHeadless(port)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        data: {
          kind: 'failed',
          error: {
            code: 'PERMISSION_DENIED',
            message: '当前账号无权使用 AI 建团辅助',
            retryable: false,
          },
        },
      })
      expect(mockFetchTaskContext).toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('uses the production Mastra executor and Worker User plaintext when no deterministic adapter is configured', async () => {
    mockMastraGenerate.mockClear()
    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await postHeadless(port)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        data: {
          kind: 'completed',
          message: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。',
        },
      })
      expect(mockMastraGenerate).toHaveBeenCalledWith(USER_TEXT)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('does not splice getTaskContext materials into the model userText', async () => {
    mockMastraGenerate.mockClear()
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
      availableCapabilities: ['getTaskContext', 'getMaterialParseResult'],
      fieldCoverage: { filled: [], missing: [], optionalPresent: [] },
    })

    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const response = await postHeadless(port)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ data: { kind: 'completed' } })
      expect(mockFetchParseResult).not.toHaveBeenCalled()
      expect(mockMastraGenerate).toHaveBeenCalledWith(USER_TEXT)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})
