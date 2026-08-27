import {
  CONVERSATION_ROUTING_TOOL,
  DEPARTURE_CREATION_GOAL_INTENT_KEY,
  conversationRoutingInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const modelRoutingInputSchema = z.object({
  decision: z.enum(['propose_departure_creation', 'request_clarification']),
  goal: z.string().optional(),
  prompt: z.string().optional(),
  options: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .optional(),
})

export function createConversationRoutingTool() {
  return createTool({
    id: CONVERSATION_ROUTING_TOOL.name,
    description: CONVERSATION_ROUTING_TOOL.description,
    inputSchema: modelRoutingInputSchema,
    execute: async (input) => {
      const parsed = conversationRoutingInputSchema.parse(input)
      if (parsed.decision === 'propose_departure_creation') {
        return {
          status: 'accepted' as const,
          decision: parsed.decision,
          registeredIntent: {
            key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
            confidence: 'high' as const,
            goal: parsed.goal,
          },
        }
      }
      return {
        status: 'accepted' as const,
        decision: parsed.decision,
        interaction: {
          type: parsed.options ? ('single_choice' as const) : ('free_text' as const),
          prompt: parsed.prompt,
          ...(parsed.options ? { options: parsed.options } : {}),
        },
      }
    },
  })
}
