import { PaymentScheduleSourceType, ResourceKind } from '@xiaotuanbao/shared'
import {
  buildDepartureOverviewBSupplement,
  countOverdueSchedules,
  countPendingPayableResources,
  countPendingReceivableSourceOrders,
  countUnassignedSegments,
  deriveCollectionHints,
  deriveGuestListTodo,
  deriveIncomeBreakdown,
  splitResourceAndOutsourceCost,
} from './departure-overview-b-supplement'

describe('departure-overview-b-supplement', () => {
  describe('待办：客名单', () => {
    it('已录/计划/缺少人数 — 计划 5、已录 2 时缺少 3', () => {
      expect(
        deriveGuestListTodo([
          { guestCount: 3, recordedGuestCount: 1 },
          { guestCount: 2, recordedGuestCount: 1 },
        ]),
      ).toEqual({ recorded: 2, planned: 5, missing: 3 })
    })

    it('已录超过计划时缺少为 0', () => {
      expect(deriveGuestListTodo([{ guestCount: 2, recordedGuestCount: 4 }])).toEqual({
        recorded: 4,
        planned: 2,
        missing: 0,
      })
    })
  })

  describe('待办：待提交应收/应付、未安排、逾期', () => {
    it('待提交应收：无节点且净应收>0 的客源单条数', () => {
      expect(
        countPendingReceivableSourceOrders([
          { hasPaymentSchedule: false, netReceivableCents: 100_000 },
          { hasPaymentSchedule: true, netReceivableCents: 200_000 },
          { hasPaymentSchedule: false, netReceivableCents: 0 },
        ]),
      ).toBe(1)
    })

    it('待提交应付：段内未生成数 + 发团级未生成且金额>0', () => {
      expect(
        countPendingPayableResources({
          segments: [
            { resourceCount: 3, payableGeneratedCount: 1 },
            { resourceCount: 0, payableGeneratedCount: 0 },
          ],
          departureResources: [
            { hasPaymentSchedule: false, amountCents: 50_000 },
            { hasPaymentSchedule: false, amountCents: 0 },
            { hasPaymentSchedule: true, amountCents: 80_000 },
          ],
        }),
      ).toBe(3)
    })

    it('未安排资源：无资源的段数', () => {
      expect(
        countUnassignedSegments([
          { resourceCount: 0 },
          { resourceCount: 2 },
          { resourceCount: 0 },
        ]),
      ).toBe(2)
    })

    it('逾期账款：未结清且到期日早于今天、未关闭未作废', () => {
      expect(
        countOverdueSchedules(
          [
            {
              unsettledAmountCents: 10_000,
              dueDate: '2026-01-01',
              cancelledAt: null,
              voidedAt: null,
            },
            {
              unsettledAmountCents: 10_000,
              dueDate: '2099-01-01',
              cancelledAt: null,
              voidedAt: null,
            },
            {
              unsettledAmountCents: 0,
              dueDate: '2026-01-01',
              cancelledAt: null,
              voidedAt: null,
            },
            {
              unsettledAmountCents: 10_000,
              dueDate: '2026-01-01',
              cancelledAt: '2026-02-01T00:00:00.000Z',
              voidedAt: null,
            },
          ],
          '2026-08-05',
        ),
      ).toBe(1)
    })
  })

  describe('构成：成本拆分与增收', () => {
    it('优先按资源行种类拆分资源成本 vs 拼出成本（含发团级）', () => {
      expect(
        splitResourceAndOutsourceCost({
          segments: [{ resourceCount: 2, outsourceCount: 1, resourceAmountCents: 100_000 }],
          departureResources: [
            { resourceKind: ResourceKind.HOTEL, amountCents: 40_000 },
            { resourceKind: ResourceKind.OUTSOURCE, amountCents: 20_000 },
          ],
          segmentResourceRows: [
            { resourceKind: ResourceKind.TRANSPORT, amountCents: 60_000 },
            { resourceKind: ResourceKind.OUTSOURCE, amountCents: 40_000 },
          ],
        }),
      ).toEqual({ resourceCostCents: 100_000, outsourceCostCents: 60_000 })
    })

    it('无资源行时按段内拼出占比估算', () => {
      expect(
        splitResourceAndOutsourceCost({
          segments: [
            { resourceCount: 2, outsourceCount: 1, resourceAmountCents: 100_000 },
            { resourceCount: 0, outsourceCount: 0, resourceAmountCents: 0 },
          ],
          departureResources: [{ resourceKind: ResourceKind.GUIDE, amountCents: 30_000 }],
        }),
      ).toEqual({ resourceCostCents: 80_000, outsourceCostCents: 50_000 })
    })

    it('增收 gross/expense 来自台账合计', () => {
      expect(
        deriveIncomeBreakdown({ amountCentsTotal: 90_000, commissionCentsTotal: 10_000 }),
      ).toEqual({
        additionalIncomeGrossCents: 90_000,
        additionalIncomeExpenseCents: 10_000,
      })
    })
  })

  describe('收款提示', () => {
    it('客户待补款取客户结算路径未结清合计；待返客户复用 rebateUnpaid', () => {
      expect(
        deriveCollectionHints({
          receivables: [
            {
              sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
              unsettledAmountCents: 25_000,
            },
            {
              sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
              unsettledAmountCents: 80_000,
            },
          ],
          rebateUnpaidCents: 12_000,
        }),
      ).toEqual({ customerTopUpCents: 25_000, customerRebateCents: 12_000 })
    })
  })

  describe('buildDepartureOverviewBSupplement', () => {
    it('聚合两个待办非零场景与成本拆分', () => {
      const supplement = buildDepartureOverviewBSupplement({
        sourceOrders: [
          {
            guestCount: 4,
            recordedGuestCount: 1,
            hasPaymentSchedule: false,
            netReceivableCents: 200_000,
          },
          {
            guestCount: 2,
            recordedGuestCount: 2,
            hasPaymentSchedule: true,
            netReceivableCents: 100_000,
          },
        ],
        segments: [
          { resourceCount: 0, payableGeneratedCount: 0, outsourceCount: 0, resourceAmountCents: 0 },
          {
            resourceCount: 2,
            payableGeneratedCount: 0,
            outsourceCount: 1,
            resourceAmountCents: 100_000,
          },
        ],
        departureResources: [],
        receivables: [
          {
            unsettledAmountCents: 5_000,
            dueDate: '2026-01-01',
            cancelledAt: null,
            voidedAt: null,
            sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          },
        ],
        payables: [],
        income: { amountCentsTotal: 50_000, commissionCentsTotal: 8_000 },
        rebateUnpaidCents: 3_000,
        segmentResourceRows: [
          { resourceKind: ResourceKind.TRANSPORT, amountCents: 70_000 },
          { resourceKind: ResourceKind.OUTSOURCE, amountCents: 30_000 },
        ],
        today: '2026-08-05',
      })

      expect(supplement.guestList).toEqual({ recorded: 3, planned: 6, missing: 3 })
      expect(supplement.pendingReceivableCount).toBe(1)
      expect(supplement.pendingPayableCount).toBe(2)
      expect(supplement.unassignedSegmentCount).toBe(1)
      expect(supplement.overdueAccountCount).toBe(1)
      expect(supplement.resourceCostCents).toBe(70_000)
      expect(supplement.outsourceCostCents).toBe(30_000)
      expect(supplement.additionalIncomeGrossCents).toBe(50_000)
      expect(supplement.additionalIncomeExpenseCents).toBe(8_000)
      expect(supplement.customerTopUpCents).toBe(5_000)
      expect(supplement.customerRebateCents).toBe(3_000)
    })
  })
})
