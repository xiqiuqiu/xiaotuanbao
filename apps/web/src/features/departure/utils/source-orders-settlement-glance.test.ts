import { describe, expect, it } from 'vitest'
import {
  SourceOrderCollectionMode,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import {
  buildSourceOrdersListGlance,
  countPendingReceivablePaths,
  isUngeneratedReceivable,
} from './source-orders-settlement-glance'

function baseOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '杭州同行',
    displayName: '杭州同行',
    guestCount: 10,
    adultGuestCount: 10,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    grossReceivableCents: 1000000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 1000000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 1000000,
    partnerCollectedCents: 0,
    guestCollectCents: 1000000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'not_generated',
    hasPaymentSchedule: false,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    hasIncompleteReceivablePaths: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    rebateScheduleNo: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function pathCountOrder(
  overrides: Partial<SourceOrderSummary> &
    Pick<
      SourceOrderSummary,
      | 'collectionMode'
      | 'depositCents'
      | 'balanceCents'
      | 'netReceivableCents'
      | 'partnerCollectedCents'
      | 'guestCollectCents'
    >,
): SourceOrderSummary {
  return baseOrder({
    partnerName: '华东国旅',
    displayName: '华东国旅 发客',
    adultGuestCount: 1,
    childGuestCount: 0,
    guestCount: 1,
    grossReceivableCents: overrides.netReceivableCents,
    receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
    ...overrides,
  })
}

describe('isUngeneratedReceivable', () => {
  it('is true when receivable has not been generated', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasIncompleteReceivablePaths: false,
      }),
    ).toBe(true)
  })

  it('is true when generated paths are incomplete', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.PENDING,
        hasIncompleteReceivablePaths: true,
      }),
    ).toBe(true)
  })

  it('is false when receivable is generated and paths are complete', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.PENDING,
        hasIncompleteReceivablePaths: false,
      }),
    ).toBe(false)
  })
})

describe('buildSourceOrdersListGlance', () => {
  it('projects strip summary and table totals from one filtered list', () => {
    const orders = [
      baseOrder({
        netReceivableCents: 1000000,
        partnerCollectedCents: 200000,
        guestCollectCents: 800000,
        guestCount: 10,
        grossReceivableCents: 1000000,
      }),
      baseOrder({
        id: 'order-2',
        netReceivableCents: 500000,
        partnerCollectedCents: 500000,
        guestCollectCents: 0,
        guestCount: 5,
        grossReceivableCents: 500000,
        receivableStatus: 'pending',
        hasPaymentSchedule: true,
        estimatedRebateCents: 12000,
      }),
    ]

    const glance = buildSourceOrdersListGlance(orders)

    expect(glance.scope).toBe('filter')
    expect(glance.stripSummary).toEqual({
      orderCount: 2,
      totalGuests: 15,
      netReceivableCents: 1500000,
      partnerCollectedCents: 700000,
      guestCollectCents: 800000,
      ungeneratedCount: 1,
      ungeneratedCents: 1000000,
    })
    expect(glance.tableTotals).toEqual({
      guestCount: 15,
      grossReceivableCents: 1500000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 1500000,
      partnerCollectedCents: 700000,
      guestCollectCents: 800000,
      rebateDisplayCents: 12000,
    })
  })

  it('treats incomplete receivable paths as 尚未提交应收 in strip only', () => {
    const glance = buildSourceOrdersListGlance([
      baseOrder({
        receivableStatus: 'pending',
        hasPaymentSchedule: true,
        hasIncompleteReceivablePaths: true,
        netReceivableCents: 300000,
        grossReceivableCents: 300000,
        guestCollectCents: 300000,
      }),
    ])

    expect(glance.stripSummary.ungeneratedCount).toBe(1)
    expect(glance.stripSummary.ungeneratedCents).toBe(300000)
    expect(glance.tableTotals.netReceivableCents).toBe(300000)
  })

  it('returns zero projections for an empty list', () => {
    expect(buildSourceOrdersListGlance([])).toEqual({
      scope: 'filter',
      stripSummary: {
        orderCount: 0,
        totalGuests: 0,
        netReceivableCents: 0,
        partnerCollectedCents: 0,
        guestCollectCents: 0,
        ungeneratedCount: 0,
        ungeneratedCents: 0,
      },
      tableTotals: {
        guestCount: 0,
        grossReceivableCents: 0,
        fareAdjustmentNetCents: 0,
        discountCents: 0,
        netReceivableCents: 0,
        partnerCollectedCents: 0,
        guestCollectCents: 0,
        rebateDisplayCents: 0,
      },
    })
  })
})

describe('countPendingReceivablePaths', () => {
  it('guest_only: counts deposit + balance paths (not collapsed guestCollect)', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositCents: 100000,
        balanceCents: 600000,
        netReceivableCents: 500000,
        partnerCollectedCents: 0,
        guestCollectCents: 700000,
      }),
    ])
    expect(count).toBe(2)
  })

  it('split: counts balance Guest + top-up when S>G', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 300000,
        balanceCents: 700000,
        netReceivableCents: 1000000,
        partnerCollectedCents: 300000,
        guestCollectCents: 700000,
      }),
    ])
    expect(count).toBe(2)
  })

  it('split: counts only balance when G already covers S', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 300000,
        balanceCents: 700000,
        netReceivableCents: 700000,
        partnerCollectedCents: 300000,
        guestCollectCents: 700000,
      }),
    ])
    expect(count).toBe(1)
  })

  it('partner_settled: counts one customer settlement when S > 0', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.PARTNER_SETTLED,
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1000000,
        partnerCollectedCents: 1000000,
        guestCollectCents: 0,
      }),
    ])
    expect(count).toBe(1)
  })

  it('skips orders that already have complete receivables', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositCents: 100000,
        balanceCents: 600000,
        netReceivableCents: 500000,
        partnerCollectedCents: 0,
        guestCollectCents: 700000,
        receivableStatus: SourceOrderReceivableStatus.PENDING,
      }),
    ])
    expect(count).toBe(0)
  })

  it('counts incomplete orders that still need path backfill', () => {
    const count = countPendingReceivablePaths([
      pathCountOrder({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 600000,
        balanceCents: 20000,
        netReceivableCents: 500000,
        partnerCollectedCents: 600000,
        guestCollectCents: 20000,
        receivableStatus: SourceOrderReceivableStatus.PENDING,
        hasIncompleteReceivablePaths: true,
        hasPaymentSchedule: true,
      }),
    ])
    expect(count).toBe(2)
  })
})
