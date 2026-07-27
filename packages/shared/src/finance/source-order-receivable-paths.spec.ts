import { CounterpartyType } from '../enums/counterparty-type.enum'
import { PaymentScheduleSourceType } from '../enums/payment-schedule-source-type.enum'
import { SourceOrderCollectionMode } from '../enums/source-order-collection-mode.enum'
import {
  buildSourceOrderReceivablePaths,
  countSourceOrderReceivablePaths,
} from './source-order-receivable-paths'

describe('buildSourceOrderReceivablePaths', () => {
  const base = {
    sourceOrderId: 'source-order-1',
    partnerId: 'partner-1',
    partnerName: '华东国旅 (上海)',
    displayName: '华东国旅 (上海) 7月14日发客',
  }

  it('guest_only: creates deposit + balance Guest paths and no customer/rebate', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 100000,
      balanceCents: 600000,
      netReceivableCents: 500000,
    })

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
        amountCents: 100000,
        title: '定金代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'source-order-1',
        counterpartyName: '华东国旅 (上海) 7月14日发客',
      },
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        amountCents: 600000,
        title: '尾款代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'source-order-1',
        counterpartyName: '华东国旅 (上海) 7月14日发客',
      },
    ])
  })

  it('guest_only: skips zero-amount periods', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 0,
      balanceCents: 500000,
      netReceivableCents: 500000,
    })

    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      amountCents: 500000,
      title: '尾款代收',
    })
  })

  it('split: creates only balance Guest path; no deposit and no customer top-up', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.SPLIT,
      depositCents: 300000,
      balanceCents: 700000,
      netReceivableCents: 1000000,
    })

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        amountCents: 700000,
        title: '尾款代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'source-order-1',
        counterpartyName: '华东国旅 (上海) 7月14日发客',
      },
    ])
  })

  it('partner_settled: creates customer settlement path for S with no Guest paths', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.PARTNER_SETTLED,
      depositCents: 0,
      balanceCents: 0,
      netReceivableCents: 1000000,
    })

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 1000000,
        title: '客户补款',
        counterpartyType: CounterpartyType.PARTNER,
        counterpartyId: 'partner-1',
        counterpartyName: '华东国旅 (上海)',
      },
    ])
  })

  it('guest_only with G>S still creates only Guest paths (no rebate payable)', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 200000,
      balanceCents: 5800000,
      netReceivableCents: 500000,
    })

    expect(paths.map((path) => path.sourceType)).toEqual([
      PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
      PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
    ])
    expect(
      paths.some(
        (path) =>
          path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      ),
    ).toBe(false)
  })
})

describe('countSourceOrderReceivablePaths', () => {
  it('matches generated path counts for each collection mode', () => {
    expect(
      countSourceOrderReceivablePaths({
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositCents: 100000,
        balanceCents: 600000,
        netReceivableCents: 500000,
      }),
    ).toBe(2)

    expect(
      countSourceOrderReceivablePaths({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 300000,
        balanceCents: 700000,
        netReceivableCents: 1000000,
      }),
    ).toBe(1)

    expect(
      countSourceOrderReceivablePaths({
        collectionMode: SourceOrderCollectionMode.PARTNER_SETTLED,
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1000000,
      }),
    ).toBe(1)
  })
})
