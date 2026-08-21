import {
  AiCollaborationError,
  UNIQUE_CANDIDATE_FIELD_KEY_RETRY_MESSAGE,
  isDuplicateCandidateFieldError,
  submitReviewPackageModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAssistRequestContext } from './assist-request-context'
import { submitReviewPackage } from './submit-review-package.client'

export interface SubmitReviewPackageToolConfig {
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
    fieldKey: z.literal('name'),
    proposedValue: z.string().trim().min(1).max(200),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('routeName'),
    proposedValue: z.string().trim().min(1).max(200),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('templateId'),
    proposedValue: z.string().trim().min(1).max(200),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('startDate'),
    proposedValue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('endDate'),
    proposedValue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ...candidateBase,
  }),
  z.object({
    fieldKey: z.literal('expectedGuestCountHint'),
    proposedValue: z
      .number()
      .int()
      .min(0)
      .max(9999)
      .describe('预计人数的数字，例如 12；不要输出“约12人”等文本'),
    ...candidateBase,
  }),
])

export function createSubmitReviewPackageTool(config: SubmitReviewPackageToolConfig) {
  return createTool({
    id: 'submitReviewPackage',
    description:
      '提交发团基础信息的待审核候选（团名、路线、出团/结束日期、预计人数提示）。不写入发团创建草稿，须由 User 在表单确认。同一审核包内每个字段最多一条候选；资料中有多个可能值时只提交最可能的一条。',
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      candidates: z
        .array(candidateInputSchema)
        .min(1)
        .describe('每个字段最多一条候选；多个可能值时只提交最可能的一条'),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: ReturnType<typeof submitReviewPackageModelInputSchema.parse>
      try {
        parsed = submitReviewPackageModelInputSchema.parse(input)
      } catch (error) {
        if (isDuplicateCandidateFieldError(error)) {
          throw new AiCollaborationError('INVALID_FORMAT', UNIQUE_CANDIDATE_FIELD_KEY_RETRY_MESSAGE)
        }
        throw AiCollaborationError.fromCode('INVALID_FORMAT')
      }

      const { delegationToken, taskId, runId } = getAssistRequestContext()
      return submitReviewPackage(
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
