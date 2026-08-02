import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it } from 'vitest'
import { SourceOrdersSettlementStrip } from './SourceOrdersSettlementStrip'
import type { SourceOrdersSettlementStripSummary } from '../utils/source-orders-settlement-strip-summary'
import { formatCents } from '../catalog'

function renderStrip(summary: SourceOrdersSettlementStripSummary) {
  return render(
    <ConfigProvider>
      <SourceOrdersSettlementStrip summary={summary} />
    </ConfigProvider>,
  )
}

describe('SourceOrdersSettlementStrip', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders four settlement glance cells for the current list', () => {
    renderStrip({
      orderCount: 2,
      totalGuests: 15,
      netReceivableCents: 1500000,
      partnerCollectedCents: 700000,
      guestCollectCents: 800000,
      ungeneratedCount: 1,
      ungeneratedCents: 1000000,
    })

    const strip = screen.getByRole('list', { name: '客源结算汇总' })
    expect(strip.textContent).toContain('结算应收')
    expect(strip.textContent).toContain(formatCents(1500000))
    expect(strip.textContent).toContain('2 单 · 15 人')
    expect(strip.textContent).toContain('客户已收')
    expect(strip.textContent).toContain(formatCents(700000))
    expect(strip.textContent).toContain('我方代收约定')
    expect(strip.textContent).toContain(formatCents(800000))
    expect(strip.textContent).toContain('尚未提交应收')
    expect(strip.textContent).toContain(formatCents(1000000))
    expect(strip.textContent).toContain('1 单待提交')
  })

  it('shows 已齐 when every listed order has receivables', () => {
    renderStrip({
      orderCount: 1,
      totalGuests: 5,
      netReceivableCents: 500000,
      partnerCollectedCents: 500000,
      guestCollectCents: 0,
      ungeneratedCount: 0,
      ungeneratedCents: 0,
    })

    expect(screen.getByRole('list', { name: '客源结算汇总' }).textContent).toContain('已齐')
  })

  it('omits the strip when there are no listed orders', () => {
    const { container } = renderStrip({
      orderCount: 0,
      totalGuests: 0,
      netReceivableCents: 0,
      partnerCollectedCents: 0,
      guestCollectCents: 0,
      ungeneratedCount: 0,
      ungeneratedCents: 0,
    })

    expect(container).toBeEmptyDOMElement()
  })

})
