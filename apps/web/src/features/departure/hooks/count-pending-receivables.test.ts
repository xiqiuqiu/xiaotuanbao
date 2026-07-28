import { describe, expect, it } from 'vitest'
import {
  SourceOrderCollectionMode,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { countPendingReceivables } from './useSourceOrdersTabMutations'

function order(
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
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '华东国旅',
    displayName: '华东国旅 发客',
    adultGuestCount: 1,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    settlementNotes: null,
    notes: null,
    grossReceivableCents: overrides.netReceivableCents,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    hasPaymentSchedule: false,
    receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as SourceOrderSummary
}

describe('countPendingReceivables', () => {
  it('guest_only: counts deposit + balance paths (not collapsed guestCollect)', () => {
    const count = countPendingReceivables([
      order({
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

  it('split: counts only balance Guest path (P does not open a receivable)', () => {
    const count = countPendingReceivables([
      order({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 300000,
        balanceCents: 700000,
        netReceivableCents: 1000000,
        partnerCollectedCents: 300000,
        guestCollectCents: 700000,
      }),
    ])
    expect(count).toBe(1)
  })

  it('partner_settled: counts one customer settlement when S > 0', () => {
    const count = countPendingReceivables([
      order({
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

  it('skips orders that already have receivables', () => {
    const count = countPendingReceivables([
      order({
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
})
