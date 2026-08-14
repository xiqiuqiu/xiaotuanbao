import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { fetchMaterialParseResult } from './get-material-parse-result.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createGetMaterialParseResultTool } from './get-material-parse-result.tool'
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

jest.mock('./get-material-parse-result.client', () => ({
  fetchMaterialParseResult: jest.fn(),
}))

const mockFetch = fetchMaterialParseResult as jest.MockedFunction<typeof fetchMaterialParseResult>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

describe('createGetMaterialParseResultTool', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      materialId: 'mat-1',
      parseResultVersion: 1,
      pages: [{ pageNumber: 1, source: 'ocr', text: '九月川西线' }],
    })
  })

  it('sends dual identity plus the pinned parse version, not model-supplied task ids', async () => {
    const tool = createGetMaterialParseResultTool(toolConfig)

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        tool.execute?.(
          {
            materialId: 'mat-1',
            parseResultVersion: 1,
            taskId: 'model-supplied',
            runId: 'model-supplied',
          } as never,
          {} as never,
        ),
    )

    expect(mockFetch).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        materialId: 'mat-1',
        parseResultVersion: 1,
      },
    )
  })

  it('uses a Zod v4 inputSchema so Mastra skips the broken zod-to-json-schema.default path', () => {
    const tool = createGetMaterialParseResultTool(toolConfig)
    expect(tool.inputSchema).toBeDefined()
    expect('_zod' in tool.inputSchema!).toBe(true)
    expect(() =>
      standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' }),
    ).not.toThrow()
  })

  it('exposes getMaterialParseResult among agent tools', () => {
    expect(listAgentTools()).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'submitReviewPackage',
      'getMaterialParseResult',
    ])
  })

  it('fails closed when the model key is missing', async () => {
    const tool = createGetMaterialParseResultTool({
      ...toolConfig,
      modelApiKey: '',
    })

    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({ materialId: 'mat-1', parseResultVersion: 1 }, {} as never),
      ),
    ).rejects.toMatchObject({ code: 'AGENT_UNAVAILABLE' })
    expect(AiCollaborationError.fromCode('AGENT_UNAVAILABLE').retryable).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
