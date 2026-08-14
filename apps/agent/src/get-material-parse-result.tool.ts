import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAssistRequestContext } from './assist-request-context'
import { fetchMaterialParseResult } from './get-material-parse-result.client'

export interface GetMaterialParseResultToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createGetMaterialParseResultTool(config: GetMaterialParseResultToolConfig) {
  return createTool({
    id: 'getMaterialParseResult',
    description:
      '读取一份发团资料档案的版本化解析全文。只返回服务端已解析内容，不根据附件预览编造字段。',
    inputSchema: z.object({
      materialId: z.string().min(1).describe('发团资料档案 id'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: { materialId: string }
      try {
        parsed = z.object({ materialId: z.string().min(1) }).parse(input)
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }

      const { delegationToken, taskId, runId } = getAssistRequestContext()
      return fetchMaterialParseResult(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          materialId: parsed.materialId,
        },
      )
    },
  })
}
