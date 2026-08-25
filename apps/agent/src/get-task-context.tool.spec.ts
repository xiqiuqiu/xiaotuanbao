import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { fetchTaskContext } from './get-task-context.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createGetTaskContextTool } from './get-task-context.tool'
import { listAgentTools } from './server'

jest.mock('@copilotkit/runtime/v2', () => ({
  CopilotRuntime: class CopilotRuntime {
    constructor(_options: unknown) {}
  },
  createCopilotRuntimeHandler: () => async () => new Response(null, { status: 204 }),
}))

jest.mock('@copilotkit/runtime/v2/node', () => ({
  createCopilotNodeHandler: () => async () => {},
}))

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

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

describe('createGetTaskContextTool', () => {
  beforeEach(() => {
    mockFetchTaskContext.mockReset()
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
      fieldCoverage: { filled: ['routeName'], missing: ['name'], optionalPresent: [] },
    })
  })

  it('calls fetchTaskContext with dual identity from ALS, not model args', async () => {
    const tool = createGetTaskContextTool(toolConfig)

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        tool.execute?.(
          { taskId: 'model-supplied', runId: 'model-supplied' } as never,
          {} as never,
        ),
    )

    expect(mockFetchTaskContext).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      { taskId: 'task-1', runId: 'run-1' },
    )
  })

  it('uses a Zod v4 inputSchema so Mastra skips the broken zod-to-json-schema.default path', () => {
    const tool = createGetTaskContextTool(toolConfig)
    expect(tool.inputSchema).toBeDefined()
    expect('_zod' in tool.inputSchema!).toBe(true)
    expect(() =>
      standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' }),
    ).not.toThrow()
  })

  it('exposes getTaskContext, searchRouteTemplates, submitReviewPackage and getMaterialParseResult', () => {
    expect(listAgentTools()).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'proposeReviewPackage',
      'getMaterialParseResult',
    ])
  })

  it('fails closed when the model key is missing', async () => {
    const tool = createGetTaskContextTool({
      ...toolConfig,
      modelApiKey: '',
    })

    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({}, {} as never),
      ),
    ).rejects.toMatchObject({
      code: 'AGENT_UNAVAILABLE',
    })
    expect(AiCollaborationError.fromCode('AGENT_UNAVAILABLE').retryable).toBe(true)
    expect(mockFetchTaskContext).not.toHaveBeenCalled()
  })
})
