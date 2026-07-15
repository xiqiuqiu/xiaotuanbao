import { act, renderHook, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePaymentScheduleWorkspace } from '../hooks/usePaymentScheduleWorkspace'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listPayables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listPayables: (...args: unknown[]) => listPayables(...args),
  listReceivables: vi.fn(),
  listDeparturePayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

describe('PaymentScheduleWorkspace voided pagination', () => {
  it('uses server pagination for the voided audit filter', async () => {
    listPayables.mockResolvedValue({ items: [], total: 101, page: 1, pageSize: 10 })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>{children}</ConfigProvider>
      </QueryClientProvider>
    )

    const { result } = renderHook(
      () => usePaymentScheduleWorkspace({ scope: 'global', direction: 'payable' }),
      { wrapper },
    )

    await waitFor(() => expect(listPayables).toHaveBeenCalled())
    listPayables.mockClear()

    act(() => {
      result.current.setStatusFilter('voided')
      result.current.setPage(1)
    })

    await waitFor(() => {
      expect(listPayables).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 10, status: 'voided' }),
        expect.any(AbortSignal),
      )
    })
    expect(result.current.tableTotal).toBe(101)
  })
})
