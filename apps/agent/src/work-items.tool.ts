import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { Processor } from '@mastra/core/processors'
import { WORK_ITEMS_TOOL_DESCRIPTION, type AgentWorkItem } from '@xiaotuanbao/ai-contracts'
import { validateRecordedWorkItems, workItemReferences, WORK_ITEMS_PROCESSOR_ID } from './work-item-results'
export { WORK_ITEMS_INSTRUCTIONS } from '@xiaotuanbao/ai-contracts'

const resolutionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pending') }),
  z.object({ kind: z.literal('answered'), message: z.string().trim().min(1).describe('直接展示给用户的完整回答正文，必须包含要求的数字、步骤或解释；不能只写“已说明”“已回答”等进度回执。') }),
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
  return createWorkItemsRuntime(pendingItems).tool
}

export function createWorkItemsRuntime(pendingItems: AgentWorkItem[] = [], currentUserText?: string) {
  let items: RecordedWorkItem[] = pendingItems.map(item => ({ ...item, resolution: { kind: 'pending' } }))
  const toolResults: unknown[] = []
  const tool = createTool({
    id: 'recordWorkItems',
    description: WORK_ITEMS_TOOL_DESCRIPTION,
    inputSchema: workItemsInputSchema,
    execute: async input => {
      if (!preservesWorkItems(items, input.items)) return { status: 'rejected', reason: '不得删除已记录事项、重写原始诉求或降低变更目标', items }
      const references = workItemReferences(toolResults)
      const issue = validateRecordedWorkItems(input.items, references, currentUserText, true)
      if (issue) return {
        status: 'rejected', issue, items,
        reason: '事项尚未通过结果校验。请先完成对应工具调用，再根据下面真实接受的结果修正完整事项列表；不要重做已接受的业务提案。',
        acceptedResults: {
          reviews: references.reviews.map((review, index) => ({ index, confirmationUnit: review.confirmationUnit })),
          routing: references.routing.map((route, index) => ({ index, decision: route.decision })),
        },
      }
      items = input.items
      return { status: 'accepted', items }
    },
  })
  const processor = {
    id: WORK_ITEMS_PROCESSOR_ID,
    processToolResult: ({ toolName, toolCallId, result }) => {
      if (toolName !== 'recordWorkItems') toolResults.push({ toolName, toolCallId, result })
    },
    processOutputStep: ({ toolCalls, abort, messages }) => {
      if (toolCalls?.length) return messages
      const issue = validateRecordedWorkItems(items, workItemReferences(toolResults), currentUserText, false)
      if (issue) abort(
        `事项结果校验未通过：${JSON.stringify(issue)}。继续处理并调用 recordWorkItems 记录完整结果。已清楚的诉求不要让用户重复；只有确有歧义时调用 routeConversation 追问。回答正文写入 answered.message，不要写进度回执。`,
        { retry: true, metadata: { code: 'AGENT_OUTCOME_INCOMPLETE' } },
      )
      return messages
    },
  } satisfies Processor
  return { tool, processor }
}
