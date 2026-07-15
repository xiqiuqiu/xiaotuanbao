import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerLedgerSummaryCards } from './PartnerLedgerSummaryCards'

const getPartnerPaymentScheduleSummary = vi.fn()

vi.mock('@/services/finance.service', () => ({
  getPartnerPaymentScheduleSummary: (...args: unknown[]) =>
    getPartnerPaymentScheduleSummary(...args),
}))

const summaryFixture = {
  groups: [
    {
      direction: 'receivable',
      sourceType: 'source_order_customer_settlement',
      count: 2,
      amountCents: 210000,
      settledAmountCents: 50000,
      unsettledAmountCents: 160000,
    },
    {
      direction: 'receivable',
      sourceType: 'manual',
      count: 1,
      amountCents: 30000,
      settledAmountCents: 0,
      unsettledAmountCents: 30000,
    },
    {
      direction: 'payable',
      sourceType: 'manual',
      count: 1,
      amountCents: 50000,
      settledAmountCents: 20000,
      unsettledAmountCents: 30000,
    },
  ],
}

function renderCards(direction: 'receivable' | 'payable') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <PartnerLedgerSummaryCards
          partnerId="partner-1"
          direction={direction}
          departureDateFrom="2026-07-01"
          departureDateTo="2026-07-31"
        />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('PartnerLedgerSummaryCards', () => {
  beforeEach(() => {
    getPartnerPaymentScheduleSummary.mockReset()
    getPartnerPaymentScheduleSummary.mockResolvedValue(summaryFixture)
  })

  afterEach(() => {
    cleanup()
  })

  it('sums receivable groups and splits customer settlement vs other receivable', async () => {
    renderCards('receivable')

    await waitFor(() => {
      expect(screen.getByText('¥2,400.00')).toBeTruthy()
    })
    // 拆显：客户补款 2100.00 ／ 其他应收 300.00
    expect(screen.getByText(/客户补款 ¥2,100\.00/)).toBeTruthy()
    expect(screen.getByText(/其他应收 ¥300\.00/)).toBeTruthy()
    // 已核销 / 未结清
    expect(screen.getByText('¥500.00')).toBeTruthy()
    expect(screen.getByText('¥1,900.00')).toBeTruthy()

    expect(getPartnerPaymentScheduleSummary).toHaveBeenCalledWith(
      'partner-1',
      { departureDateFrom: '2026-07-01', departureDateTo: '2026-07-31' },
      expect.any(AbortSignal),
    )
  })

  it('sums payable groups without the receivable split line', async () => {
    renderCards('payable')

    await waitFor(() => {
      expect(screen.getByText('应付约定合计')).toBeTruthy()
    })
    await waitFor(() => {
      expect(screen.getByText('¥500.00')).toBeTruthy()
    })
    expect(screen.getByText('¥200.00')).toBeTruthy()
    expect(screen.getByText('¥300.00')).toBeTruthy()
    expect(screen.queryByText(/客户补款/)).toBeNull()
  })
})
