import { describe, expect, it } from 'vitest'
import { DepartureStatus } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { resolveDepartureNextAction } from './departure-next-action'

type DepartureInput = Parameters<typeof resolveDepartureNextAction>[0]['departure']

function makeOverviewStats(
  overrides: Partial<DepartureDetail['overviewStats']> = {},
): DepartureDetail['overviewStats'] {
  return {
    receivedCents: 0,
    openUnreceivedCents: 0,
    closedUnreceivedCents: 0,
    ungeneratedReceivableCents: 0,
    otherReceivableCents: 0,
    additionalIncomeNetCents: 0,
    settlementCollectionReceivedCents: 0,
    settlementCollectionReceivableCents: 0,
    guestCollectionReceivedCents: 0,
    guestCollectionAgreedCents: 0,
    estimatedRebateCents: 0,
    confirmedRebateCents: 0,
    rebatePaidCents: 0,
    rebateUnpaidCents: 0,
    confirmedPayableCents: 0,
    paidCents: 0,
    resourcePaidCents: 0,
    openUnpaidCents: 0,
    closedUnpaidCents: 0,
    ungeneratedPayableCents: 0,
    otherPayableCents: 0,
    resourcePayableDifferenceCents: 0,
    confirmedMarginCents: 0,
    incomeTransactionCents: 0,
    expenseTransactionCents: 0,
    cashNetInflowCents: 0,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    verifiedFromExternalCents: 0,
    verifiedToOtherDeparturesCents: 0,
    anomalies: [],
    ...overrides,
  }
}

function makeDeparture(overrides: Partial<DepartureInput> = {}): DepartureInput {
  return {
    status: DepartureStatus.EDITING,
    completionTags: {
      sourceOrders: '客源1单',
      segments: '行程1段',
      resources: '资源1项',
      receivables: '应收已生成',
      payables: '应付已生成',
    },
    overviewStats: makeOverviewStats(),
    isFinanciallySettled: false,
    sourceOrderCount: 1,
    segmentCount: 1,
    resourceCount: 1,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  }
}

describe('resolveDepartureNextAction', () => {
  describe('anomalies', () => {
    it('returns warning with receivables tab when overview has financial anomalies', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            anomalies: [
              {
                code: 'receivable_balance',
                expectedCents: 100_000,
                actualCents: 80_000,
                differenceCents: -20_000,
              },
            ],
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        title: '应收与结算金额不一致',
        description: '已生成应收合计 ¥800.00，结算金额合计 ¥1,000.00，少了 ¥200.00',
        action: { tab: 'receivables' },
      })
    })
  })

  describe('editing', () => {
    it('returns warning with sourceOrders tab when source orders are incomplete', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          completionTags: {
            sourceOrders: '客源未录入',
            segments: '行程1段',
            resources: '资源1项',
            receivables: '应收已生成',
            payables: '应付已生成',
          },
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'sourceOrders' },
      })
      expect(result?.title).toMatch(/客源/)
    })

    it('returns warning with execution tab when segments are incomplete', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          completionTags: {
            sourceOrders: '客源1单',
            segments: '行程未安排',
            resources: '资源1项',
            receivables: '应收已生成',
            payables: '应付已生成',
          },
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'execution' },
      })
    })

    it('returns info suggesting pending settlement when prep is complete and canWrite', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture(),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'info',
        title: '资料已就绪，可切换为待结算',
        action: {
          label: '切换为待结算',
          intent: 'pending_settlement',
        },
      })
    })

    it('returns null when prep is complete and cannot write', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture(),
        canWrite: false,
      })

      expect(result).toBeNull()
    })
  })

  describe('pending settlement', () => {
    it('prioritizes ungenerated receivables', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            ungeneratedReceivableCents: 50_000,
            ungeneratedPayableCents: 30_000,
            openUnreceivedCents: 100_000,
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'receivables' },
      })
      expect(result?.description).toMatch(/¥500\.00/)
    })

    it('prioritizes ungenerated payables when receivables are generated', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            ungeneratedPayableCents: 30_000,
            openUnpaidCents: 100_000,
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'payables' },
      })
    })

    it('surfaces open unreceived amounts before unverified income', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            openUnreceivedCents: 120_000,
            unverifiedIncomeCents: 50_000,
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'receivables' },
      })
    })

    it('surfaces open unpaid amounts', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            openUnpaidCents: 80_000,
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'payables' },
      })
    })

    it('surfaces unverified income when no open balances remain', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          overviewStats: makeOverviewStats({
            unverifiedIncomeCents: 40_000,
            unverifiedExpenseCents: 10_000,
          }),
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'warning',
        action: { tab: 'verifications' },
      })
    })

    it('returns success mark_settled when financially settled and canWrite', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({
          status: DepartureStatus.PENDING_SETTLEMENT,
          isFinanciallySettled: true,
        }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'success',
        action: { intent: 'mark_settled' },
      })
    })
  })

  describe('settled', () => {
    it('returns info with close intent when canWrite', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({ status: DepartureStatus.SETTLED }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'info',
        action: { intent: 'close' },
      })
    })

    it('returns info without action when cannot write', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({ status: DepartureStatus.SETTLED }),
        canWrite: false,
      })

      expect(result?.type).toBe('info')
      expect(result?.action).toBeUndefined()
    })
  })

  describe('closed', () => {
    it('returns unarchive intent when canWrite', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({ status: DepartureStatus.CLOSED }),
        canWrite: true,
      })

      expect(result).toMatchObject({
        type: 'info',
        action: { intent: 'unarchive' },
      })
    })

    it('returns open_history intent when cannot write', () => {
      const result = resolveDepartureNextAction({
        departure: makeDeparture({ status: DepartureStatus.CLOSED }),
        canWrite: false,
      })

      expect(result).toMatchObject({
        type: 'info',
        action: { intent: 'open_history' },
      })
    })
  })
})
