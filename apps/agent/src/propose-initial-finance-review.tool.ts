import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  AI_CREATE_TOOL_DESCRIPTIONS, AiCollaborationError,
  submitInitialFinanceReviewModelInputSchema, proposeInitialFinanceReviewOutputSchema,
} from '@xiaotuanbao/ai-contracts'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { evidenceInputSchema, type ProposeSegmentResourceReviewToolConfig } from './propose-segment-resource-review.tool'
import { postAiTool } from './post-ai-tool'

export function createProposeInitialFinanceReviewTool(config: ProposeSegmentResourceReviewToolConfig) {
  return createTool({
    id: 'proposeInitialFinanceReviewPackage',
    description: AI_CREATE_TOOL_DESCRIPTIONS.proposeInitialFinanceReviewPackage,
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      reviewPackageId: z.string().min(1).optional(),
      expectedPackageVersion: z.number().int().positive().optional(),
      confirmationUnit: z.enum(['source_order_receivable', 'resource_payable']),
      candidates: z.array(z.object({
        fieldKey: z.enum(['sourceOrderId', 'sourceType', 'sourceId']), proposedValue: z.string().min(1),
        clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
        evidence: z.array(evidenceInputSchema).min(1),
      }).strict()).min(1).max(2),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      const parsed = submitInitialFinanceReviewModelInputSchema.safeParse(input)
      if (!parsed.success) throw AiCollaborationError.fromCode('INVALID_FORMAT')
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return proposeInitialFinanceReviewOutputSchema.parse(await postAiTool(
        { apiBaseUrl: config.apiBaseUrl, serviceSecret: config.serviceSecret, delegationToken },
        '/api/ai-tools/v1/propose-initial-finance-review-package', { ...parsed.data, taskId, runId },
      ))
    },
  })
}
