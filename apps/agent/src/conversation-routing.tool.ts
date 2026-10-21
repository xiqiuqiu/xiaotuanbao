import {
  CONVERSATION_ROUTING_TOOL,
  conversationRoutingInputSchema,
  registeredTaskDescriptors,
} from '@xiaotuanbao/ai-contracts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const taskCreationDecisions = registeredTaskDescriptors.taskCreationRoutingDecisions() as [
  string,
  ...string[],
]

const modelRoutingInputSchema = z.object({
  decision: z.enum([...taskCreationDecisions, 'request_clarification']),
  goal: z.string().optional(),
  userExcerpt: z.string().trim().min(1).optional().describe('新建任务时必填：逐字摘录本轮用户明确要求新建该业务任务的原话；历史、资料、独立输入提示均不能作为新建授权。'),
  prompt: z.string().optional(),
  options: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .optional(),
})

export function createConversationRoutingTool(currentUserText?: string) {
  return createTool({
    id: CONVERSATION_ROUTING_TOOL.name,
    description: CONVERSATION_ROUTING_TOOL.description,
    inputSchema: modelRoutingInputSchema,
    execute: async (input) => {
      const parsed = conversationRoutingInputSchema.parse(input.decision === 'request_clarification'
        ? { decision: input.decision, prompt: input.prompt, ...(input.options && input.options.length > 0 ? { options: input.options } : {}) }
        : { decision: input.decision, goal: input.goal })
      const descriptor = registeredTaskDescriptors.findByRoutingDecision(parsed.decision)
      if (descriptor && 'goal' in parsed) {
        if (!input.userExcerpt || !currentUserText?.includes(input.userExcerpt)) {
          return { status: 'rejected' as const, reason: '新建任务缺少本轮原话授权。请仅处理用户实际提出的事项；若只是修改已有记录，继续其审核流程，不要另建任务。' }
        }
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
      if (!('prompt' in parsed)) {
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
