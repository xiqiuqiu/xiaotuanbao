import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { App, ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'
import { SourceOrdersTab } from './SourceOrdersTab'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({
    items: [{ id: 'partner-1', name: '杭州同行' }],
    total: 1,
  })),
}))

const listItems: SourceOrderSummary[] = [
  {
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
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 1000000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 1000000,
    partnerCollectedCents: 200000,
    guestCollectCents: 800000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'not_generated',
    hasPaymentSchedule: false,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    hasIncompleteReceivablePaths: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    rebateScheduleNo: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
]

const listSourceOrders = vi.fn()

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: (...args: unknown[]) => listSourceOrders(...args),
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(async () => ({ affectedTransactionCount: 0 })),
}))

vi.mock('./SourceOrderDrawer', () => ({
  SourceOrderDrawer: () => null,
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070003',
  name: '乌镇西栅2日线 7月14日团',
  status: 'editing',
} as DepartureDetail

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <App>
          <SourceOrdersTab departure={departure} readOnly={false} canEdit />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrdersTab settlement strip wiring', () => {
  afterEach(() => {
    cleanup()
    listSourceOrders.mockReset()
  })

  it('renders settlement strip between filters and table from filtered list', async () => {
    listSourceOrders.mockResolvedValue({
      items: listItems,
      summary: {
        orderCount: 1,
        totalGuests: 10,
        partnerCount: 1,
        totalGrossReceivableCents: 1000000,
        totalFareAdjustmentNetCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 1000000,
        totalGuestCollectCents: 800000,
      },
      total: 1,
    })

    renderTab()

    const strip = await screen.findByRole('list', { name: '客源结算汇总' })
    expect(strip.textContent).toContain('结算应收')
    expect(strip.textContent).toContain(formatCents(1000000))
    expect(strip.textContent).toContain('1 单待提交')

    const addButton = screen.getByRole('button', { name: /添加客源单/ })
    const table = screen.getByRole('table')
    expect(addButton.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(strip.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('omits settlement strip when the filtered list is empty', async () => {
    listSourceOrders.mockResolvedValue({
      items: [],
      summary: {
        orderCount: 0,
        totalGuests: 0,
        partnerCount: 0,
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 0,
        totalGuestCollectCents: 0,
      },
      total: 0,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /添加客源单/ })).toBeInTheDocument()
    })
    expect(screen.queryByRole('list', { name: '客源结算汇总' })).not.toBeInTheDocument()
  })
})
