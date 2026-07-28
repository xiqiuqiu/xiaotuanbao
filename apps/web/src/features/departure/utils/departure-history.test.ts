import { describe, expect, it } from 'vitest'
import { DepartureArchiveAction } from '@xiaotuanbao/shared'
import type {
  DepartureArchiveHistoryItem,
  DepartureSettlementHistoryItem,
} from '@/types/api'
import { mergeDepartureHistoryItems } from './departure-history'

describe('mergeDepartureHistoryItems', () => {
  it('returns empty array when both histories are empty', () => {
    expect(
      mergeDepartureHistoryItems({ archiveHistory: [], settlementHistory: [] }),
    ).toEqual([])
  })

  it('maps archive history items with stable ids and titles', () => {
    const archiveHistory: DepartureArchiveHistoryItem[] = [
      {
        id: 'archive-1',
        action: DepartureArchiveAction.ARCHIVE,
        reason: '团期结束',
        operatedBy: 'user-1',
        operatedByName: '张三',
        operatedAt: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 'archive-2',
        action: DepartureArchiveAction.UNARCHIVE,
        reason: '需要补录',
        operatedBy: 'user-2',
        operatedByName: '李四',
        operatedAt: '2026-07-02T08:00:00.000Z',
      },
    ]

    expect(mergeDepartureHistoryItems({ archiveHistory, settlementHistory: [] })).toEqual([
      {
        id: 'archive-2',
        kind: 'archive',
        operatedAt: '2026-07-02T08:00:00.000Z',
        title: '解除归档',
        actorName: '李四',
        reason: '需要补录',
      },
      {
        id: 'archive-1',
        kind: 'archive',
        operatedAt: '2026-07-01T10:00:00.000Z',
        title: '归档',
        actorName: '张三',
        reason: '团期结束',
      },
    ])
  })

  it('maps settlement revert history with trigger schedule detail', () => {
    const settlementHistory: DepartureSettlementHistoryItem[] = [
      {
        id: 'settlement-1',
        triggerPaymentScheduleId: 'sched-1',
        triggerScheduleNo: 'PS-001',
        reason: '误标记结清',
        previousStatus: 'settled',
        newStatus: 'pending_settlement',
        operatedBy: 'user-3',
        operatedByName: '王五',
        operatedAt: '2026-07-03T12:00:00.000Z',
      },
    ]

    expect(mergeDepartureHistoryItems({ archiveHistory: [], settlementHistory })).toEqual([
      {
        id: 'settlement-1',
        kind: 'settlement_revert',
        operatedAt: '2026-07-03T12:00:00.000Z',
        title: '撤销已结清',
        actorName: '王五',
        detail: '触发节点 PS-001',
        reason: '误标记结清',
      },
    ])
  })

  it('merges and sorts all history kinds by operatedAt descending', () => {
    const archiveHistory: DepartureArchiveHistoryItem[] = [
      {
        id: 'archive-old',
        action: DepartureArchiveAction.ARCHIVE,
        reason: '旧归档',
        operatedBy: 'user-1',
        operatedByName: '甲',
        operatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]
    const settlementHistory: DepartureSettlementHistoryItem[] = [
      {
        id: 'settlement-new',
        triggerPaymentScheduleId: 'sched-2',
        triggerScheduleNo: 'PS-002',
        reason: '撤销',
        previousStatus: 'settled',
        newStatus: 'pending_settlement',
        operatedBy: 'user-2',
        operatedByName: '乙',
        operatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]

    const items = mergeDepartureHistoryItems({ archiveHistory, settlementHistory })

    expect(items.map((item) => item.id)).toEqual(['settlement-new', 'archive-old'])
  })

  it('uses dash for missing actor name', () => {
    const archiveHistory: DepartureArchiveHistoryItem[] = [
      {
        id: 'archive-3',
        action: DepartureArchiveAction.ARCHIVE,
        reason: '无操作人',
        operatedBy: 'user-4',
        operatedByName: '',
        operatedAt: '2026-07-04T00:00:00.000Z',
      },
    ]

    expect(mergeDepartureHistoryItems({ archiveHistory, settlementHistory: [] })[0]?.actorName).toBe(
      '-',
    )
  })
})
