import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { SourceOrdersTab } from './SourceOrdersTab'

/**
 * After ordinary receivable edit syncs path amounts onto the source order
 * (gross/net/guestCollect updated, unit prices left stale), opening the shared
 * drawer must fetch the latest source order and show those stored path amounts.
 */

const getSourceOrder = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({
    items: [{ id: 'partner-1', name: '福建土楼专线地接' }],
    total: 1,
  })),
}))

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: vi.fn(async () => ({
    items: [postReceivableSyncOrder()],
    summary: {
      orderCount: 1,
      totalGuests: 1,
      partnerCount: 1,
      totalDiscountCents: 0,
      totalNetReceivableCents: 720000,
      totalGuestCollectCents: 620000,
    },
    total: 1,
  })),
  getSourceOrder: (...args: unknown[]) => getSourceOrder(...args),
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(async () => ({ affectedTransactionCount: 0 })),
}))

const departure = {
  id: 'departure-1',
  departureNo: 'XTB2026070008',
  name: '天吐喀伊10日 7月25日团',
  status: 'editing',
} as DepartureDetail

/** Shape after syncSourceOrderPathAmountOnReceivableAdjust (guest 6000→6200). */
function postReceivableSyncOrder(
  overrides: Partial<SourceOrderSummary> = {},
): SourceOrderSummary {
  return {
    id: 'order-1',
    departureId: 'departure-1',
    partnerId: 'partner-1',
    partnerName: '福建土楼专线地接',
    displayName: '福建土楼专线地接',
    guestCount: 1,
    adultGuestCount: 1,
    childGuestCount: 0,
    // Unit prices still imply 7000 settlement / 6000 guest collect.
    adultUnitPriceCents: 700000,
    childUnitPriceCents: 0,
    // Stored path amounts already synced from receivable edit.
    grossReceivableCents: 720000,
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 720000,
    collectionMode: 'split',
    partnerCollectedCents: 100000,
    guestCollectCents: 620000,
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
        <SourceOrdersTab departure={departure} readOnly={false} canEdit />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrdersTab list vs detail amounts after receivable sync', () => {
  afterEach(() => {
    cleanup()
    getSourceOrder.mockReset()
  })

  it('fetches latest source order on 编辑 and shows stored path amounts in footer', async () => {
    const user = userEvent.setup()
    getSourceOrder.mockResolvedValue(postReceivableSyncOrder())
    renderTab()

    const listRow = (await screen.findByText('福建土楼专线地接')).closest('tr')
    expect(listRow).toBeTruthy()
    expect(within(listRow as HTMLElement).getAllByText('¥7,200.00').length).toBeGreaterThanOrEqual(1)
    expect(within(listRow as HTMLElement).getByText('¥6,200.00')).toBeTruthy()

    await user.click(within(listRow as HTMLElement).getByRole('button', { name: '编辑' }))

    await waitFor(() => {
      expect(getSourceOrder).toHaveBeenCalledWith('order-1', expect.any(AbortSignal))
    })

    await waitFor(() => {
      expect(screen.getByText('编辑客源单')).toBeTruthy()
    })

    expect(
      screen.getByText(/结算金额 ¥7,200\.00.*客户已收 ¥1,000\.00.*我方代收 ¥6,200\.00/),
    ).toBeTruthy()
    expect(
      screen.queryByText(/结算金额 ¥7,000\.00.*客户已收 ¥1,000\.00.*我方代收 ¥6,000\.00/),
    ).toBeNull()
  })
})
