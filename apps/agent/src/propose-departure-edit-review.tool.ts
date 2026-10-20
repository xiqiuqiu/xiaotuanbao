import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  AI_CREATE_TOOL_DESCRIPTIONS,
  AiCollaborationError,
  ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT,
  SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT,
  submitDepartureEditReviewModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { requireTaskBoundAssistContext } from './assist-request-context'
import type { ProposeDepartureResourceReviewToolConfig } from './propose-departure-resource-review.tool'
import { proposeDepartureEditReviewPackage } from './propose-departure-edit-review.client'
import { evidenceInputSchema } from './propose-segment-resource-review.tool'

const guestFields = {
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'unknown']).nullable().optional(),
  notes: z.string().nullable().optional(),
}

// Mastra uses Zod 4; shared contracts use Zod 3 and validate field/value pairs before HTTP.
const candidateInputSchema = z.object({
  fieldKey: z.enum(['itinerarySegmentId', 'name', 'destination', 'startDate', 'endDate', 'notes',
    'fullTicketCount', 'halfTicketCount', 'studentTicketCount', 'freeTicketCount', 'sourceOrderId', 'guestChanges']),
  proposedValue: z.union([
    z.string(), z.number().int().nonnegative(), z.null(),
    z.object({
      add: z.array(z.object({ ...guestFields, name: z.string() }).strict()).optional(),
      update: z.array(z.object({ guestId: z.string(), ...guestFields }).strict()).optional(),
    }).strict(),
  ]),
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z.array(evidenceInputSchema).min(1),
})

export function createProposeDepartureEditReviewTool(config: ProposeDepartureResourceReviewToolConfig) {
  return createTool({
    id: 'proposeDepartureEditReviewPackage',
    description: AI_CREATE_TOOL_DESCRIPTIONS.proposeDepartureEditReviewPackage,
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      reviewPackageId: z.string().min(1).optional(),
      expectedPackageVersion: z.number().int().positive().optional(),
      confirmationUnit: z.enum([
        ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT,
        SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT,
      ]),
      candidates: z.array(candidateInputSchema).min(2),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      const parsed = submitDepartureEditReviewModelInputSchema.safeParse(input)
      if (!parsed.success) throw AiCollaborationError.fromCode('INVALID_FORMAT')
      const { delegationToken, taskId, runId } = requireTaskBoundAssistContext()
      return proposeDepartureEditReviewPackage(
        { apiBaseUrl: config.apiBaseUrl, serviceSecret: config.serviceSecret, delegationToken },
        { ...parsed.data, taskId, runId },
      )
    },
  })
}
