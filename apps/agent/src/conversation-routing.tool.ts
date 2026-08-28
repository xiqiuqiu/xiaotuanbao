import {
  CONVERSATION_ROUTING_TOOL,
  conversationRoutingInputSchema,
  registeredTaskDescriptors,
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
      const descriptor = registeredTaskDescriptors.findByRoutingDecision(parsed.decision)
      if (descriptor && 'goal' in parsed) {
        return {
          status: 'accepted' as const,
          decision: parsed.decision,
          registeredIntent: {
            key: descriptor.registeredIntent.key,
            confidence: 'high' as const,
            goal: parsed.goal,
          },
        }
      }
      if (parsed.decision !== 'request_clarification') {
        throw new Error(`未登记的会话路由决策: ${parsed.decision}`)
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
