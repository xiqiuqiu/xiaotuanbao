import { AI_CREATE_TOOL_DESCRIPTIONS, AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { fetchMaterialParseResult } from './get-material-parse-result.client'

export interface GetMaterialParseResultToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export function createGetMaterialParseResultTool(config: GetMaterialParseResultToolConfig) {
  return createTool({
    id: 'getMaterialParseResult',
    description: AI_CREATE_TOOL_DESCRIPTIONS.getMaterialParseResult,
    inputSchema: z.object({
      materialId: z.string().min(1).describe('冻结投影资料索引中的 materialId'),
      parseResultVersion: z
        .number()
        .int()
        .positive()
        .describe('冻结投影资料索引中的 parseResultVersion，必须原样传入'),
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

      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
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
