import { z } from 'zod'
import { aiCandidateEvidenceSchema, reviewProposalErrorSchema } from './review-package'
import { normalizedEvidenceProposalSchemaV1 } from '../evidence/evidence-contract'
import { RESOURCE_PAYABLE_CONFIRMATION_UNIT, SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT } from '../review/envelope'

export const PROPOSE_INITIAL_FINANCE_REVIEW_TOOL = { name: 'proposeInitialFinanceReviewPackage', version: 1 } as const
export const INITIAL_FINANCE_PROPOSE_CAPABILITY_REF = { key: 'departure.initial-finance.propose', version: 1 } as const
const candidateBase = {
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z.array(aiCandidateEvidenceSchema).min(1).refine((items) => items.some((item) => item.kind === 'user_message'), {
    message: '准备初始账款必须引用用户明确继续的消息',
  }),
}
const reference = z.string().trim().min(1).max(80)
export const initialFinanceSelectionCandidateSchema = z.discriminatedUnion('fieldKey', [
  z.object({ fieldKey: z.literal('sourceOrderId'), proposedValue: reference, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('sourceId'), proposedValue: reference, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('sourceType'), proposedValue: z.enum(['segment_resource', 'departure_resource']), ...candidateBase }).strict(),
])
const modelShape = {
  objectVersion: z.number().int().positive(),
  reviewPackageId: reference.optional(),
  expectedPackageVersion: z.number().int().positive().optional(),
  confirmationUnit: z.enum([SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT, RESOURCE_PAYABLE_CONFIRMATION_UNIT]),
  candidates: z.array(initialFinanceSelectionCandidateSchema).min(1).max(2),
}
function validateSelection(value: { confirmationUnit: string; candidates: { fieldKey: string }[]; reviewPackageId?: string; expectedPackageVersion?: number }, ctx: z.RefinementCtx) {
  if ((value.reviewPackageId == null) !== (value.expectedPackageVersion == null)) {
    ctx.addIssue({ code: 'custom', message: '重新准备必须同时提供审核包 ID 与版本', path: ['reviewPackageId'] })
  }
  const expected = value.confirmationUnit === SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT ? ['sourceOrderId'] : ['sourceType', 'sourceId']
  const keys = value.candidates.map((candidate) => candidate.fieldKey)
  if (keys.length !== expected.length || expected.some((key) => keys.filter((item) => item === key).length !== 1)) {
    ctx.addIssue({ code: 'custom', message: '每次只选择一个已成功创建的客源或资源', path: ['candidates'] })
  }
}
export const submitInitialFinanceReviewModelInputSchema = z.object(modelShape).strict().superRefine(validateSelection)
export const submitInitialFinanceReviewInputSchema = z.object({ ...modelShape, taskId: reference, runId: reference }).strict().superRefine(validateSelection)
export type SubmitInitialFinanceReviewModelInput = z.infer<typeof submitInitialFinanceReviewModelInputSchema>
export const proposeInitialFinanceReviewOutputSchema = z.union([
  z.object({ status: z.literal('accepted'), ...modelShape, normalizedProposal: normalizedEvidenceProposalSchemaV1 }).strip()
    .superRefine(validateSelection),
  z.object({ status: z.literal('rejected'), errors: z.array(reviewProposalErrorSchema).min(1) }).strip(),
])
export type ProposeInitialFinanceReviewOutput = z.infer<typeof proposeInitialFinanceReviewOutputSchema>
