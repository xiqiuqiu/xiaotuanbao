import { PaymentScheduleDirection, TransactionDirection } from '@prisma/client'
import { emptyDepartureFinanceSnapshot } from '../finance/departure-finance-facade.service'
import { emptyDepartureFinanceObligationSummary } from '../finance/departure-finance-obligation-summary'
import {
  aggregateUnverifiedCashAmounts,
  buildDepartureReadModelAggregate,
  EMPTY_OVERVIEW_COLLECTION_STATS,
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
      expect(deriveReceivableTagFromSchedules([], new Map())).toBe('应收未提交')
      expect(derivePayableTagFromSchedules([], new Map())).toBe('应付未提交')
    })

    it('derives count tags', () => {
      expect(deriveSourceOrderTag(3)).toBe('客源3单')
      expect(deriveSegmentTag(2)).toBe('行程2段')
      expect(deriveResourceTag(5)).toBe('资源5项')
    })

    it('derives receivable and payable schedule tags', () => {
      const settled = new Map([['ar-1', 1000000]])
      expect(deriveReceivableTagFromSchedules([receivableSchedule], settled)).toBe('已收齐')
      expect(deriveReceivableTagFromSchedules([receivableSchedule], new Map())).toBe('应收已提交')

      const paid = new Map([['ap-1', 500000]])
      expect(derivePayableTagFromSchedules([payableSchedule], paid)).toBe('已付清')
      expect(derivePayableTagFromSchedules([payableSchedule], new Map())).toBe('应付已提交')
    })

    it('does not label closed schedules with remaining amounts as fully settled', () => {
      const cancelledAt = new Date('2026-07-01')

      expect(
        deriveReceivableTagFromSchedules(
          [{ ...receivableSchedule, cancelledAt }],
          new Map([['ar-1', 400_000]]),
        ),
      ).toBe('应收已提交')
      expect(
        derivePayableTagFromSchedules(
          [{ ...payableSchedule, cancelledAt }],
          new Map([['ap-1', 200_000]]),
        ),
      ).toBe('应付已提交')
    })

    it('matches ider completionTags example', () => {
      const tags = deriveCompletionTags({
        sourceOrderCount: 3,
        segmentCount: 2,
        resourceCount: 5,
        obligationSummary: emptyDepartureFinanceObligationSummary(),
      })

      expect(tags).toEqual({
        sourceOrders: '客源3单',
        segments: '行程2段',
        resources: '资源5项',
        receivables: '应收未提交',
        payables: '应付未提交',
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

    it('keeps closed schedules with remaining amounts inside the settlement gate', () => {
      const cancelledAt = new Date('2026-07-01')
      const schedules = [
        { ...receivableSchedule, cancelledAt },
        { ...payableSchedule, cancelledAt },
      ]
      const partiallySettled = new Map([
        ['ar-1', 400_000],
        ['ap-1', 200_000],
      ])

      expect(deriveIsFinanciallySettled(schedules, partiallySettled)).toBe(true)
    })
  })

  describe('buildDepartureReadModelAggregate', () => {
    it('aliases flat fields and tags from Facade obligationSummary (no schedule dump)', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 10,
          grossReceivableCents: 1_000_000,
          fareAdjustmentNetCents: 0,
          discountCents: 100_000,
          netReceivableCents: 900_000,
        },
        segmentCount: 2,
        resourceCount: 3,
        payableCents: 400_000,
        obligationSummary: {
          ...emptyDepartureFinanceObligationSummary(),
          verifiedReceivableCents: 600_000,
          openUnsettledReceivableCents: 400_000,
          verifiedPayableCents: 200_000,
          openUnsettledPayableCents: 300_000,
          hasReceivableSchedule: true,
          allReceivablesAmountSettled: false,
          hasPayableSchedule: true,
          allPayablesAmountSettled: false,
          isFinanciallySettled: false,
        },
      })

      expect(aggregate.totalGuests).toBe(10)
      expect(aggregate.netReceivableCents).toBe(900_000)
      expect(aggregate.payableCents).toBe(400_000)
      expect(aggregate.estimatedMarginCents).toBe(500_000)
      expect(aggregate.verifiedReceivableCents).toBe(600_000)
      expect(aggregate.openUnsettledReceivableCents).toBe(400_000)
      expect(aggregate.verifiedPayableCents).toBe(200_000)
      expect(aggregate.openUnsettledPayableCents).toBe(300_000)
      expect(aggregate.unverifiedIncomeCents).toBe(0)
      expect(aggregate.unverifiedExpenseCents).toBe(0)
      expect(aggregate.completionTags.receivables).toBe('应收已提交')
      expect(aggregate.completionTags.payables).toBe('应付已提交')
      expect(aggregate.isFinanciallySettled).toBe(false)
    })

    it('keeps closed-node remaining visible on the node but out of open unsettled summary', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: EMPTY_SOURCE_ORDER_AGGREGATE,
        segmentCount: 1,
        resourceCount: 1,
        payableCents: 1_000_000,
        obligationSummary: {
          ...emptyDepartureFinanceObligationSummary(),
          verifiedPayableCents: 400_000,
          openUnsettledPayableCents: 0,
          hasPayableSchedule: true,
          allPayablesAmountSettled: false,
          isFinanciallySettled: true,
        },
      })

      expect(aggregate.verifiedPayableCents).toBe(400_000)
      expect(aggregate.openUnsettledPayableCents).toBe(0)
      expect(aggregate.isFinanciallySettled).toBe(true)
      expect(aggregate.completionTags.payables).toBe('应付已提交')
    })

    it('shows obligation gap and unverified cash together after revoking a 4000 verification', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 1,
          grossReceivableCents: 1_000_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 1_000_000,
        },
        segmentCount: 1,
        resourceCount: 1,
        payableCents: 1_000_000,
        obligationSummary: {
          ...emptyDepartureFinanceObligationSummary(),
          openUnsettledReceivableCents: 1_000_000,
          openUnsettledPayableCents: 1_000_000,
          unverifiedIncomeCents: 400_000,
          unverifiedExpenseCents: 400_000,
          hasReceivableSchedule: true,
          allReceivablesAmountSettled: false,
          hasPayableSchedule: true,
          allPayablesAmountSettled: false,
        },
      })

      expect(aggregate.verifiedReceivableCents).toBe(0)
      expect(aggregate.openUnsettledReceivableCents).toBe(1_000_000)
      expect(aggregate.verifiedPayableCents).toBe(0)
      expect(aggregate.openUnsettledPayableCents).toBe(1_000_000)
      expect(aggregate.unverifiedIncomeCents).toBe(400_000)
      expect(aggregate.unverifiedExpenseCents).toBe(400_000)
    })

    it('flags receivable_balance when closed top-up still carries full S after rebate flip', () => {
      // 浏览器症状最小化：S=5000、Guest 已收 6200、关闭补款未收仍 5000、预估返利 1200
      // → 组成 6200+5000-1200=10000，应为 5000，差额 +5000。
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 1,
          grossReceivableCents: 500_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 500_000,
        },
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
        financeSnapshot: {
          ...emptyDepartureFinanceSnapshot(),
          sourceReceivableReceivedCents: 620_000,
          sourceReceivableClosedUnreceivedCents: 500_000,
          confirmedRebateCents: 120_000,
          rebateUnpaidCents: 120_000,
        },
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 0,
          generatedResourceAgreedCents: 0,
          additionalIncomeNetCents: 0,
          collectionStats: {
            settlementCollectionReceivedCents: 500_000,
            settlementCollectionReceivableCents: 500_000,
            guestCollectionReceivedCents: 620_000,
            guestCollectionAgreedCents: 620_000,
            estimatedRebateCents: 120_000,
          },
        },
      })

      expect(aggregate.overviewStats.anomalies).toEqual([
        {
          code: 'receivable_balance',
          expectedCents: 500_000,
          actualCents: 1_000_000,
          differenceCents: 500_000,
        },
      ])
    })

    it('keeps receivable conservation when obsolete top-up closedUnreceived is 0', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 1,
          grossReceivableCents: 500_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 500_000,
        },
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
        financeSnapshot: {
          ...emptyDepartureFinanceSnapshot(),
          sourceReceivableReceivedCents: 620_000,
          sourceReceivableClosedUnreceivedCents: 0,
          confirmedRebateCents: 120_000,
          rebateUnpaidCents: 120_000,
        },
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 0,
          generatedResourceAgreedCents: 0,
          additionalIncomeNetCents: 0,
          collectionStats: {
            settlementCollectionReceivedCents: 500_000,
            settlementCollectionReceivableCents: 500_000,
            guestCollectionReceivedCents: 620_000,
            guestCollectionAgreedCents: 620_000,
            estimatedRebateCents: 120_000,
          },
        },
      })

      expect(aggregate.overviewStats.anomalies).toEqual([])
    })

    it('exposes resource-paid and external-verification aggregates on overviewStats', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 4,
          grossReceivableCents: 1_000_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 1_000_000,
        },
        segmentCount: 1,
        resourceCount: 2,
        payableCents: 600_000,
        financeSnapshot: {
          ...emptyDepartureFinanceSnapshot(),
          confirmedPayableCents: 500_000,
          paidCents: 450_000,
          resourcePayableCents: 400_000,
          resourcePaidCents: 380_000,
          otherPayableCents: 100_000,
          confirmedRebateCents: 80_000,
          rebatePaidCents: 30_000,
          rebateUnpaidCents: 50_000,
          verifiedFromExternalCents: 70_000,
          verifiedToOtherDeparturesCents: 20_000,
        },
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 1_000_000,
          generatedResourceAgreedCents: 400_000,
          additionalIncomeNetCents: 30_000,
          collectionStats: {
            settlementCollectionReceivedCents: 400_000,
            settlementCollectionReceivableCents: 1_000_000,
            guestCollectionReceivedCents: 400_000,
            guestCollectionAgreedCents: 1_000_000,
            estimatedRebateCents: 0,
          },
        },
      })

      // 主付款进度分子：只含资源应付的有效核销，独立于全部已付。
      expect(aggregate.overviewStats.resourcePaidCents).toBe(380_000)
      expect(aggregate.overviewStats.paidCents).toBe(450_000)
      expect(aggregate.overviewStats.settlementCollectionReceivedCents).toBe(400_000)
      expect(aggregate.overviewStats.guestCollectionAgreedCents).toBe(1_000_000)
      expect(aggregate.overviewStats.confirmedRebateCents).toBe(80_000)
      expect(aggregate.overviewStats.rebatePaidCents).toBe(30_000)
      expect(aggregate.overviewStats.additionalIncomeNetCents).toBe(30_000)
      expect(aggregate.overviewStats.rebateUnpaidCents).toBe(50_000)
      // 当前毛利含增收：收入合计 1_030_000 − 成本合计 600_000
      expect(aggregate.estimatedMarginCents).toBe(430_000)
      // 外部核销含他团与未归属流水，合并为一个口径。
      expect(aggregate.overviewStats.verifiedFromExternalCents).toBe(70_000)
      expect(aggregate.overviewStats.verifiedToOtherDeparturesCents).toBe(20_000)
    })

    it('includes additional income net in estimatedMarginCents (ADR-0038)', () => {
      // 收入合计 = 结算应收 900_000 + 增收净收益 80_000；当前毛利 = 980_000 − 400_000
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 2,
          grossReceivableCents: 900_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 900_000,
        },
        segmentCount: 0,
        resourceCount: 1,
        payableCents: 400_000,
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 900_000,
          generatedResourceAgreedCents: 400_000,
          additionalIncomeNetCents: 80_000,
          collectionStats: {
            ...EMPTY_OVERVIEW_COLLECTION_STATS,
            settlementCollectionReceivableCents: 900_000,
          },
        },
      })

      expect(aggregate.estimatedMarginCents).toBe(580_000)
      expect(aggregate.overviewStats.additionalIncomeNetCents).toBe(80_000)
    })

    it('exposes B-overview todo and cost-split fields from bSupplement (#277)', () => {
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 2,
          totalGuests: 6,
          grossReceivableCents: 300_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 300_000,
        },
        segmentCount: 2,
        resourceCount: 2,
        payableCents: 100_000,
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 200_000,
          generatedResourceAgreedCents: 0,
          additionalIncomeNetCents: 42_000,
          collectionStats: {
            ...EMPTY_OVERVIEW_COLLECTION_STATS,
            settlementCollectionReceivableCents: 300_000,
          },
          bSupplement: {
            guestList: { recorded: 3, planned: 6, missing: 3 },
            pendingReceivableCount: 1,
            pendingPayableCount: 2,
            unassignedSegmentCount: 1,
            overdueAccountCount: 1,
            resourceCostCents: 70_000,
            outsourceCostCents: 30_000,
            additionalIncomeGrossCents: 50_000,
            additionalIncomeExpenseCents: 8_000,
            customerTopUpCents: 5_000,
            customerRebateCents: 3_000,
          },
        },
      })

      expect(aggregate.overviewStats.guestListMissing).toBe(3)
      expect(aggregate.overviewStats.guestListRecorded).toBe(3)
      expect(aggregate.overviewStats.guestListPlanned).toBe(6)
      expect(aggregate.overviewStats.pendingReceivableCount).toBe(1)
      expect(aggregate.overviewStats.pendingPayableCount).toBe(2)
      expect(aggregate.overviewStats.unassignedSegmentCount).toBe(1)
      expect(aggregate.overviewStats.overdueAccountCount).toBe(1)
      expect(aggregate.overviewStats.resourceCostCents).toBe(70_000)
      expect(aggregate.overviewStats.outsourceCostCents).toBe(30_000)
      expect(aggregate.overviewStats.additionalIncomeGrossCents).toBe(50_000)
      expect(aggregate.overviewStats.additionalIncomeExpenseCents).toBe(8_000)
      expect(aggregate.overviewStats.customerTopUpCents).toBe(5_000)
    })

    it('computes estimatedMarginCents when revenue total is zero', () => {
      // 收入合计 = 0 + 0；当前毛利 = 0 − 250_000（毛利率分母为零由 UI 处理）
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: EMPTY_SOURCE_ORDER_AGGREGATE,
        segmentCount: 0,
        resourceCount: 1,
        payableCents: 250_000,
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 0,
          generatedResourceAgreedCents: 250_000,
          additionalIncomeNetCents: 0,
          collectionStats: EMPTY_OVERVIEW_COLLECTION_STATS,
        },
      })

      expect(aggregate.netReceivableCents).toBe(0)
      expect(aggregate.overviewStats.additionalIncomeNetCents).toBe(0)
      expect(aggregate.estimatedMarginCents).toBe(-250_000)
    })

    it('keeps negative estimatedMarginCents when costs exceed revenue total', () => {
      // 收入合计 = 100_000 + 20_000；当前毛利 = 120_000 − 500_000
      const aggregate = buildDepartureReadModelAggregate({
        sourceOrders: {
          count: 1,
          totalGuests: 1,
          grossReceivableCents: 100_000,
          fareAdjustmentNetCents: 0,
          discountCents: 0,
          netReceivableCents: 100_000,
        },
        segmentCount: 0,
        resourceCount: 1,
        payableCents: 500_000,
        overviewSourceFacts: {
          sourceReceivableUngeneratedCents: 100_000,
          generatedResourceAgreedCents: 500_000,
          additionalIncomeNetCents: 20_000,
          collectionStats: {
            ...EMPTY_OVERVIEW_COLLECTION_STATS,
            settlementCollectionReceivableCents: 100_000,
          },
        },
      })

      expect(aggregate.estimatedMarginCents).toBe(-380_000)
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
      expect(aggregate.completionTags.receivables).toBe('应收未提交')
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
