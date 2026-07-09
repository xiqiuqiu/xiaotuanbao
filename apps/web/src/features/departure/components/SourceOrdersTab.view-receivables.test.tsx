import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { SourceOrdersTab } from './SourceOrdersTab'

const navigate = vi.fn()
const listSourceOrders = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({ items: [], total: 0 })),
}))

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: (...args: unknown[]) => listSourceOrders(...args),
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  status: 'editing',
} as DepartureDetail

function baseOrder(overrides: Partial<SourceOrderSummary> = {}): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '杭州同行',
    displayName: '杭州同行',
    guestCount: 10,
    adultGuestCount: 10,
    childGuestCount: 0,
    adultUnitPriceCents: 100000,
    childUnitPriceCents: 0,
    grossReceivableCents: 1000000,
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 1000000,
    collectionMode: 'guest_only',
    partnerCollectedCents: 0,
    guestCollectCents: 1000000,
    settlementNotes: null,
    notes: null,
    receivableStatus: 'pending',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <SourceOrdersTab departure={departure} readOnly={false} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrdersTab 查看应收 navigation', () => {
  afterEach(() => {
    cleanup()
    navigate.mockReset()
    listSourceOrders.mockReset()
  })

  it('switches to receivables tab with locate intent for the source order', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [baseOrder()],
      summary: {
        orderCount: 1,
        totalGuests: 10,
        partnerCount: 1,
        totalDiscountCents: 0,
        totalNetReceivableCents: 1000000,
        totalGuestCollectCents: 1000000,
      },
      total: 1,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看应收' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: '查看应收' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/$departureId',
      params: { departureId: 'departure-1' },
      search: {
        tab: 'receivables',
        highlightSourceOrderId: 'order-1',
      },
    })
  })
})
