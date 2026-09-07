import {
  AI_CREATE_TOOL_DESCRIPTIONS,
  AiCollaborationError,
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  submitSegmentResourceReviewModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { proposeSegmentResourceReviewPackage } from './propose-segment-resource-review.client'

export interface ProposeSegmentResourceReviewToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

const evidenceInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('user_message'),
      excerpt: z.string().trim().min(1).max(2000),
      sequence: z.number().int().positive(),
      messageId: z.string().min(1).optional(),
    })
    .strip(),
  z
    .object({
      kind: z.literal('system_derivation'),
      rule: z.string().trim().min(1).max(200),
    })
    .strip(),
  z
    .object({
      kind: z.literal('material_region'),
      materialId: z.string().min(1),
      parseResultVersion: z.number().int().positive(),
      pageNumber: z.number().int().positive(),
      excerpt: z.string().trim().min(1).max(2000),
    })
    .strip(),
])

const candidateBase = {
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z.array(evidenceInputSchema).min(1),
}

const candidateInputSchema = z.discriminatedUnion('fieldKey', [
  z.object({
    fieldKey: z.literal('itinerarySegmentId'),
    proposedValue: z.string().trim().min(1).max(80),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('resourceKind'),
    proposedValue: z.enum([
      'transport',
      'hotel',
      'guide',
      'outsource',
      'ticket',
      'meal',
      'insurance',
      'other',
    ]),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('supplierId'),
    proposedValue: z.string().trim().min(1).max(80),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('title'),
    proposedValue: z.string().trim().min(1).max(200),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('amountCents'),
    proposedValue: z.number().int().positive(),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('notes'),
    proposedValue: z.string().trim().min(1).max(5000),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('capacityWarning'),
    proposedValue: z.string().trim().min(1).max(2000),
    ...candidateBase,
  }),
])

export function createProposeSegmentResourceReviewTool(config: ProposeSegmentResourceReviewToolConfig) {
  return createTool({
    id: 'proposeSegmentResourceReviewPackage',
    description: AI_CREATE_TOOL_DESCRIPTIONS.proposeSegmentResourceReviewPackage,
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      candidates: z
        .array(candidateInputSchema)
        .min(1)
        .describe('每个字段最多一条候选；itinerarySegmentId 必须来自当前业务事实中的正式行程段'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: ReturnType<typeof submitSegmentResourceReviewModelInputSchema.parse>
      try {
        parsed = submitSegmentResourceReviewModelInputSchema.parse({
          ...input,
          confirmationUnit: SEGMENT_RESOURCE_CONFIRMATION_UNIT,
        })
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }

      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return proposeSegmentResourceReviewPackage(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          objectVersion: parsed.objectVersion,
          confirmationUnit: parsed.confirmationUnit,
          candidates: parsed.candidates,
        },
      )
    },
  })
}
