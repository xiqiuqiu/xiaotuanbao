import { renderHook, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentScheduleWorkspace } from '../hooks/usePaymentScheduleWorkspace'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listPartnerReceivables = vi.fn()
const listPartnerPayables = vi.fn()
const listReceivables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listPartnerReceivables: (...args: unknown[]) => listPartnerReceivables(...args),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...args),
  listReceivables: (...args: unknown[]) => listReceivables(...args),
  listPayables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>{children}</ConfigProvider>
    </QueryClientProvider>
  )
}

describe('PaymentScheduleWorkspace partner scope', () => {
  beforeEach(() => {
    listPartnerReceivables.mockClear()
    listPartnerPayables.mockClear()
    listReceivables.mockClear()
  })

  it('fetches receivables via the partner endpoint instead of keyword matching', async () => {
    listPartnerReceivables.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })

    const { result } = renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'partner',
          direction: 'receivable',
          partnerId: 'partner-1',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(listPartnerReceivables).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({ page: 1, pageSize: 10 }),
        expect.any(AbortSignal),
      )
    })
    // 精确过滤走路径参数，不携带 counterparty keyword
    expect(listPartnerReceivables.mock.calls[0]![1]).not.toHaveProperty('counterpartyKeyword')
    expect(listReceivables).not.toHaveBeenCalled()
    expect(result.current.isPartnerScope).toBe(true)
  })

  it('fetches payables via the partner endpoint', async () => {
    listPartnerPayables.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })

    renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'partner',
          direction: 'payable',
          partnerId: 'partner-1',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(listPartnerPayables).toHaveBeenCalledWith(
        'partner-1',
        expect.objectContaining({ page: 1, pageSize: 10 }),
        expect.any(AbortSignal),
      )
    })
  })

  it('does not fetch until partnerId is provided', async () => {
    renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'partner',
          direction: 'receivable',
        }),
      { wrapper: createWrapper() },
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listPartnerReceivables).not.toHaveBeenCalled()
  })
})
