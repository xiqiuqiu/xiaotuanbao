import { requestContextSchema, type CapabilityDefinition } from './agent-platform'
import { CONVERSATION_ROUTING_TOOL, conversationRoutingInputSchema, conversationRoutingOutputSchema } from './conversation-routing'

export const CONVERSATION_ROUTING_CAPABILITY_REF = {
  key: 'conversation.intent.route',
  version: 1,
} as const

export const CONVERSATION_ROUTING_CAPABILITY = {
  ...CONVERSATION_ROUTING_CAPABILITY_REF,
  toolName: CONVERSATION_ROUTING_TOOL.name,
  kind: 'propose',
  risk: 'low',
  requiredPermissionKeys: [],
  requiredObjectScopes: [{ kind: 'agent_conversation', idFromContext: 'conversationId' }],
  inputSchema: conversationRoutingInputSchema,
  outputSchema: conversationRoutingOutputSchema,
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'read',
    decision: 'allow',
    targetKind: 'agent_conversation',
    denyCodes: ['TARGET_MISSING', 'CROSS_ORGANIZATION', 'OBJECT_SCOPE_DENIED', 'TARGET_MISMATCH'],
  },
} as const satisfies CapabilityDefinition
