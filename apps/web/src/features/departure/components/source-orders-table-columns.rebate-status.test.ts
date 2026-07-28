import { describe, expect, it } from 'vitest'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { sourceOrderRebateStatusLabel } from './source-orders-table-columns'

function order(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'o1',
    departureId: 'd1',
    partnerId: 'p1',
    partnerName: '同程',
    displayName: '同程',
    guestCount: 1,
    adultGuestCount: 1,
    childGuestCount: 0,
    adultUnitPriceCents: 100,
    childUnitPriceCents: 0,
    grossReceivableCents: 100,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 50000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 100000,
    partnerCollectedCents: 0,
    guestCollectCents: 100000,
    settlementNotes: null,
    notes: null,
    receivableStatus: 'pending',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    estimatedRebateCents: 50000,
    rebateCents: 0,
    rebateStatus: SegmentPayableStatus.NOT_GENERATED,
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  }
}

describe('sourceOrderRebateStatusLabel', () => {
  it('uses 待生成 instead of 预计 when rebate is estimated but not booked', () => {
    expect(sourceOrderRebateStatusLabel(order())).toBe('待生成')
    expect(sourceOrderRebateStatusLabel(order())).not.toBe('预计')
  })

  it('uses payable dictionary after rebate is booked', () => {
    expect(
      sourceOrderRebateStatusLabel(
        order({
          rebateStatus: SegmentPayableStatus.PENDING,
          rebateCents: 50000,
          estimatedRebateCents: 50000,
        }),
      ),
    ).toBe('待付')
  })
})
