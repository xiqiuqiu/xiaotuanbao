import { z } from 'zod'

export const DEPARTURE_CREATION_GOAL_INTENT_KEY = 'task.departure-creation.requested'

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

export const conversationRoutingInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('propose_departure_creation'),
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

export const conversationRoutingOutputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      status: z.literal('accepted'),
      decision: z.literal('propose_departure_creation'),
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
    '仅当 User 明确要求创建发团时登记建团目标；目标含糊或同时包含多个目标时产生持久追问。普通问答不要调用。',
} as const

export type RegisteredAgentIntent = z.infer<typeof registeredAgentIntentSchema>
export type ConversationRoutingInput = z.infer<typeof conversationRoutingInputSchema>
export type ConversationRoutingOutput = z.infer<typeof conversationRoutingOutputSchema>
