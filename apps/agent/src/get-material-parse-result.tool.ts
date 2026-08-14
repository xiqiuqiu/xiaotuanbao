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
      '按 getTaskContext 返回的档案指针读取固定解析版本的原文证据。必须传入 materialId 与 parseResultVersion；页数较多时应再传入 pageNumber。不要用文件名、预览或未钉版本编造候选。',
    inputSchema: z.object({
      materialId: z.string().min(1).describe('getTaskContext.materials[].materialId'),
      parseResultVersion: z
        .number()
        .int()
        .positive()
        .describe('getTaskContext.materials[].parseResultVersion，必须原样传入'),
      pageNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('可选。按页读取原文；truncated 为 true 或 pageCount 较大时必须传入'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      const materialId = typeof input.materialId === 'string' ? input.materialId : ''
      const parseResultVersion =
        typeof input.parseResultVersion === 'number' ? input.parseResultVersion : NaN
      const pageNumber = typeof input.pageNumber === 'number' ? input.pageNumber : undefined
      if (!materialId || !Number.isInteger(parseResultVersion) || parseResultVersion < 1) {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      if (pageNumber != null && (!Number.isInteger(pageNumber) || pageNumber < 1)) {
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
          materialId,
          parseResultVersion,
          ...(pageNumber != null ? { pageNumber } : {}),
        },
      )
    },
  })
}
