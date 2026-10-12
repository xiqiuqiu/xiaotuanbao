import { z } from 'zod'
import { registeredTaskDescriptors } from './task-descriptor'

export const CREATE_PARTNER_INTERACTION_OPTION_ID = 'create_partner'

/** 「创建“客户名”」选项文案 → 客户名；模型改写文案时返回 null。 */
export function parseCreatePartnerOptionLabel(label: string): string | null {
  return /^创建“(.+)”$/.exec(label.trim())?.[1]?.trim() || null
}

export {
  DEPARTURE_CREATION_GOAL_INTENT_KEY,
  DEPARTURE_CREATION_ROUTING_DECISION,
} from './task-descriptor'

const registeredTaskCreationDecisionSchema = z
  .string()
  .min(1)
  .refine((value) => registeredTaskDescriptors.findByRoutingDecision(value) != null, {
    message: '未登记的会话路由决策',
  })

export const registeredAgentIntentSchema = z
  .object({
    key: z.string().min(1).max(120),
    confidence: z.enum(['high', 'medium', 'low']),
    goal: z.string().trim().min(1).max(500).optional(),
  })
  .strip()

const clarificationOptionSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
  })
  .strict()
  .refine(
    (option) =>
      option.id !== CREATE_PARTNER_INTERACTION_OPTION_ID ||
      parseCreatePartnerOptionLabel(option.label) != null,
    { message: 'create_partner 选项 label 必须为：创建“客户名称”' },
  )

export const conversationRoutingInputSchema = z.union([
  z
    .object({
      decision: registeredTaskCreationDecisionSchema,
      goal: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      decision: z.literal('request_clarification'),
      prompt: z.string().trim().min(1).max(8000),
      options: z.array(clarificationOptionSchema).min(2).max(6).optional(),
    })
    .strict(),
])

export const conversationRoutingOutputSchema = z.union([
  z
    .object({
      status: z.literal('accepted'),
      decision: registeredTaskCreationDecisionSchema,
      registeredIntent: registeredAgentIntentSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('accepted'),
      decision: z.literal('request_clarification'),
      interaction: z
        .object({
          type: z.enum(['free_text', 'single_choice']),
          prompt: z.string().min(1),
          options: z.array(clarificationOptionSchema).optional(),
        })
        .strict(),
    })
    .strict(),
])

export const CONVERSATION_ROUTING_TOOL = {
  name: 'routeConversation',
  description:
    '仅当 User 明确要求创建发团时登记建团目标；目标含糊时产生持久追问。普通问答不要调用。',
} as const

export type RegisteredAgentIntent = z.infer<typeof registeredAgentIntentSchema>
export type ConversationRoutingInput = z.infer<typeof conversationRoutingInputSchema>
export type ConversationRoutingOutput = z.infer<typeof conversationRoutingOutputSchema>
