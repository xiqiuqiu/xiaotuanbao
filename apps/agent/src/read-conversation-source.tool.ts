import { AI_CREATE_TOOL_DESCRIPTIONS, AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireConversationAssistContext } from './assist-request-context'
import { fetchConversationSource } from './read-conversation-source.client'

export interface ReadConversationSourceToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createReadConversationSourceTool(config: ReadConversationSourceToolConfig) {
  return createTool({
    id: 'readConversationSource',
    description: AI_CREATE_TOOL_DESCRIPTIONS.readConversationSource,
    inputSchema: z.object({
      sourceId: z.string().min(1).describe('当前会话来源 id'),
      parseVersion: z.number().int().positive().describe('固定解析版本，必须原样传入'),
      pageNumber: z.number().int().positive().optional().describe('可选。按页读取原文'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }
      const sourceId = typeof input.sourceId === 'string' ? input.sourceId : ''
      const parseVersion = typeof input.parseVersion === 'number' ? input.parseVersion : NaN
      const pageNumber = typeof input.pageNumber === 'number' ? input.pageNumber : undefined
      if (!sourceId || !Number.isInteger(parseVersion) || parseVersion < 1) {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      const { delegationToken } = requireConversationAssistContext()
      return fetchConversationSource(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          sourceId,
          parseVersion,
          ...(pageNumber != null ? { pageNumber } : {}),
        },
      )
    },
  })
}
