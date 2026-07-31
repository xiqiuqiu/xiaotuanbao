import { DepartureStatus } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { formatCents } from '../catalog'
import { isCompletionTagIncomplete } from './departure-transition'
import { formatReceivableBalanceAnomalyCopy } from './format-receivable-balance-anomaly'

export type DepartureNextAction = {
  type: 'info' | 'warning' | 'success'
  title: string
  description?: string
  /** Optional primary CTA */
  action?: {
    label: string
    /** Detail tab key to navigate to, or a semantic action key handled by header */
    tab?:
      | 'sourceOrders'
      | 'execution'
      | 'receivables'
      | 'payables'
      | 'transactions'
      | 'verifications'
      | 'overview'
    intent?:
      | 'edit'
      | 'pending_settlement'
      | 'mark_settled'
      | 'close'
      | 'unarchive'
      | 'open_history'
  }
}

type DepartureInput = Pick<
  DepartureDetail,
  | 'status'
  | 'completionTags'
  | 'overviewStats'
  | 'isFinanciallySettled'
  | 'sourceOrderCount'
  | 'segmentCount'
  | 'resourceCount'
  | 'archiveHistory'
  | 'settlementHistory'
>

function resolveAnomalyAction(
  departure: DepartureInput,
): DepartureNextAction | null {
  const { anomalies } = departure.overviewStats
  if (anomalies.length === 0) {
    return null
  }

  const receivableAnomaly = anomalies.find(({ code }) => code === 'receivable_balance')
  const anomalyCount = anomalies.length

  if (receivableAnomaly) {
    const copy = formatReceivableBalanceAnomalyCopy(receivableAnomaly)
    return {
      type: 'warning',
      title: anomalyCount > 1 ? `发现 ${anomalyCount} 项财务异常` : copy.title,
      description: '应收金额存在异常，请核对后再继续结算。',
      action: {
        label: '查看应收',
        tab: 'receivables',
      },
    }
  }

  return {
    type: 'warning',
    title: `发现 ${anomalyCount} 项财务异常`,
    description: '概览统计数据存在不一致，请先核对。',
    action: {
      label: '查看概览',
      tab: 'overview',
    },
  }
}

function getIncompletePrepTab(
  departure: DepartureInput,
): DepartureNextAction | null {
  const { completionTags } = departure
  const incompleteLabels: string[] = []

  if (isCompletionTagIncomplete(completionTags.sourceOrders)) {
    incompleteLabels.push('客源')
  }
  if (isCompletionTagIncomplete(completionTags.segments)) {
    incompleteLabels.push('行程')
  }
  if (isCompletionTagIncomplete(completionTags.resources)) {
    incompleteLabels.push('资源')
  }

  if (incompleteLabels.length === 0) {
    return null
  }

  const tab = isCompletionTagIncomplete(completionTags.sourceOrders)
    ? 'sourceOrders'
    : 'execution'

  const tagByLabel = {
    客源: completionTags.sourceOrders,
    行程: completionTags.segments,
    资源: completionTags.resources,
  } as const

  return {
    type: 'warning',
    // Single line: use completion-tag copy only (avoid「尚未完备」+ tag 重复).
    title: incompleteLabels
      .map((label) => tagByLabel[label as keyof typeof tagByLabel])
      .join('、'),
    action: {
      label: tab === 'sourceOrders' ? '完善客源' : '完善行程与资源',
      tab,
    },
  }
}

function resolveEditingAction(
  departure: DepartureInput,
  canWrite: boolean,
): DepartureNextAction | null {
  const incomplete = getIncompletePrepTab(departure)
  if (incomplete) {
    return incomplete
  }

  if (canWrite) {
    return {
      type: 'info',
      title: '资料已就绪，可切换为待结算',
      description: '客源、行程与资源已录入完毕。',
      action: {
        label: '切换为待结算',
        intent: 'pending_settlement',
      },
    }
  }

  return null
}

