import { CounterpartyType } from '../enums/counterparty-type.enum'
import { PaymentScheduleSourceType } from '../enums/payment-schedule-source-type.enum'
import { SourceOrderCollectionMode } from '../enums/source-order-collection-mode.enum'
import { classifySourceOrderInitialReceivables } from './classify-source-order-initial-receivables'
import { buildSourceOrderReceivablePaths } from './source-order-receivable-paths'

const source = {
  sourceOrderId: 'so-1',
  partnerId: 'partner-1',
  partnerName: '华东旅行社',
  displayName: '华东旅行社客源',
}

function pathsOf(
  collectionMode: SourceOrderCollectionMode,
  depositCents: number,
  balanceCents: number,
  netReceivableCents: number,
) {
  return buildSourceOrderReceivablePaths({
    ...source,
    collectionMode,
    depositCents,
    balanceCents,
    netReceivableCents,
  }).filter((path) => path.amountCents > 0)
}

function schedule(
  id: string,
  sourceType: PaymentScheduleSourceType,
  amountCents: number,
  flags?: { cancelledAt?: string | null; voidedAt?: string | null },
) {
  return {
    id,
    sourceType,
    amountCents,
    cancelledAt: flags?.cancelledAt ?? null,
    voidedAt: flags?.voidedAt ?? null,
  }
}

describe('classifySourceOrderInitialReceivables #451', () => {
  it('treats partner-settled 61,000 as one customer top-up path', () => {
    const paths = pathsOf(SourceOrderCollectionMode.PARTNER_SETTLED, 0, 0, 6_100_000)

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 6_100_000,
        title: '客户补款',
        counterpartyType: CounterpartyType.PARTNER,
        counterpartyId: 'partner-1',
        counterpartyName: '华东旅行社',
      },
    ])
    expect(classifySourceOrderInitialReceivables({ expectedPaths: paths, existingSchedules: [] })).toEqual({
      status: 'ready',
      paths,
    })
  })

  it('does not generate a zero-amount customer-settlement receivable', () => {
    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: pathsOf(SourceOrderCollectionMode.PARTNER_SETTLED, 0, 0, 0),
        existingSchedules: [],
      }),
    ).toEqual({ status: 'no_positive_paths' })
  })

  it('lists split deposit/balance as balance plus customer top-up, never a deposit node', () => {
    const paths = pathsOf(SourceOrderCollectionMode.SPLIT, 2_000_000, 4_100_000, 6_100_000)

    expect(paths.map((path) => [path.title, path.amountCents])).toEqual([
      ['尾款代收', 4_100_000],
      ['客户补款', 2_000_000],
    ])
    expect(classifySourceOrderInitialReceivables({ expectedPaths: paths, existingSchedules: [] })).toEqual({
      status: 'ready',
      paths,
    })
  })

  it('keeps only the guest balance when split over-collection would otherwise imply a rebate', () => {
    const paths = pathsOf(SourceOrderCollectionMode.SPLIT, 8_000_000, 6_500_000, 6_100_000)

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        amountCents: 6_500_000,
        title: '尾款代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'so-1',
        counterpartyName: '华东旅行社客源',
      },
    ])
    expect(classifySourceOrderInitialReceivables({ expectedPaths: paths, existingSchedules: [] }).status).toBe(
      'ready',
    )
  })

  it('adds customer top-up beside a guest-only deposit when S exceeds G', () => {
    const paths = pathsOf(SourceOrderCollectionMode.GUEST_ONLY, 1_000_000, 0, 6_100_000)

    expect(paths.map((path) => [path.title, path.amountCents])).toEqual([
      ['定金代收', 1_000_000],
      ['客户补款', 5_100_000],
    ])
  })

  it('returns existing ids when every applicable path already matches', () => {
    const paths = pathsOf(SourceOrderCollectionMode.SPLIT, 2_000_000, 4_100_000, 6_100_000)

    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: paths,
        existingSchedules: [
          schedule('sch-balance', PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION, 4_100_000),
          schedule('sch-topup', PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT, 2_000_000),
        ],
      }),
    ).toEqual({
      status: 'complete_and_consistent',
      scheduleIds: ['sch-balance', 'sch-topup'],
    })
  })

  it('refuses to backfill a missing path', () => {
    const paths = pathsOf(SourceOrderCollectionMode.SPLIT, 2_000_000, 4_100_000, 6_100_000)

    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: paths,
        existingSchedules: [
          schedule('sch-balance', PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION, 4_100_000),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'incomplete',
      message: '该客源单应收节点不完整，不能通过助手补建缺失路径。请在普通业务入口处理。',
    })
  })

  it('refuses cancelled history instead of recreating nodes', () => {
    const paths = pathsOf(SourceOrderCollectionMode.PARTNER_SETTLED, 0, 0, 6_100_000)

    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: paths,
        existingSchedules: [
          schedule('sch-1', PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT, 6_100_000, {
            cancelledAt: '2026-09-01T00:00:00.000Z',
          }),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'cancelled',
      message: '该客源单存在已取消的应收节点，不能通过助手补建或恢复。请在普通业务入口处理。',
    })
  })

  it('refuses voided history instead of overwriting it', () => {
    const paths = pathsOf(SourceOrderCollectionMode.PARTNER_SETTLED, 0, 0, 6_100_000)

    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: paths,
        existingSchedules: [
          schedule('sch-1', PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT, 6_100_000, {
            voidedAt: '2026-09-01T00:00:00.000Z',
          }),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'voided',
      message: '该客源单存在已作废的应收节点，不能通过助手覆盖。请在普通业务入口处理。',
    })
  })

  it('refuses an amount mismatch against the current convention', () => {
    const paths = pathsOf(SourceOrderCollectionMode.PARTNER_SETTLED, 0, 0, 6_100_000)

    expect(
      classifySourceOrderInitialReceivables({
        expectedPaths: paths,
        existingSchedules: [
          schedule('sch-1', PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT, 5_000_000),
        ],
      }),
    ).toEqual({
      status: 'anomaly',
      code: 'amount_mismatch',
      message: '该客源单已有应收金额与当前约定不一致，不能通过助手覆盖。请在普通业务入口处理。',
    })
  })
})
