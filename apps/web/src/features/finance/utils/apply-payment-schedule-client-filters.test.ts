import { describe, expect, it } from 'vitest'
import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { applyPaymentScheduleClientFilters } from './apply-payment-schedule-client-filters'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: 'payable',
    scheduleNo: 'AP-1',
    title: '旧标题',
    amountCents: 10000,
    dueDate: '2026-08-10',
    counterpartyType: 'supplier',
    counterpartyId: 'sup-1',
    counterpartyName: '供应商甲',
    sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
    sourceId: 'res-1',
    resourceKind: 'hotel',
    resourceTitle: '黄山悦榕庄',
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 10000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('applyPaymentScheduleClientFilters keyword', () => {
  it('matches fee item text even when stored title differs', () => {
    const items = [schedule()]
    expect(applyPaymentScheduleClientFilters(items, '悦榕庄')).toHaveLength(1)
    expect(applyPaymentScheduleClientFilters(items, '酒店')).toHaveLength(1)
    expect(applyPaymentScheduleClientFilters(items, '不存在')).toHaveLength(0)
  })
})
