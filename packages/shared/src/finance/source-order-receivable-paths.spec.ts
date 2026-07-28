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

  it('guest_only with G>S: creates deposit + balance Guest paths and no top-up/rebate', () => {
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

  it('guest_only with S>G: adds customer top-up at generate time', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 100000,
      balanceCents: 200000,
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
        amountCents: 200000,
        title: '尾款代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'source-order-1',
        counterpartyName: '华东国旅 (上海) 7月14日发客',
      },
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 200000,
        title: '客户补款',
        counterpartyType: CounterpartyType.PARTNER,
        counterpartyId: 'partner-1',
        counterpartyName: '华东国旅 (上海)',
      },
    ])
  })

  it('split with G>=S: creates only balance Guest path (no top-up)', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.SPLIT,
      depositCents: 300000,
      balanceCents: 700000,
      netReceivableCents: 700000,
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

  it('split with S>G: creates balance Guest + customer top-up (ADR-0033 2026-07-28)', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      collectionMode: SourceOrderCollectionMode.SPLIT,
      depositCents: 3_300_000,
      balanceCents: 20_000,
      netReceivableCents: 1_970_000,
    })

    expect(paths).toEqual([
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        amountCents: 20_000,
        title: '尾款代收',
        counterpartyType: CounterpartyType.GUEST,
        counterpartyId: 'source-order-1',
        counterpartyName: '华东国旅 (上海) 7月14日发客',
      },
      {
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: 1_950_000,
        title: '客户补款',
        counterpartyType: CounterpartyType.PARTNER,
        counterpartyId: 'partner-1',
        counterpartyName: '华东国旅 (上海)',
      },
    ])
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
    ).toBe(2)

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
