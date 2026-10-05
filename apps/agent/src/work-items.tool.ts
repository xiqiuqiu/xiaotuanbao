import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { WORK_ITEMS_TOOL_DESCRIPTION, type AgentWorkItem } from '@xiaotuanbao/ai-contracts'
export { WORK_ITEMS_INSTRUCTIONS } from '@xiaotuanbao/ai-contracts'

const resolutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pending') }),
  z.object({ kind: z.literal('answered'), message: z.string().trim().min(1) }),
  z.object({ kind: z.literal('awaiting_review'), reviewPackageIndexes: z.array(z.number().int().nonnegative()).min(1) }),
  z.object({ kind: z.literal('awaiting_user_input'), routingIndex: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('registered_intent'), routingIndex: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('withdrawn'), userExcerpt: z.string().trim().min(1) }),
])
export const workItemsInputSchema = z.object({ items: z.array(z.object({
  id: z.string().trim().min(1).max(120), request: z.string().trim().min(1).max(8000),
  goal: z.enum(['answer', 'propose_change', 'clarify', 'governed_action']), resolution: resolutionSchema,
})).min(1).max(50) })
export type RecordedWorkItem = z.infer<typeof workItemsInputSchema>['items'][number]

export function preservesWorkItems(previous: AgentWorkItem[], next: AgentWorkItem[]): boolean {
  return new Set(next.map(item => item.id)).size === next.length && previous.every(old => {
    const item = next.find(candidate => candidate.id === old.id)
    return item != null && item.request === old.request &&
      (old.goal === item.goal || old.goal === 'clarify' || old.goal === 'answer')
  })
}
export function createRecordWorkItemsTool(pendingItems: AgentWorkItem[] = []) {
  let items: RecordedWorkItem[] = pendingItems.map(item => ({ ...item, resolution: { kind: 'pending' } }))
  return createTool({
    id: 'recordWorkItems',
    description: WORK_ITEMS_TOOL_DESCRIPTION,
    inputSchema: workItemsInputSchema,
    execute: async input => {
      if (!preservesWorkItems(items, input.items)) return { status: 'rejected', reason: '不得删除已记录事项、重写原始诉求或降低变更目标', items }
      items = input.items
      return { status: 'accepted', items }
    },
  })
}
