import {
  aggregateDepartureOverviewCollectionStats,
  settlementCollectionContributionCents,
} from './departure-overview-collection-stats'

describe('settlementCollectionContributionCents', () => {
  it('Guest 已收超过 S 时只贡献 S，代收溢价不抬高团款分子', () => {
    expect(
      settlementCollectionContributionCents({
        settlementAmountCents: 500_000,
        guestReceivedCents: 600_000,
        customerSettlementReceivedCents: 0,
      }),
    ).toBe(500_000)
  })

  it('Guest 已收不足 S 时叠加客户补款已收', () => {
    expect(
      settlementCollectionContributionCents({
        settlementAmountCents: 500_000,
        guestReceivedCents: 100_000,
        customerSettlementReceivedCents: 400_000,
      }),
    ).toBe(500_000)
  })

  it('全部客户结算：仅客户路径已收计入', () => {
    expect(
      settlementCollectionContributionCents({
        settlementAmountCents: 500_000,
        guestReceivedCents: 0,
        customerSettlementReceivedCents: 200_000,
      }),
    ).toBe(200_000)
  })
})

describe('aggregateDepartureOverviewCollectionStats', () => {
  it('拆开团款进度与游客代收进度，并汇总返利预估', () => {
    const stats = aggregateDepartureOverviewCollectionStats([
      {
        settlementAmountCents: 500_000,
        guestAgreedCents: 600_000,
        guestReceivedCents: 600_000,
        customerSettlementReceivedCents: 0,
      },
      {
        settlementAmountCents: 500_000,
        guestAgreedCents: 100_000,
        guestReceivedCents: 100_000,
        customerSettlementReceivedCents: 200_000,
      },
    ])

    // 团款：min(600k,500k)+0 + min(100k,500k)+200k = 500k + 300k
    expect(stats.settlementCollectionReceivableCents).toBe(1_000_000)
    expect(stats.settlementCollectionReceivedCents).toBe(800_000)
    // 代收：分子 Guest 已收，分母 G约定（定金+尾款口径）
    expect(stats.guestCollectionAgreedCents).toBe(700_000)
    expect(stats.guestCollectionReceivedCents).toBe(700_000)
    // 返利预估：max(0,600-500)+max(0,100-500)=100k
    expect(stats.estimatedRebateCents).toBe(100_000)
  })

  it('G>S 且 Guest 已收≥S 时团款进度为 100%，不因溢价超过 100%', () => {
    const stats = aggregateDepartureOverviewCollectionStats([
      {
        settlementAmountCents: 500_000,
        guestAgreedCents: 600_000,
        guestReceivedCents: 600_000,
        customerSettlementReceivedCents: 0,
      },
    ])

    expect(stats.settlementCollectionReceivedCents).toBe(500_000)
    expect(stats.settlementCollectionReceivableCents).toBe(500_000)
    expect(stats.guestCollectionReceivedCents).toBe(600_000)
    expect(stats.guestCollectionAgreedCents).toBe(600_000)
    expect(stats.estimatedRebateCents).toBe(100_000)
  })

  it('返利与代收溢价不计入团款分母', () => {
    const stats = aggregateDepartureOverviewCollectionStats([
      {
        settlementAmountCents: 500_000,
        guestAgreedCents: 600_000,
        guestReceivedCents: 0,
        customerSettlementReceivedCents: 0,
      },
    ])

    expect(stats.settlementCollectionReceivableCents).toBe(500_000)
    expect(stats.settlementCollectionReceivedCents).toBe(0)
    expect(stats.estimatedRebateCents).toBe(100_000)
  })
})