function resolvePendingSettlementAction(
  departure: DepartureInput,
  canWrite: boolean,
): DepartureNextAction | null {
  const stats = departure.overviewStats

  if (stats.ungeneratedReceivableCents > 0) {
    return {
      type: 'warning',
      title: '尚有应收未生成',
      description: `未生成应收 ${formatCents(stats.ungeneratedReceivableCents)}`,
      action: {
        label: '生成应收',
        tab: 'receivables',
      },
    }
  }

  if (stats.ungeneratedPayableCents > 0) {
    return {
      type: 'warning',
      title: '尚有应付未生成',
      description: `未生成应付 ${formatCents(stats.ungeneratedPayableCents)}`,
      action: {
        label: '生成应付',
        tab: 'payables',
      },
    }
  }

  if (stats.openUnreceivedCents > 0) {
    return {
      type: 'warning',
      title: '尚有应收未收齐',
      description: `未收齐 ${formatCents(stats.openUnreceivedCents)}`,
      action: {
        label: '跟进收款',
        tab: 'receivables',
      },
    }
  }

  if (stats.openUnpaidCents > 0) {
    return {
      type: 'warning',
      title: '尚有应付未付清',
      description: `未付清 ${formatCents(stats.openUnpaidCents)}`,
      action: {
        label: '跟进付款',
        tab: 'payables',
      },
    }
  }

  if (stats.unverifiedIncomeCents > 0) {
    return {
      type: 'warning',
      title: '尚有收入流水未核销',
      description: `未核销收入 ${formatCents(stats.unverifiedIncomeCents)}`,
      action: {
        label: '核销收入',
        tab: 'verifications',
      },
    }
  }

  if (stats.unverifiedExpenseCents > 0) {
    return {
      type: 'warning',
      title: '尚有支出流水未核销',
      description: `未核销支出 ${formatCents(stats.unverifiedExpenseCents)}`,
      action: {
        label: '核销支出',
        tab: 'verifications',
      },
    }
  }

  if (departure.isFinanciallySettled && canWrite) {
    return {
      type: 'success',
      title: '账款已结清，可标记为已结清',
      description: '全部应收应付与流水已处理完毕。',
      action: {
        label: '标记为已结清',
        intent: 'mark_settled',
      },
    }
  }

  return null
}

function resolveSettledAction(canWrite: boolean): DepartureNextAction {
  if (canWrite) {
    return {
      type: 'info',
      title: '发团已结清',
      description: '财务处理已完成，可关闭发团归档。',
      action: {
        label: '关闭发团',
        intent: 'close',
      },
    }
  }

  return {
    type: 'info',
    title: '发团已结清',
    description: '财务处理已完成，当前为只读状态。',
  }
}

function resolveClosedAction(canWrite: boolean): DepartureNextAction {
  if (canWrite) {
    return {
      type: 'info',
      title: '发团已关闭',
      description: '当前为只读归档状态，可解除归档后继续编辑。',
      action: {
        label: '解除归档',
        intent: 'unarchive',
      },
    }
  }

  return {
    type: 'info',
    title: '发团已关闭',
    description: '当前为只读归档状态，可查看归档履历。',
    action: {
      label: '查看履历',
      intent: 'open_history',
    },
  }
}

export function resolveDepartureNextAction(input: {
  departure: DepartureInput
  canWrite: boolean
}): DepartureNextAction | null {
  const { departure, canWrite } = input

  const anomalyAction = resolveAnomalyAction(departure)
  if (anomalyAction) {
    return anomalyAction
  }

  switch (departure.status) {
    case DepartureStatus.EDITING:
      return resolveEditingAction(departure, canWrite)
    case DepartureStatus.PENDING_SETTLEMENT:
      return resolvePendingSettlementAction(departure, canWrite)
    case DepartureStatus.SETTLED:
      return resolveSettledAction(canWrite)
    case DepartureStatus.CLOSED:
      return resolveClosedAction(canWrite)
    default:
      return null
  }
}
