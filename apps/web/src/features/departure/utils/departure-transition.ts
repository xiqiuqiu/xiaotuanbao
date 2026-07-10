import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'

export type DepartureTransitionAction = 'pending_settlement' | 'settled' | 'close'

const INCOMPLETE_MARKERS = ['未录入', '未安排', '未生成'] as const

export function isCompletionTagIncomplete(label: string): boolean {
  return INCOMPLETE_MARKERS.some((marker) => label.includes(marker))
}

export function getIncompleteCompletionLabels(tags: DepartureCompletionTags): string[] {
  return [
    tags.sourceOrders,
    tags.segments,
    tags.resources,
    tags.receivables,
    tags.payables,
  ].filter(isCompletionTagIncomplete)
}

export function canConfirmTransition(
  action: DepartureTransitionAction,
  departure: DepartureDetail,
): boolean {
  if (action === 'settled') {
    return departure.isFinanciallySettled
  }
  return true
}

export const TRANSITION_ACTION_META: Record<
  DepartureTransitionAction,
  {
    title: string
    description: string
    confirmLabel: string
    confirmDanger?: boolean
  }
> = {
  pending_settlement: {
    title: '切换为待结算',
    description: '切换后进入待结算阶段，建议确认客源、行程与资源已录入完毕。',
    confirmLabel: '确认切换',
  },
  settled: {
    title: '标记为已结清',
    description: '标记后基础信息将不可编辑，请确认全部账款已结清。',
    confirmLabel: '确认标记为已结清',
  },
  close: {
    title: '关闭发团',
    description: '关闭后整团不可编辑，将作为历史归档。归档原因必填，并保留操作人与时间。',
    confirmLabel: '确认关闭',
    confirmDanger: true,
  },
}
