import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { searchRouteTemplates } from './search-route-templates.client'
import { runWithAssistRequestContext } from './assist-request-context'
import { createSearchRouteTemplatesTool } from './search-route-templates.tool'
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

jest.mock('./search-route-templates.client', () => ({
  searchRouteTemplates: jest.fn(),
}))

const mockSearch = searchRouteTemplates as jest.MockedFunction<typeof searchRouteTemplates>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

describe('createSearchRouteTemplatesTool', () => {
  beforeEach(() => {
    mockSearch.mockReset()
    mockSearch.mockResolvedValue({
      items: [
        {
          id: 'tpl-1',
          name: '川西稻城线',
          defaultDayCount: 8,
          usageCount: 4,
          updatedAt: '2026-08-01T00:00:00.000Z',
          matchReasons: [{ code: 'name_contains_token', token: '川西' }],
        },
      ],
    })
  })

  it('sends dual identity plus model query, not model-supplied task ids', async () => {
    const tool = createSearchRouteTemplatesTool(toolConfig)

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        tool.execute?.(
          { keyword: '川西', dayCount: 8, taskId: 'model-supplied', runId: 'model-supplied' } as never,
          {} as never,
        ),
    )

    expect(mockSearch).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        keyword: '川西',
        dayCount: 8,
      },
    )
  })

  it('uses a Zod v4 inputSchema so Mastra skips the broken zod-to-json-schema.default path', () => {
    const tool = createSearchRouteTemplatesTool(toolConfig)
    expect(tool.inputSchema).toBeDefined()
    expect('_zod' in tool.inputSchema!).toBe(true)
    expect(() =>
      standardSchemaToJSONSchema(tool.inputSchema as never, { io: 'input' }),
    ).not.toThrow()
  })

  it('exposes searchRouteTemplates among agent tools', () => {
    expect(listAgentTools()).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'getMaterialParseResult',
      'submitReviewPackage',
    ])
  })

  it('fails closed when the model key is missing', async () => {
    const tool = createSearchRouteTemplatesTool({
      ...toolConfig,
      modelApiKey: '',
    })

    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({ keyword: '川西' }, {} as never),
      ),
    ).rejects.toMatchObject({ code: 'AGENT_UNAVAILABLE' })
    expect(AiCollaborationError.fromCode('AGENT_UNAVAILABLE').retryable).toBe(true)
    expect(mockSearch).not.toHaveBeenCalled()
  })
})
