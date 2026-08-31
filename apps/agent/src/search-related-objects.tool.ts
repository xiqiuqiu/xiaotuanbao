import {
  AiCollaborationError,
  AI_CREATE_TOOL_DESCRIPTIONS,
  searchPartnersModelInputSchema,
  searchSuppliersModelInputSchema,
  searchUsersModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { searchPartners, searchSuppliers, searchUsers } from './search-related-objects.client'

export interface SearchRelatedObjectsToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

function requireModelKey(config: SearchRelatedObjectsToolConfig) {
  if (!config.modelApiKey?.trim()) {
    throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
  }
}

export function createSearchUsersTool(config: SearchRelatedObjectsToolConfig) {
  return createTool({
    id: 'searchUsers',
    description: AI_CREATE_TOOL_DESCRIPTIONS.searchUsers,
    inputSchema: z.object({
      keyword: z.string().max(200).optional().describe('空白切词后按 AND 匹配已启用 User 显示名称'),
    }),
    execute: async (input) => {
      requireModelKey(config)
      let parsed: ReturnType<typeof searchUsersModelInputSchema.parse>
      try {
        parsed = searchUsersModelInputSchema.parse(input)
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return searchUsers(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          keyword: parsed.keyword,
        },
      )
    },
  })
}

export function createSearchSuppliersTool(config: SearchRelatedObjectsToolConfig) {
  return createTool({
    id: 'searchSuppliers',
    description: AI_CREATE_TOOL_DESCRIPTIONS.searchSuppliers,
    inputSchema: z.object({
      keyword: z.string().max(200).optional().describe('空白切词后按 AND 匹配已启用 Supplier 名称'),
      category: z
        .string()
        .min(1)
        .max(40)
        .optional()
        .describe('可选类别过滤；司机用 transport，导游用 guide'),
    }),
    execute: async (input) => {
      requireModelKey(config)
      let parsed: ReturnType<typeof searchSuppliersModelInputSchema.parse>
      try {
        parsed = searchSuppliersModelInputSchema.parse(input)
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return searchSuppliers(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          keyword: parsed.keyword,
          category: parsed.category,
        },
      )
    },
  })
}

export function createSearchPartnersTool(config: SearchRelatedObjectsToolConfig) {
  return createTool({
    id: 'searchPartners',
    description: AI_CREATE_TOOL_DESCRIPTIONS.searchPartners,
    inputSchema: z.object({
      keyword: z.string().max(200).optional().describe('空白切词后按 AND 匹配已启用 Partner 名称'),
    }),
    execute: async (input) => {
      requireModelKey(config)
      let parsed: ReturnType<typeof searchPartnersModelInputSchema.parse>
      try {
        parsed = searchPartnersModelInputSchema.parse(input)
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return searchPartners(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          keyword: parsed.keyword,
        },
      )
    },
  })
}
