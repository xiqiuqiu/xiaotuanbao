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
    taskId: z.string().min(1),
    conversationId: z.string().min(1),
    inputBatchId: z.string().min(1),
    attemptId: z.string().min(1),
    contextManifestId: z.string().min(1),
  })
  .strip()

export const headlessExecutionRequestSchema = headlessExecutionIdentitySchema

export const headlessCompletedResultSchema = z
  .object({
    kind: z.literal('completed'),
    message: z.string().min(1),
  })
  .strip()

export const headlessAwaitingUserInputResultSchema = z
  .object({
    kind: z.literal('awaiting_user_input'),
    question: z.string().min(1),
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
export type HeadlessAwaitingUserInputResult = z.infer<typeof headlessAwaitingUserInputResultSchema>
export type HeadlessAwaitingReviewResult = z.infer<typeof headlessAwaitingReviewResultSchema>
export type HeadlessFailedResult = z.infer<typeof headlessFailedResultSchema>
