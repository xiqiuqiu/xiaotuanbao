import { AiCollaborationError, submitReviewPackageModelInputSchema } from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAssistRequestContext } from './assist-request-context'
import { submitReviewPackage } from './submit-review-package.client'

export interface SubmitReviewPackageToolConfig {
  apiBaseUrl: string
  serviceSecret: string
  modelApiKey?: string
}

const candidateInputSchema = z.object({
  fieldKey: z.enum(['name', 'routeName', 'startDate', 'endDate', 'expectedGuestCountHint']),
  proposedValue: z.union([z.string(), z.number()]),
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z
    .array(
      z.object({
        kind: z.enum(['user_message', 'system_derivation']),
        excerpt: z.string().optional(),
        messageId: z.string().optional(),
        rule: z.string().optional(),
      }),
    )
    .min(1),
})

export function createSubmitReviewPackageTool(config: SubmitReviewPackageToolConfig) {
  return createTool({
    id: 'submitReviewPackage',
    description:
      '提交发团基础信息的待审核候选（团名、路线、出团/结束日期、预计人数提示）。不写入发团创建草稿，须由 User 在表单确认。',
    inputSchema: z.object({
      objectVersion: z.number().int().positive(),
      candidates: z.array(candidateInputSchema).min(1),
    }),
    execute: async (input) => {
      if (!config.modelApiKey?.trim()) {
        throw AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
      }

      let parsed: ReturnType<typeof submitReviewPackageModelInputSchema.parse>
      try {
        parsed = submitReviewPackageModelInputSchema.parse(input)
      } catch {
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
