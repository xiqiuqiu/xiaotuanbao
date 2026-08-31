import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { searchPartners, searchSuppliers, searchUsers } from './search-related-objects.client'
import { runWithAssistRequestContext } from './assist-request-context'
import {
  createSearchPartnersTool,
  createSearchSuppliersTool,
  createSearchUsersTool,
} from './search-related-objects.tool'
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

jest.mock('./search-related-objects.client', () => ({
  searchUsers: jest.fn(),
  searchSuppliers: jest.fn(),
  searchPartners: jest.fn(),
}))

const mockSearchUsers = searchUsers as jest.MockedFunction<typeof searchUsers>
const mockSearchSuppliers = searchSuppliers as jest.MockedFunction<typeof searchSuppliers>
const mockSearchPartners = searchPartners as jest.MockedFunction<typeof searchPartners>

const toolConfig = {
  apiBaseUrl: 'http://api.local',
  serviceSecret: 'secret',
  modelApiKey: 'sk-test',
}

describe('related object search tools #443', () => {
  beforeEach(() => {
    mockSearchUsers.mockReset()
    mockSearchSuppliers.mockReset()
    mockSearchPartners.mockReset()
    mockSearchUsers.mockResolvedValue({ items: [] })
    mockSearchSuppliers.mockResolvedValue({ items: [] })
    mockSearchPartners.mockResolvedValue({ items: [] })
  })

  it('sends dual identity plus model query, not model-supplied task or organization ids', async () => {
    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        createSearchUsersTool(toolConfig).execute?.(
          { keyword: '王杰', taskId: 'model-supplied', organizationId: 'org-forged' } as never,
          {} as never,
        ),
    )
    expect(mockSearchUsers).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      { taskId: 'task-1', runId: 'run-1', keyword: '王杰' },
    )

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        createSearchSuppliersTool(toolConfig).execute?.(
          { keyword: '川西车队', category: 'transport', organizationId: 'org-forged' } as never,
          {} as never,
        ),
    )
    expect(mockSearchSuppliers).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      {
        taskId: 'task-1',
        runId: 'run-1',
        keyword: '川西车队',
        category: 'transport',
      },
    )

    await runWithAssistRequestContext(
      { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
      () =>
        createSearchPartnersTool(toolConfig).execute?.(
          { keyword: '成都组团', partnerId: 'partner-forged' } as never,
          {} as never,
        ),
    )
    expect(mockSearchPartners).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      { taskId: 'task-1', runId: 'run-1', keyword: '成都组团' },
    )
  })

  it('exposes related-object search among agent tools', () => {
    expect(listAgentTools()).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
      'searchUsers',
      'searchSuppliers',
      'searchPartners',
      'proposeReviewPackage',
      'getMaterialParseResult',
      'readConversationHistory',
      'readConversationSource',
    ])
    expect(() =>
      standardSchemaToJSONSchema(createSearchUsersTool(toolConfig).inputSchema as never, {
        io: 'input',
      }),
    ).not.toThrow()
  })

  it('fails closed when the model key is missing', async () => {
    const tool = createSearchUsersTool({ ...toolConfig, modelApiKey: '' })
    await expect(
      runWithAssistRequestContext(
        { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' },
        () => tool.execute?.({ keyword: '王杰' }, {} as never),
      ),
    ).rejects.toMatchObject({ code: 'AGENT_UNAVAILABLE' })
    expect(AiCollaborationError.fromCode('AGENT_UNAVAILABLE').retryable).toBe(true)
    expect(mockSearchUsers).not.toHaveBeenCalled()
  })
})
