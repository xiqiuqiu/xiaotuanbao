import { z } from 'zod'
import { aiCollaborationErrorSchema } from '../errors/ai-collaboration-error'
import { submitReviewPackageModelInputSchema } from '../tools/review-package'

export const HEADLESS_EXECUTION_OUTCOME_KINDS = [
  'completed',
  'awaiting_user_input',
  'awaiting_review',
  'failed',
] as const

export type HeadlessExecutionOutcomeKind = (typeof HEADLESS_EXECUTION_OUTCOME_KINDS)[number]

export const headlessExecutionIdentitySchema = z
  .object({
    taskId: z.string().min(1).optional(),
    conversationId: z.string().min(1),
    inputBatchId: z.string().min(1),
    attemptId: z.string().min(1),
    contextManifestId: z.string().min(1),
  })
  .strip()

export const headlessExecutionRequestSchema = headlessExecutionIdentitySchema
  .extend({
    userText: z.string().trim().min(1),
    userTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strip()

export const headlessCompletedResultSchema = z
  .object({
    kind: z.literal('completed'),
    message: z.string().min(1),
  })
  .strip()

export const HEADLESS_INTERACTION_TYPES = ['free_text', 'single_choice'] as const

export const headlessInteractionOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strip()

export const headlessInteractionSchema = z
  .object({
    type: z.enum(HEADLESS_INTERACTION_TYPES),
    prompt: z.string().min(1),
    options: z.array(headlessInteractionOptionSchema).max(12).optional(),
  })
  .strip()
  .superRefine((value, ctx) => {
    if (value.type === 'single_choice' && (value.options?.length ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'single_choice interaction requires at least two options',
        path: ['options'],
      })
    }
    if (value.type === 'free_text' && value.options && value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'free_text interaction must not include options',
        path: ['options'],
      })
    }
  })

export const headlessAwaitingUserInputResultSchema = z
  .object({
    kind: z.literal('awaiting_user_input'),
    interaction: headlessInteractionSchema,
  })
  .strip()

export const headlessAwaitingReviewResultSchema = z
  .object({
    kind: z.literal('awaiting_review'),
    reviewPackage: submitReviewPackageModelInputSchema,
  })
  .strip()

export const headlessFailedResultSchema = z
  .object({
    kind: z.literal('failed'),
    error: aiCollaborationErrorSchema,
  })
  .strip()

export const headlessExecutionResultSchema = z.discriminatedUnion('kind', [
  headlessCompletedResultSchema,
  headlessAwaitingUserInputResultSchema,
  headlessAwaitingReviewResultSchema,
  headlessFailedResultSchema,
])

export type HeadlessExecutionIdentity = z.infer<typeof headlessExecutionIdentitySchema>
export type HeadlessExecutionRequest = z.infer<typeof headlessExecutionRequestSchema>
export type HeadlessExecutionResult = z.infer<typeof headlessExecutionResultSchema>
export type HeadlessCompletedResult = z.infer<typeof headlessCompletedResultSchema>
export type HeadlessInteraction = z.infer<typeof headlessInteractionSchema>
export type HeadlessAwaitingUserInputResult = z.infer<typeof headlessAwaitingUserInputResultSchema>
export type HeadlessAwaitingReviewResult = z.infer<typeof headlessAwaitingReviewResultSchema>
export type HeadlessFailedResult = z.infer<typeof headlessFailedResultSchema>
