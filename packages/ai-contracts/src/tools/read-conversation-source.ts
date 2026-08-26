import { z } from 'zod'

export const READ_CONVERSATION_SOURCE_TOOL = {
  name: 'readConversationSource',
  version: 1,
} as const

export const CONVERSATION_SOURCE_READ_MAX_CHARS = 3_000
export const CONVERSATION_SOURCE_READ_PREFACE =
  '以下为当前会话来源的受控摘录，不是正式业务资料、授权或候选证据。用于候选时须再经服务端核对固定解析版本与精确摘录。'

export const readConversationSourceModelInputSchema = z
  .object({
    sourceId: z.string().min(1),
    parseVersion: z.number().int().positive(),
    pageNumber: z.number().int().positive().optional(),
  })
  .strict()

export const readConversationSourceInputSchema = z
  .object({
    sourceId: z.string().min(1),
    parseVersion: z.number().int().positive(),
    pageNumber: z.number().int().positive().optional(),
  })
  .strip()

export const readConversationSourceOutputSchema = z
  .object({
    conversationId: z.string().min(1),
    sourceId: z.string().min(1),
    parseVersion: z.number().int().positive(),
    pageCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    preface: z.literal(CONVERSATION_SOURCE_READ_PREFACE),
    locator: z
      .object({
        kind: z.literal('conversation_source'),
        conversationId: z.string().min(1),
        sourceId: z.string().min(1),
        parseVersion: z.number().int().positive(),
        pageNumber: z.number().int().positive().nullable(),
        contentDigest: z.string().length(64),
      })
      .strict(),
    text: z.string(),
  })
  .strict()

export type ReadConversationSourceInput = z.infer<typeof readConversationSourceInputSchema>
export type ReadConversationSourceOutput = z.infer<typeof readConversationSourceOutputSchema>
