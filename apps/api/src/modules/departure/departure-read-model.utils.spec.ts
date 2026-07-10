import { PaymentScheduleDirection, TransactionDirection } from '@prisma/client'
import {
  aggregateUnverifiedCashAmounts,
  buildDepartureReadModelAggregate,
  EMPTY_SOURCE_ORDER_AGGREGATE,
  deriveCompletionTags,
  deriveIsFinanciallySettled,
  derivePayableTagFromSchedules,
  deriveReceivableTagFromSchedules,
  deriveResourceTag,
  deriveSegmentTag,
  deriveSourceOrderTag,
  emptyDepartureReadModelAggregate,
  isScheduleClosed,
} from './departure-read-model.utils'

describe('departure-read-model.utils', () => {
  const receivableSchedule = {
    id: 'ar-1',
    direction: PaymentScheduleDirection.receivable,
    amountCents: 1000000,
    cancelledAt: null,
  }

  const payableSchedule = {
    id: 'ap-1',
    direction: PaymentScheduleDirection.payable,
    amountCents: 500000,
    cancelledAt: null,
  }

  describe('completion tag labels', () => {
    it('derives empty-state tags', () => {
      expect(deriveSourceOrderTag(0)).toBe('客源未录入')
      expect(deriveSegmentTag(0)).toBe('行程未录入')
      expect(deriveResourceTag(0)).toBe('资源未安排')
      expect(deriveReceivableTagFromSchedules([], new Map())).toBe('应收未生成')
      expect(derivePayableTagFromSchedules([], new Map())).toBe('应付未生成')
    })

    it('derives count tags', () => {
      expect(deriveSourceOrderTag(3)).toBe('客源3单')
      expect(deriveSegmentTag(2)).toBe('行程2段')
      expect(deriveResourceTag(5)).toBe('资源5项')
    })

    it('derives receivable and payable schedule tags', () => {
      const settled = new Map([['ar-1', 1000000]])
      expect(deriveReceivableTagFromSchedules([receivableSchedule], settled)).toBe('已收齐')
      expect(deriveReceivableTagFromSchedules([receivableSchedule], new Map())).toBe('应收已生成')

      const paid = new Map([['ap-1', 500000]])
      expect(derivePayableTagFromSchedules([payableSchedule], paid)).toBe('已付清')
      expect(derivePayableTagFromSchedules([payableSchedule], new Map())).toBe('应付已生成')
    })

    it('matches ider completionTags example', () => {
      const tags = deriveCompletionTags({
        sourceOrderCount: 3,
        segmentCount: 2,
        resourceCount: 5,
        schedules: [],
        settledByScheduleId: new Map(),
      })

      expect(tags).toEqual({
        sourceOrders: '客源3单',
        segments: '行程2段',
        resources: '资源5项',
        receivables: '应收未生成',
        payables: '应付未生成',
      })
    })
  })

  describe('isScheduleClosed', () => {
    it('treats cancelled schedules as closed', () => {
      expect(
        isScheduleClosed(
          { ...receivableSchedule, cancelledAt: new Date('2026-07-01') },
          0,
        ),
      ).toBe(true)
    })

    it('treats fully settled schedules as closed', () => {
      expect(isScheduleClosed(receivableSchedule, 1000000)).toBe(true)
      expect(isScheduleClosed(receivableSchedule, 500000)).toBe(false)
    })
  })

  describe('deriveIsFinanciallySettled', () => {
    it('returns false when there are no schedules', () => {
      expect(deriveIsFinanciallySettled([], new Map())).toBe(false)
    })

    it('returns true when all schedules are settled or cancelled', () => {
      const schedules = [receivableSchedule, payableSchedule]
      const settled = new Map([
        ['ar-1', 1000000],
        ['ap-1', 500000],
      ])
      expect(deriveIsFinanciallySettled(schedules, settled)).toBe(true)
    })
  })

  describe('buildDepartureReadModelAggregate', () => {
    it('computes obligation-layer verified and open-unsettled amounts', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 10,
          grossReceivableCents: 1000000,
          discountCents: 100000,
          netReceivableCents: 900000,
        },
        segmentCount: 2,
        resourceCount: 3,
        payableCents: 400000,
        schedules: [receivableSchedule, payableSchedule],
        settledByScheduleId: new Map([
          ['ar-1', 600000],
          ['ap-1', 200000],
        ]),
        unverifiedCash: { unverifiedIncomeCents: 0, unverifiedExpenseCents: 0 },
      })

      expect(aggregate.totalGuests).toBe(10)
      expect(aggregate.netReceivableCents).toBe(900000)
      expect(aggregate.payableCents).toBe(400000)
      expect(aggregate.estimatedMarginCents).toBe(500000)
      expect(aggregate.verifiedReceivableCents).toBe(600000)
      expect(aggregate.openUnsettledReceivableCents).toBe(400000)
      expect(aggregate.verifiedPayableCents).toBe(200000)
      expect(aggregate.openUnsettledPayableCents).toBe(300000)
      expect(aggregate.unverifiedIncomeCents).toBe(0)
      expect(aggregate.unverifiedExpenseCents).toBe(0)
      expect(aggregate.isFinanciallySettled).toBe(false)
    })

    it('keeps closed-node remaining visible on the node but out of open unsettled summary', () => {
      const closedPayable = {
        id: 'ap-closed',
        direction: PaymentScheduleDirection.payable,
        amountCents: 1_000_000,
        cancelledAt: new Date('2026-07-01'),
      }
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: EMPTY_SOURCE_ORDER_AGGREGATE,
        segmentCount: 1,
        resourceCount: 1,
        payableCents: 1_000_000,
        schedules: [closedPayable],
        settledByScheduleId: new Map([['ap-closed', 400_000]]),
        unverifiedCash: { unverifiedIncomeCents: 0, unverifiedExpenseCents: 0 },
      })

      expect(aggregate.verifiedPayableCents).toBe(400_000)
      expect(aggregate.openUnsettledPayableCents).toBe(0)
      expect(aggregate.isFinanciallySettled).toBe(true)
    })

    it('shows obligation gap and unverified cash together after revoking a 4000 verification', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 1,
          grossReceivableCents: 1_000_000,
          discountCents: 0,
          netReceivableCents: 1_000_000,
        },
        segmentCount: 1,
        resourceCount: 1,
        payableCents: 1_000_000,
        schedules: [receivableSchedule, { ...payableSchedule, amountCents: 1_000_000 }],
        settledByScheduleId: new Map([
          ['ar-1', 0],
          ['ap-1', 0],
        ]),
        unverifiedCash: {
          unverifiedIncomeCents: 400_000,
          unverifiedExpenseCents: 400_000,
        },
      })

      expect(aggregate.verifiedReceivableCents).toBe(0)
      expect(aggregate.openUnsettledReceivableCents).toBe(1_000_000)
      expect(aggregate.verifiedPayableCents).toBe(0)
      expect(aggregate.openUnsettledPayableCents).toBe(1_000_000)
      expect(aggregate.unverifiedIncomeCents).toBe(400_000)
      expect(aggregate.unverifiedExpenseCents).toBe(400_000)
    })

    it('returns empty aggregate defaults', () => {
      const aggregate = emptyDepartureReadModelAggregate()
      expect(aggregate.totalGuests).toBe(0)
      expect(aggregate.verifiedReceivableCents).toBe(0)
      expect(aggregate.openUnsettledReceivableCents).toBe(0)
      expect(aggregate.verifiedPayableCents).toBe(0)
      expect(aggregate.openUnsettledPayableCents).toBe(0)
      expect(aggregate.unverifiedIncomeCents).toBe(0)
      expect(aggregate.unverifiedExpenseCents).toBe(0)
      expect(aggregate.completionTags.receivables).toBe('应收未生成')
      expect(aggregate.isFinanciallySettled).toBe(false)
    })
  })

  describe('aggregateUnverifiedCashAmounts', () => {
    it('sums unallocated amounts only for non-voided transactions linked to the departure', () => {
      const cash = aggregateUnverifiedCashAmounts([
        {
          direction: TransactionDirection.inflow,
          amountCents: 400_000,
          allocatedAmountCents: 0,
          voidedAt: null,
        },
        {
          direction: TransactionDirection.outflow,
          amountCents: 500_000,
          allocatedAmountCents: 100_000,
          voidedAt: null,
        },
        {
          direction: TransactionDirection.outflow,
          amountCents: 200_000,
          allocatedAmountCents: 0,
          voidedAt: new Date('2026-07-01'),
        },
        {
          direction: TransactionDirection.inflow,
          amountCents: 50_000,
          allocatedAmountCents: 50_000,
          voidedAt: null,
        },
      ])

      expect(cash).toEqual({
        unverifiedIncomeCents: 400_000,
        unverifiedExpenseCents: 400_000,
      })
    })
  })
})
