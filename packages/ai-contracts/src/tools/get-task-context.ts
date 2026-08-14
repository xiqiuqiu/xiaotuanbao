import { z } from 'zod'
import { aiCreateToolNameSchema } from './review-package'

export const AI_CONVERSATION_EVENT_KINDS = [
  'user_message',
  'agent_message',
  'batch_status',
  'error',
] as const

export const conversationEventForAgentSchema = z
  .object({
    sequence: z.number().int().positive(),
    kind: z.enum(AI_CONVERSATION_EVENT_KINDS),
    text: z.string().trim().min(1).optional(),
  })
  .strip()

export const GET_TASK_CONTEXT_TOOL = {
  name: 'getTaskContext',
  version: 1,
} as const

export const AI_CREATE_READONLY_CAPABILITIES = ['getTaskContext'] as const

export const aiCreateDraftSnapshotSchema = z
  .object({
    mode: z.enum(['manual', 'template', 'copy']),
    routeName: z.string(),
    templateId: z.string().nullable().optional(),
    copyFromDepartureId: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
    departureType: z.string().nullable().optional(),
    expectedGuestCountHint: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    driverSupplierId: z.string().nullable().optional(),
    guideSupplierId: z.string().nullable().optional(),
    vehiclePlate: z.string().nullable().optional(),
    contactPhone: z.string().nullable().optional(),
  })
  .strip()

export const getTaskContextInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strip()

export const getTaskContextOutputSchema = z
  .object({
    task: z
      .object({
        id: z.string().min(1),
        status: z.enum(['in_progress', 'completed', 'abandoned']),
        currentPhase: z.literal('basic_info'),
        creatorUserId: z.string().min(1),
      })
      .strip(),
    snapshot: aiCreateDraftSnapshotSchema,
    objectVersion: z.number().int().positive(),
    pending: z
      .object({
        hasPendingReview: z.boolean(),
        reviewPackageId: z.string().nullable(),
      })
      .strip(),
    availableCapabilities: z.array(aiCreateToolNameSchema).min(1),
    fieldCoverage: z
      .object({
        filled: z.array(z.string()),
        missing: z.array(z.string()),
        optionalPresent: z.array(z.string()),
      })
      .strip(),
    currentUserMessage: z.string().trim().min(1).optional(),
    conversationEvents: z.array(conversationEventForAgentSchema).max(50).optional(),
    materials: z
      .array(
        z
          .object({
            materialId: z.string().min(1),
            parseResultVersion: z.number().int().positive(),
            status: z.literal('ready'),
            pageCount: z.number().int().nonnegative(),
            excerpt: z.string(),
            truncated: z.boolean(),
          })
          .strip(),
      )
      .max(20)
      .optional(),
  })
  .strip()

export type GetTaskContextInput = z.infer<typeof getTaskContextInputSchema>
export type GetTaskContextOutput = z.infer<typeof getTaskContextOutputSchema>
export type ConversationEventForAgent = z.infer<typeof conversationEventForAgentSchema>
