import { AI_CREATE_TOOL_DESCRIPTIONS, AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireConversationAssistContext } from './assist-request-context'
import { fetchConversationHistory } from './read-conversation-history.client'

export interface ReadConversationHistoryToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createReadConversationHistoryTool(config: ReadConversationHistoryToolConfig) {
  return createTool({
    id: 'readConversationHistory',
    description: AI_CREATE_TOOL_DESCRIPTIONS.readConversationHistory,
    inputSchema: z.object({
      sequenceStart: z.number().int().positive().describe('回读起始 sequence（含）'),
      sequenceEnd: z.number().int().positive().describe('回读结束 sequence（含），单次最多 20 条'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }
      const sequenceStart = typeof input.sequenceStart === 'number' ? input.sequenceStart : NaN
      const sequenceEnd = typeof input.sequenceEnd === 'number' ? input.sequenceEnd : NaN
      if (!Number.isInteger(sequenceStart) || sequenceStart < 1 || !Number.isInteger(sequenceEnd) || sequenceEnd < 1) {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      const { delegationToken } = requireConversationAssistContext()
      return fetchConversationHistory(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        { sequenceStart, sequenceEnd },
      )
    },
  })
}
