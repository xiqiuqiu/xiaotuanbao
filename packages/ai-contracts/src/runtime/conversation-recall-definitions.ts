import {
  READ_CONVERSATION_HISTORY_TOOL,
  readConversationHistoryModelInputSchema,
  readConversationHistoryOutputSchema,
} from '../tools/read-conversation-history'
import {
  READ_CONVERSATION_SOURCE_TOOL,
  readConversationSourceModelInputSchema,
  readConversationSourceOutputSchema,
} from '../tools/read-conversation-source'
import { requestContextSchema, type CapabilityDefinition } from './agent-platform'

export const CONVERSATION_HISTORY_READ_CAPABILITY_REF = {
  key: 'conversation.history.read',
  version: READ_CONVERSATION_HISTORY_TOOL.version,
} as const

export const CONVERSATION_SOURCE_READ_CAPABILITY_REF = {
  key: 'conversation.source.read',
  version: READ_CONVERSATION_SOURCE_TOOL.version,
} as const

export const CONVERSATION_RECALL_TOOL_NAMES = [
  READ_CONVERSATION_HISTORY_TOOL.name,
  READ_CONVERSATION_SOURCE_TOOL.name,
] as const

export const CONVERSATION_HISTORY_READ_CAPABILITY = {
  ...CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  toolName: READ_CONVERSATION_HISTORY_TOOL.name,
  kind: 'read',
  risk: 'low',
  requiredPermissionKeys: [],
  requiredObjectScopes: [{ kind: 'agent_conversation', idFromContext: 'conversationId' }],
  inputSchema: readConversationHistoryModelInputSchema,
  outputSchema: readConversationHistoryOutputSchema,
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'read',
    decision: 'allow',
    targetKind: 'agent_conversation',
    denyCodes: ['TARGET_MISSING', 'CROSS_ORGANIZATION', 'OBJECT_SCOPE_DENIED', 'TARGET_MISMATCH'],
  },
} as const satisfies CapabilityDefinition

export const CONVERSATION_SOURCE_READ_CAPABILITY = {
  ...CONVERSATION_SOURCE_READ_CAPABILITY_REF,
  toolName: READ_CONVERSATION_SOURCE_TOOL.name,
  kind: 'read',
  risk: 'low',
  requiredPermissionKeys: [],
  requiredObjectScopes: [{ kind: 'agent_conversation', idFromContext: 'conversationId' }],
  inputSchema: readConversationSourceModelInputSchema,
  outputSchema: readConversationSourceOutputSchema,
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'read',
    decision: 'allow',
    targetKind: 'conversation_source',
    denyCodes: [
      'TARGET_MISSING',
      'CROSS_ORGANIZATION',
      'OBJECT_SCOPE_DENIED',
      'TARGET_MISMATCH',
      'TARGET_VERSION_MISMATCH',
    ],
  },
} as const satisfies CapabilityDefinition

export const CONVERSATION_RECALL_CAPABILITY_DEFINITIONS = [
  CONVERSATION_HISTORY_READ_CAPABILITY,
  CONVERSATION_SOURCE_READ_CAPABILITY,
] as const satisfies readonly CapabilityDefinition[]

export const CONVERSATION_RECALL_CAPABILITY_REFS = [
  CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  CONVERSATION_SOURCE_READ_CAPABILITY_REF,
] as const
