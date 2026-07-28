import { DepartureArchiveAction } from '@xiaotuanbao/shared'
import type {
  DepartureArchiveHistoryItem,
  DepartureSettlementHistoryItem,
} from '@/types/api'

export type DepartureHistoryKind = 'archive' | 'settlement_revert'

export type DepartureHistoryItem = {
  id: string
  kind: DepartureHistoryKind
  operatedAt: string
  title: string
  actorName: string
  detail?: string
  reason: string
}

const ARCHIVE_ACTION_TITLES: Record<string, string> = {
  [DepartureArchiveAction.ARCHIVE]: '归档',
  [DepartureArchiveAction.UNARCHIVE]: '解除归档',
}

function mapArchiveHistoryItem(item: DepartureArchiveHistoryItem): DepartureHistoryItem {
  return {
    id: item.id,
    kind: 'archive',
    operatedAt: item.operatedAt,
    title: ARCHIVE_ACTION_TITLES[item.action] ?? item.action,
    actorName: item.operatedByName || '-',
    reason: item.reason,
  }
}

function mapSettlementHistoryItem(item: DepartureSettlementHistoryItem): DepartureHistoryItem {
  return {
    id: item.id,
    kind: 'settlement_revert',
    operatedAt: item.operatedAt,
    title: '撤销已结清',
    actorName: item.operatedByName || '-',
    detail: `触发节点 ${item.triggerScheduleNo}`,
    reason: item.reason,
  }
}

export function mergeDepartureHistoryItems(input: {
  archiveHistory: DepartureArchiveHistoryItem[]
  settlementHistory: DepartureSettlementHistoryItem[]
}): DepartureHistoryItem[] {
  return [
    ...input.archiveHistory.map(mapArchiveHistoryItem),
    ...input.settlementHistory.map(mapSettlementHistoryItem),
  ].sort((left, right) => right.operatedAt.localeCompare(left.operatedAt))
}
