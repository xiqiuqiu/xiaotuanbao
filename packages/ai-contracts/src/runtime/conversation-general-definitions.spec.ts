import { capabilityGrantResolver, requestContextSchema } from './agent-platform'
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
      { key: 'conversation.history.read', version: 1 },
      { key: 'conversation.source.read', version: 1 },
    ])
    expect(result.denied).toEqual([])
  })
})
