import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import { isCompletionTagIncomplete } from './departure-transition'

export type DepartureListCompletionItem = {
  category: string
  status: string
  incomplete: boolean
}

/** 执行安排 = 行程段 + 资源（与详情 Tab「执行安排」口径一致）。 */
export function deriveExecutionArrangementStatus(tags: DepartureCompletionTags): string {
  const segmentIncomplete = isCompletionTagIncomplete(tags.segments)
  const resourceIncomplete = isCompletionTagIncomplete(tags.resources)
  if (segmentIncomplete || resourceIncomplete) {
    return [tags.segments, tags.resources]
      .filter((label) => isCompletionTagIncomplete(label))
      .join('·')
  }
  return `${tags.segments}·${tags.resources}`
}

export function isExecutionArrangementIncomplete(tags: DepartureCompletionTags): boolean {
  return (
    isCompletionTagIncomplete(tags.segments) || isCompletionTagIncomplete(tags.resources)
  )
}

/** 发团列表「完成情况」列：固定四项，完成墨色 / 未完成 warning。 */
export function listDepartureListCompletionItems(
  tags: DepartureCompletionTags,
): DepartureListCompletionItem[] {
  return [
    {
      category: '客源录入',
      status: tags.sourceOrders,
      incomplete: isCompletionTagIncomplete(tags.sourceOrders),
    },
    {
      category: '执行安排',
      status: deriveExecutionArrangementStatus(tags),
      incomplete: isExecutionArrangementIncomplete(tags),
    },
    {
      category: '应收提交',
      status: tags.receivables,
      incomplete: isCompletionTagIncomplete(tags.receivables),
    },
    {
      category: '应付提交',
      status: tags.payables,
      incomplete: isCompletionTagIncomplete(tags.payables),
    },
  ]
}
