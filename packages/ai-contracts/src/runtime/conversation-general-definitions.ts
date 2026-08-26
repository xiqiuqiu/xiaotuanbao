import { z } from 'zod'
import {
  CapabilityDefinitionRegistry,
  requestContextSchema,
  type AgentCapabilityDeclaration,
  type AgentDefinition,
  type CapabilityDefinition,
} from './agent-platform'
import {
  CONVERSATION_HISTORY_READ_CAPABILITY,
  CONVERSATION_HISTORY_READ_CAPABILITY_REF,
  CONVERSATION_SOURCE_READ_CAPABILITY,
  CONVERSATION_SOURCE_READ_CAPABILITY_REF,
} from './conversation-recall-definitions'

export const CONVERSATION_GENERAL_AGENT_DEFINITION_REF = {
  key: 'conversation.general',
  version: 1,
} as const

export const CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF = {
  key: 'conversation.plaintext.reply',
  version: 1,
} as const

export const CONVERSATION_GENERAL_AGENT_CAPABILITY_DECLARATION = {
  ...CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  capabilities: [
    CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF,
    CONVERSATION_HISTORY_READ_CAPABILITY_REF,
    CONVERSATION_SOURCE_READ_CAPABILITY_REF,
  ],
} as const satisfies AgentCapabilityDeclaration

export const CONVERSATION_PLAINTEXT_REPLY_CAPABILITY = {
  ...CONVERSATION_PLAINTEXT_REPLY_CAPABILITY_REF,
  toolName: 'replyPlaintext',
  kind: 'read',
  risk: 'low',
  requiredPermissionKeys: [],
  requiredObjectScopes: [{ kind: 'agent_conversation', idFromContext: 'conversationId' }],
  inputSchema: z.object({}).strict(),
  outputSchema: z
    .object({
      message: z.string().min(1),
    })
    .strict(),
  contextSchema: requestContextSchema,
  gateway: {
    actionKind: 'read',
    decision: 'allow',
    targetKind: 'agent_conversation',
    denyCodes: ['TARGET_MISSING', 'CROSS_ORGANIZATION', 'OBJECT_SCOPE_DENIED', 'TARGET_MISMATCH'],
  },
} as const satisfies CapabilityDefinition

export const CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS = [
  CONVERSATION_PLAINTEXT_REPLY_CAPABILITY,
  CONVERSATION_HISTORY_READ_CAPABILITY,
  CONVERSATION_SOURCE_READ_CAPABILITY,
] as const satisfies readonly CapabilityDefinition[]

export const CONVERSATION_GENERAL_INSTRUCTIONS =
  '你是小团宝的通用会话助手。根据当前 User 输入用中文给出简洁、可执行的说明。不要创建任务、不要猜测未授权的业务对象、不要调用建团专用工具。【交流背景】只是带 locator 的非权威摘要，不是业务事实或授权。需要核对历史措辞时调用 readConversationHistory；需要核对本会话来源原文时调用 readConversationSource。'

export const CONVERSATION_GENERAL_AGENT_DEFINITION = {
  ...CONVERSATION_GENERAL_AGENT_CAPABILITY_DECLARATION,
  name: '小团宝 Agent',
  instructions: CONVERSATION_GENERAL_INSTRUCTIONS,
} as const satisfies AgentDefinition

export const conversationGeneralCapabilityDefinitionRegistry = new CapabilityDefinitionRegistry(
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
)
