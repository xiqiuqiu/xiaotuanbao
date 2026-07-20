import { act, renderHook, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentScheduleWorkspace } from '../hooks/usePaymentScheduleWorkspace'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const listSupplierPayables = vi.fn()
const listPartnerPayables = vi.fn()
const listPayables = vi.fn()

vi.mock('@/services/finance.service', () => ({
  listSupplierPayables: (...args: unknown[]) => listSupplierPayables(...args),
  listPartnerReceivables: vi.fn(),
  listPartnerPayables: (...args: unknown[]) => listPartnerPayables(...args),
  listReceivables: vi.fn(),
  listPayables: (...args: unknown[]) => listPayables(...args),
  listDeparturePayables: vi.fn(),
  listDepartureReceivables: vi.fn(),
  listFinanceDepartureOptions: vi.fn(async () => []),
  getSupplierPaymentScheduleSummary: vi.fn(async () => ({ groups: [] })),
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

describe('PaymentScheduleWorkspace supplier scope', () => {
  beforeEach(() => {
    listSupplierPayables.mockReset()
    listPartnerPayables.mockReset()
    listPayables.mockReset()
  })

  it('fetches payables via the supplier endpoint with path-scoped filtering', async () => {
    listSupplierPayables.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })

    const { result } = renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'supplier',
          direction: 'payable',
          supplierId: 'sup-1',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({ page: 1, pageSize: 10 }),
        expect.any(AbortSignal),
      )
    })
    // 精确过滤走路径参数，不携带 counterparty keyword
    expect(listSupplierPayables.mock.calls[0]![1]).not.toHaveProperty('counterpartyKeyword')
    // 不走应收/全局/合作伙伴端点
    expect(listPartnerPayables).not.toHaveBeenCalled()
    expect(listPayables).not.toHaveBeenCalled()
    expect(result.current.isSupplierScope).toBe(true)
  })

  it('passes the departure date range to the supplier endpoint as server-side filters', async () => {
    listSupplierPayables.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })

    const { result } = renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'supplier',
          direction: 'payable',
          supplierId: 'sup-1',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalled()
    })

    act(() => {
      result.current.setDepartureDateRange(['2026-07-01', '2026-07-31'])
    })

    await waitFor(() => {
      expect(listSupplierPayables).toHaveBeenCalledWith(
        'sup-1',
        expect.objectContaining({
          departureDateFrom: '2026-07-01',
          departureDateTo: '2026-07-31',
        }),
        expect.any(AbortSignal),
      )
    })
    expect(result.current.departureDateRange).toEqual(['2026-07-01', '2026-07-31'])
  })

  it('does not fetch until supplierId is provided', async () => {
    renderHook(
      () =>
        usePaymentScheduleWorkspace({
          scope: 'supplier',
          direction: 'payable',
        }),
      { wrapper: createWrapper() },
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listSupplierPayables).not.toHaveBeenCalled()
  })
})
