import { createAiCreateMastraFromDefinition, toolNamesForRequestContext } from './agent-factory'
import { requestContextSchema } from '@xiaotuanbao/ai-contracts'

const agentConfigs: Array<{ tools: Record<string, unknown>; inputProcessors?: unknown[] }> = []
jest.mock('@mastra/core', () => ({ Mastra: class Mastra {} }))
jest.mock('@mastra/core/agent', () => ({
  Agent: class Agent {
    constructor(config: { tools: Record<string, unknown> }) {
      agentConfigs.push(config)
    }
  },
}))
jest.mock('./get-task-context.tool', () => ({ createGetTaskContextTool: () => 'task-tool' }))
jest.mock('./search-route-templates.tool', () => ({ createSearchRouteTemplatesTool: () => 'route-tool' }))
jest.mock('./submit-review-package.tool', () => ({ createSubmitReviewPackageTool: () => 'review-tool' }))
jest.mock('./get-material-parse-result.tool', () => ({ createGetMaterialParseResultTool: () => 'material-tool' }))
jest.mock('./restore-tool-reasoning', () => ({ wrapAgentStreamToRestoreToolReasoning: jest.fn() }))
jest.mock('./sanitize-model-headers', () => ({ wrapAgentExecutionWithoutInboundAuth: jest.fn() }))
const limiterConfigs: Array<{ limit: number; trimMode?: string }> = []
jest.mock('@mastra/core/processors', () => ({
  TokenLimiterProcessor: class TokenLimiterProcessor {
    constructor(options: { limit: number; trimMode?: string }) {
      limiterConfigs.push(options)
    }
  },
}))

const context = requestContextSchema.parse({
  organizationId: 'org-1',
  userId: 'user-1',
  taskId: 'task-1',
  runId: 'run-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  agentDefinition: { key: 'departure.create', version: 1 },
  grantedCapabilities: [
    { key: 'departure.task-context.read', version: 2 },
    { key: 'departure.route-template.search', version: 1 },
    { key: 'departure.review-package.propose', version: 1 },
    { key: 'departure.material-parse-result.read', version: 1 },
  ],
  entitlementStatus: 'unavailable',
  objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' }],
})

describe('Agent Factory', () => {
  it('只把当前 RequestContext 已授权 Capability 对应工具暴露给模型', () => {
    expect(
      toolNamesForRequestContext({
        ...context,
        grantedCapabilities: context.grantedCapabilities.slice(0, 2),
      }),
    ).toEqual(['getTaskContext', 'searchRouteTemplates'])

    createAiCreateMastraFromDefinition(
      { apiBaseUrl: 'http://api.local', serviceSecret: 'secret' },
      { ...context, grantedCapabilities: context.grantedCapabilities.slice(0, 2) },
    )
    expect(Object.keys(agentConfigs.at(-1)?.tools ?? {})).toEqual([
      'getTaskContext',
      'searchRouteTemplates',
    ])
    const processors = agentConfigs.at(-1)?.inputProcessors as Array<{
      trimMode?: string
      limit?: number
    }>
    expect(processors).toHaveLength(1)
    expect(processors[0]).toMatchObject({ trimMode: 'contiguous' })
    expect(processors[0]?.limit).toBeGreaterThan(0)
    expect(limiterConfigs.at(-1)).toMatchObject({
      trimMode: 'contiguous',
      limit: processors[0]?.limit,
    })
  })

  it('通用纯文本 Capability 不向模型暴露建团工具', () => {
    expect(
      toolNamesForRequestContext({
        ...context,
        taskId: undefined,
        runId: undefined,
        agentDefinition: { key: 'conversation.general', version: 1 },
        grantedCapabilities: [{ key: 'conversation.plaintext.reply', version: 1 }],
        objectScopes: [
          { organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' },
        ],
      }),
    ).toEqual(['replyPlaintext'])

    createAiCreateMastraFromDefinition(
      { apiBaseUrl: 'http://api.local', serviceSecret: 'secret' },
      {
        ...context,
        taskId: undefined,
        runId: undefined,
        agentDefinition: { key: 'conversation.general', version: 1 },
        grantedCapabilities: [{ key: 'conversation.plaintext.reply', version: 1 }],
        objectScopes: [
          { organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' },
        ],
      },
    )
    expect(Object.keys(agentConfigs.at(-1)?.tools ?? {})).toEqual([])
  })

  it('拒绝上下文声明未注册的 Capability 版本', () => {
    expect(() =>
      toolNamesForRequestContext({
        ...context,
        grantedCapabilities: [{ key: 'departure.task-context.read', version: 999 }],
      }),
    ).toThrow('未注册')
  })
})
