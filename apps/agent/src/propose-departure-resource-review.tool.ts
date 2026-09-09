import {
  AI_CREATE_TOOL_DESCRIPTIONS,
  AiCollaborationError,
  DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
  submitDepartureResourceReviewModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { requireTaskBoundAssistContext } from './assist-request-context'
import { proposeDepartureResourceReviewPackage } from './propose-departure-resource-review.client'

export interface ProposeDepartureResourceReviewToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

export const evidenceInputSchema = z.discriminatedUnion('kind', [
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

export function createProposeDepartureResourceReviewTool(config: ProposeDepartureResourceReviewToolConfig) {
  return createTool({
    id: 'proposeDepartureResourceReviewPackage',
    description: AI_CREATE_TOOL_DESCRIPTIONS.proposeDepartureResourceReviewPackage,
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      reviewPackageId: z.string().min(1).optional().describe('修订已有事项时填写当前审核包 ID；新事项省略'),
      expectedPackageVersion: z.number().int().positive().optional().describe('与 reviewPackageId 同时填写当前审核包版本'),
      candidates: z
        .array(candidateInputSchema)
        .min(1)
        .describe('每个字段最多一条候选；跨日整体费用写备注，不要拆价或挂到某一天'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: ReturnType<typeof submitDepartureResourceReviewModelInputSchema.parse>
      try {
        parsed = submitDepartureResourceReviewModelInputSchema.parse({
          ...input,
          confirmationUnit: DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
        })
      } catch {
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }

      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return proposeDepartureResourceReviewPackage(
        {
          apiBaseUrl: config.apiBaseUrl,
          serviceSecret: config.serviceSecret,
          delegationToken,
        },
        {
          taskId,
          runId,
          ...parsed,
        },
      )
    },
  })
}
