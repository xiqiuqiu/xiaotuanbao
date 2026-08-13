import {
  AiCollaborationError,
  searchRouteTemplatesModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAssistRequestContext } from './assist-request-context'
import { searchRouteTemplates } from './search-route-templates.client'

export interface SearchRouteTemplatesToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createSearchRouteTemplatesTool(config: SearchRouteTemplatesToolConfig) {
  return createTool({
    id: 'searchRouteTemplates',
    description:
      '按当前 Organization 用关键词和可选天数查询常用路线。只返回服务端给出的候选与匹配理由，不写草稿。关键词与天数都空时结果为空。',
    inputSchema: z.object({
      keyword: z.string().max(200).optional().describe('空白切词后按 AND 匹配模板名、行程段名和目的地，不搜备注'),
      dayCount: z.number().int().min(1).max(999).optional().describe('精确等于常用路线默认天数'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: ReturnType<typeof searchRouteTemplatesModelInputSchema.parse>
      try {
        parsed = searchRouteTemplatesModelInputSchema.parse(input)
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }

      const { delegationToken, taskId, runId } = getAssistRequestContext()
      return searchRouteTemplates(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          keyword: parsed.keyword,
          dayCount: parsed.dayCount,
        },
      )
    },
  })
}
