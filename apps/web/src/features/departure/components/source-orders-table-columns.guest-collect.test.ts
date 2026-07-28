import { describe, expect, it } from 'vitest'
import { SourceOrderCollectionMode } from '@xiaotuanbao/shared'
import {
  formatGuestCollectBreakdown,
  renderGuestCollectBreakdown,
} from './source-orders-table-columns'

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

describe('renderGuestCollectBreakdown alignment', () => {
  it('stacks deposit/balance as right-aligned lines so amounts line up with the footer total', () => {
    const node = renderGuestCollectBreakdown({
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      depositCents: 50000,
      balanceCents: 500000,
      guestCollectCents: 550000,
    })

    expect(node.props.style).toMatchObject({
      textAlign: 'right',
      width: '100%',
    })
    expect(node.props['data-guest-collect']).toBe('stacked')
    const [depositLine, balanceLine] = node.props.children
    expect(depositLine.props.children.join('')).toContain('定金')
    expect(balanceLine.props.children.join('')).toContain('尾款')
  })
})
