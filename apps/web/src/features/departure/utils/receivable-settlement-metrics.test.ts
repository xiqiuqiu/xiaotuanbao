import { describe, expect, it } from 'vitest'
import { SourceOrderReceivableStatus } from '@xiaotuanbao/shared'
import {
  buildFullDepartureReceivableSettlementMetrics,
  isUngeneratedReceivable,
  tagReceivableSettlementScope,
} from './receivable-settlement-metrics'

describe('isUngeneratedReceivable', () => {
  it('is true when receivable has not been generated', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasIncompleteReceivablePaths: false,
      }),
    ).toBe(true)
  })

  it('is true when generated paths are incomplete', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.PENDING,
        hasIncompleteReceivablePaths: true,
      }),
    ).toBe(true)
  })

  it('is false when receivable is generated and paths are complete', () => {
    expect(
      isUngeneratedReceivable({
        receivableStatus: SourceOrderReceivableStatus.PENDING,
        hasIncompleteReceivablePaths: false,
      }),
    ).toBe(false)
  })
})

describe('buildFullDepartureReceivableSettlementMetrics', () => {
  it('derives full-departure settlement and collection metrics with scope full', () => {
    const metrics = buildFullDepartureReceivableSettlementMetrics({
      netReceivableCents: 3_000_000,
      settlementCollectionReceivableCents: 2_800_000,
      settlementCollectionReceivedCents: 1_200_000,
      ungeneratedReceivableCents: 500_000,
    })

    expect(metrics).toEqual({
      scope: 'full',
      settlementReceivableCents: 3_000_000,
      collectionReceivableCents: 2_800_000,
      collectionReceivedCents: 1_200_000,
      collectionUnreceivedCents: 1_600_000,
      ungeneratedReceivableCents: 500_000,
    })
  })

  it('keeps negative collection unreceived when received exceeds receivable', () => {
    const metrics = buildFullDepartureReceivableSettlementMetrics({
      netReceivableCents: 1_000_000,
      settlementCollectionReceivableCents: 1_000_000,
      settlementCollectionReceivedCents: 1_200_000,
      ungeneratedReceivableCents: 0,
    })

    expect(metrics.collectionUnreceivedCents).toBe(-200_000)
    expect(metrics.scope).toBe('full')
  })
})

describe('tagReceivableSettlementScope', () => {
  it('annotates filter-scope strip totals without changing amounts', () => {
    const tagged = tagReceivableSettlementScope(
      {
        orderCount: 2,
        netReceivableCents: 1_500_000,
        ungeneratedCents: 1_000_000,
        ungeneratedCount: 1,
      },
      'filter',
    )

    expect(tagged).toEqual({
      scope: 'filter',
      orderCount: 2,
      netReceivableCents: 1_500_000,
      ungeneratedCents: 1_000_000,
      ungeneratedCount: 1,
    })
  })
})
