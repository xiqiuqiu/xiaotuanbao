import { describe, expect, it } from 'vitest'
import type { SourceOrderSummary } from '@/types/api'
import { buildSourceOrdersListGlance } from './source-orders-list-glance'

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
