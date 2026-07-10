import {
  CounterpartyType,
  PaymentScheduleSourceType,
} from '@xiaotuanbao/shared'
import { buildSourceOrderReceivablePaths } from './source-order-receivable-paths'

describe('buildSourceOrderReceivablePaths', () => {
  const base = {
    sourceOrderId: 'source-order-1',
    partnerId: 'partner-1',
    partnerName: '华东国旅 (上海)',
    displayName: '华东国旅 (上海) 7月14日发客',
  }

  it('carries partner name on customer settlement path for split collection', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      partnerCollectedCents: 300000,
      guestCollectCents: 700000,
    })

    const customer = paths.find(
      (path) =>
        path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
    )
    const guest = paths.find(
      (path) =>
        path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    expect(customer).toMatchObject({
      title: '客户补款',
      amountCents: 300000,
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: 'partner-1',
      counterpartyName: '华东国旅 (上海)',
    })
    expect(guest).toMatchObject({
      title: '游客代收',
      amountCents: 700000,
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: 'source-order-1',
      counterpartyName: '华东国旅 (上海) 7月14日发客',
    })
  })

  it('carries partner name on partner_settled-only customer settlement path', () => {
    const paths = buildSourceOrderReceivablePaths({
      ...base,
      partnerCollectedCents: 1000000,
      guestCollectCents: 0,
    })

    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: 'partner-1',
      counterpartyName: '华东国旅 (上海)',
    })
  })
})
