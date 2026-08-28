import { capabilityGrantResolver, requestContextSchema } from './agent-platform'
import {
  AI_CREATE_AGENT_CAPABILITY_DECLARATION,
  aiCreateCapabilityDefinitionForTool,
  aiCreateCapabilityDefinitionRegistry,
} from './ai-create-definitions'
import { capabilitiesForPendingReview } from '../tools/review-package'
import {
  CONVERSATION_GENERAL_AGENT_DEFINITION,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  conversationGeneralCapabilityDefinitionRegistry,
} from './conversation-general-definitions'

const requestContext = requestContextSchema.parse({
  organizationId: 'org-1',
  userId: 'user-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  agentDefinition: { key: 'conversation.general', version: 1 },
  objectScopes: [{ organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' }],
})

describe('通用无任务会话 Definition', () => {
  it('登记纯文本回复 Capability，且不依赖建团任务或 departure:write', () => {
    expect(CONVERSATION_GENERAL_AGENT_DEFINITION.key).toBe('conversation.general')
    expect(CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS.map((definition) => ({
      key: definition.key,
      version: definition.version,
      toolName: definition.toolName,
      requiredPermissionKeys: definition.requiredPermissionKeys,
    }))).toEqual([
      {
        key: 'conversation.plaintext.reply',
        version: 1,
        toolName: 'replyPlaintext',
        requiredPermissionKeys: [],
      },
      {
        key: 'conversation.intent.route',
        version: 1,
        toolName: 'routeConversation',
        requiredPermissionKeys: [],
      },
      {
        key: 'conversation.history.read',
        version: 1,
        toolName: 'readConversationHistory',
        requiredPermissionKeys: [],
      },
      {
        key: 'conversation.source.read',
        version: 1,
        toolName: 'readConversationSource',
        requiredPermissionKeys: [],
      },
    ])

    const result = capabilityGrantResolver.resolve({
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION,
      capabilities: conversationGeneralCapabilityDefinitionRegistry,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: [] },
      entitlements: { status: 'unavailable' },
      riskPolicy: { allowedRisks: ['low'] },
    })

    expect(result.granted).toEqual([
      { key: 'conversation.plaintext.reply', version: 1 },
      { key: 'conversation.intent.route', version: 1 },
      { key: 'conversation.history.read', version: 1 },
      { key: 'conversation.source.read', version: 1 },
    ])
    expect(result.denied).toEqual([])
  })
})

describe('建团 Attempt 能力授予', () => {
  it('同时持有任务与会话范围时授予资料读取和会话回读', () => {
    const requestContext = requestContextSchema.parse({
      organizationId: 'org-1',
      userId: 'user-1',
      taskId: 'task-1',
      runId: 'run-1',
      conversationId: 'conversation-1',
      inputBatchId: 'batch-1',
      attemptId: 'attempt-1',
      contextManifestId: 'manifest-1',
      agentDefinition: { key: 'departure.create', version: 1 },
      objectScopes: [
        { organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' },
        { organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' },
      ],
    })
    const availableToolNames = capabilitiesForPendingReview(false)
    const result = capabilityGrantResolver.resolve({
      agentDefinition: AI_CREATE_AGENT_CAPABILITY_DECLARATION,
      capabilities: aiCreateCapabilityDefinitionRegistry,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'unavailable' },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
      availableCapabilities: availableToolNames.flatMap((toolName) => {
        const definition = aiCreateCapabilityDefinitionForTool(toolName)
        return definition ? [{ key: definition.key, version: definition.version }] : []
      }),
    })

    expect(result.granted).toEqual(
      expect.arrayContaining([
        { key: 'departure.task-context.read', version: 2 },
        { key: 'departure.material-parse-result.read', version: 1 },
        { key: 'conversation.history.read', version: 1 },
        { key: 'conversation.source.read', version: 1 },
        { key: 'departure.review-package.propose', version: 1 },
      ]),
    )
    expect(result.denied).toEqual([])
  })
})
