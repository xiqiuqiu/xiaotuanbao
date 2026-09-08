import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  AI_CREATE_TOOL_DESCRIPTIONS,
  AiCollaborationError,
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  SOURCE_ORDER_REVIEW_FIELD_KEYS,
  submitSourceOrderReviewPackageModelInputSchema,
  proposeSourceOrderReviewPackageOutputSchema,
} from '@xiaotuanbao/ai-contracts'
import { requireTaskBoundAssistContext } from './assist-request-context'
import {
  evidenceInputSchema,
  type ProposeSegmentResourceReviewToolConfig,
} from './propose-segment-resource-review.tool'
import { postAiTool } from './post-ai-tool'

// The model sees a JSON-compatible value union; the shared field schema validates
// each value against its field key before crossing the API boundary.
const candidateInputSchema = z.object({
  fieldKey: z.enum(SOURCE_ORDER_REVIEW_FIELD_KEYS),
  proposedValue: z.union([
    z.string(),
    z.number().int().nonnegative(),
    z.null(),
    z.array(
      z.object({
        kind: z.enum([
          'child_ticket_topup',
          'single_room_topup',
          'extended_stay',
          'ticket_discount_refund',
          'lodging_deduction',
          'other',
        ]),
        direction: z.enum(['increase', 'decrease']),
        amountCents: z.number().int().positive(),
        customName: z.string().nullable().optional(),
      }),
    ),
    z.array(
      z.object({
        name: z.string(),
        phone: z.string().nullable().optional(),
        gender: z.enum(['male', 'female', 'unknown']).nullable().optional(),
        notes: z.string().nullable().optional(),
        included: z.boolean().optional(),
      }),
    ),
  ]),
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z.array(evidenceInputSchema).min(1),
})

export function createProposeSourceOrderReviewTool(config: ProposeSegmentResourceReviewToolConfig) {
  return createTool({
    id: 'proposeSourceOrderReviewPackage',
    description: AI_CREATE_TOOL_DESCRIPTIONS.proposeSourceOrderReviewPackage,
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      candidates: z.array(candidateInputSchema).min(1),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      const parsed = submitSourceOrderReviewPackageModelInputSchema.safeParse({
        ...input,
        confirmationUnit: SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
      })
      if (!parsed.success) throw AiCollaborationError.fromCode('INVALID_FORMAT')
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return proposeSourceOrderReviewPackageOutputSchema.parse(
        await postAiTool(
          { apiBaseUrl: config.apiBaseUrl, serviceSecret: config.serviceSecret, delegationToken },
          '/api/ai-tools/v1/propose-source-order-review-package',
          { ...parsed.data, taskId, runId },
        ),
      )
    },
  })
}
