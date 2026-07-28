import {
  CounterpartyType,
  PaymentScheduleDirection,
  PaymentScheduleSourceType,
} from '@xiaotuanbao/shared'
import {
  assertGuestNodesReadyForSettlement,
  buildActualCollectionSettlementPaths,
  buildObsoleteSettlementPathCloseData,
  OBSOLETE_SETTLEMENT_PATH_CANCEL_REASON,
} from './source-order-actual-collection-settlement'

describe('buildActualCollectionSettlementPaths', () => {
  const base = {
    sourceOrderId: 'source-order-1',
    partnerId: 'partner-1',
    partnerName: '华东国旅 (上海)',
  }

  it.each([
    { g: 600000, topUp: 0, rebate: 100000 },
    { g: 100000, topUp: 400000, rebate: 0 },
    { g: 20000, topUp: 480000, rebate: 0 },
  ])(
    'S=5000 with G实收=$g → topUp=$topUp rebate=$rebate',
    ({ g, topUp, rebate }) => {
      const paths = buildActualCollectionSettlementPaths({
        ...base,
        netReceivableCents: 500000,
        actualGuestCollectedCents: g,
      })

      const topUpPath = paths.find(
        (path) =>
          path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      )
      const rebatePath = paths.find(
        (path) => path.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
      )

      if (topUp > 0) {
        expect(topUpPath).toEqual({
          direction: PaymentScheduleDirection.RECEIVABLE,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          amountCents: topUp,
          title: '客户补款',
          counterpartyType: CounterpartyType.PARTNER,
          counterpartyId: 'partner-1',
          counterpartyName: '华东国旅 (上海)',
        })
      } else {
        expect(topUpPath).toBeUndefined()
      }

      if (rebate > 0) {
        expect(rebatePath).toEqual({
          direction: PaymentScheduleDirection.PAYABLE,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
          amountCents: rebate,
          title: '返利',
          counterpartyType: CounterpartyType.PARTNER,
          counterpartyId: 'partner-1',
          counterpartyName: '华东国旅 (上海)',
        })
      } else {
        expect(rebatePath).toBeUndefined()
      }
    },
  )

  it('does not create paths when G实收 equals S', () => {
    expect(
      buildActualCollectionSettlementPaths({
        ...base,
        netReceivableCents: 500000,
        actualGuestCollectedCents: 500000,
      }),
    ).toEqual([])
  })
})

describe('buildObsoleteSettlementPathCloseData', () => {
  it('sets amountCents to settled so closed unreceived becomes 0', () => {
    const now = new Date('2026-07-28T00:00:00.000Z')
    expect(
      buildObsoleteSettlementPathCloseData({ settledAmountCents: 0, now }),
    ).toEqual({
      cancelledAt: now,
      cancelReason: OBSOLETE_SETTLEMENT_PATH_CANCEL_REASON,
      amountCents: 0,
    })
  })

  it('keeps any already-settled amount when closing an obsolete path', () => {
    expect(
      buildObsoleteSettlementPathCloseData({ settledAmountCents: 100_000 }).amountCents,
    ).toBe(100_000)
  })
})

describe('assertGuestNodesReadyForSettlement', () => {
  it('allows settlement when all guest nodes are settled', () => {
    expect(() =>
      assertGuestNodesReadyForSettlement({
        guestNodes: [
          { amountCents: 100000, settledAmountCents: 100000 },
          { amountCents: 400000, settledAmountCents: 400000 },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects unsettled guest nodes', () => {
    expect(() =>
      assertGuestNodesReadyForSettlement({
        guestNodes: [{ amountCents: 100000, settledAmountCents: 50000 }],
      }),
    ).toThrow('相关游客代收节点尚未结清，收齐后再落客户补款与返利')
  })
})
