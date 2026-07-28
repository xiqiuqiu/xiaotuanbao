import { describe, expect, it } from 'vitest'
import { SourceOrderCollectionMode } from '@xiaotuanbao/shared'
import { formatGuestCollectBreakdown } from './source-orders-table-columns'

describe('formatGuestCollectBreakdown', () => {
  it('splits deposit and balance for 全部我方代收', () => {
    expect(
      formatGuestCollectBreakdown({
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositCents: 200000,
        balanceCents: 350000,
        guestCollectCents: 550000,
      }),
    ).toBe('定金 ¥2,000.00 · 尾款 ¥3,500.00')
  })

  it('shows balance only for split collection', () => {
    expect(
      formatGuestCollectBreakdown({
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositCents: 100000,
        balanceCents: 400000,
        guestCollectCents: 400000,
      }),
    ).toBe('尾款 ¥4,000.00')
  })
})
