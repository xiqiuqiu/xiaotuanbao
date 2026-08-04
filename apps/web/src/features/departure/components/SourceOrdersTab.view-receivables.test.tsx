import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { SourceOrdersTab } from './SourceOrdersTab'

/**
 * Full Tab + Ant Table + dual list queries + userEvent.
 * Idle ~3s / CPU-stressed ~4s; default 5s flakes under full-suite load.
 */
const SOURCE_ORDERS_TAB_TEST_TIMEOUT_MS = 10_000

const navigate = vi.fn()
const listSourceOrders = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
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
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(async () => ({ affectedTransactionCount: 0 })),
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
    fareAdjustmentNetCents: 0,
    fareAdjustments: [],
    discountType: 'none',
    discountCents: 0,
    discountNotes: null,
    netReceivableCents: 1000000,
    collectionMode: 'guest_only',
    depositCents: 0,
    balanceCents: 1000000,
    partnerCollectedCents: 0,
    guestCollectCents: 1000000,
    settlementNotes: null,
    notes: null,
    guests: [],
    receivableStatus: 'pending',
    hasPaymentSchedule: true,
    hasSourceAmountMismatch: false,
    amountFieldsLocked: false,
    hasIncompleteReceivablePaths: false,
    estimatedRebateCents: 0,
    rebateCents: 0,
    rebateStatus: 'not_generated',
    rebateScheduleNo: null,
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
        <App>
          <SourceOrdersTab departure={departure} readOnly={false} canEdit />
        </App>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('SourceOrdersTab 查看应收 navigation', { timeout: SOURCE_ORDERS_TAB_TEST_TIMEOUT_MS }, () => {
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
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
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
        sourceId: 'order-1',
      },
      replace: true,
    })
  })
})

describe('SourceOrdersTab 查看返利 navigation', { timeout: SOURCE_ORDERS_TAB_TEST_TIMEOUT_MS }, () => {
  afterEach(() => {
    cleanup()
    navigate.mockReset()
    listSourceOrders.mockReset()
  })

  it('switches to payables tab with scheduleNo filter for that rebate only', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [
        baseOrder({
          rebateCents: 100000,
          rebateStatus: 'pending',
          rebateScheduleNo: 'AP2026070099',
        }),
      ],
      summary: {
        orderCount: 1,
        totalGuests: 10,
        partnerCount: 1,
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 1000000,
        totalGuestCollectCents: 1000000,
      },
      total: 1,
    })

    renderTab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看返利' })).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: '查看返利' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/$departureId',
      params: { departureId: 'departure-1' },
      search: {
        tab: 'payables',
        scheduleNo: 'AP2026070099',
        highlightSourceOrderId: 'order-1',
        counterpartyKeyword: '杭州同行',
      },
      replace: true,
    })
  })
})

describe('SourceOrdersTab 批量提交应收', { timeout: SOURCE_ORDERS_TAB_TEST_TIMEOUT_MS }, () => {
  afterEach(() => {
    cleanup()
    navigate.mockReset()
    listSourceOrders.mockReset()
  })

  it('shows 批量提交应收 only when ungenerated source orders exist', async () => {
    listSourceOrders.mockResolvedValue({
      items: [baseOrder({ receivableStatus: 'not_generated', hasPaymentSchedule: false })],
      summary: {
        orderCount: 1,
        totalGuests: 10,
        partnerCount: 1,
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 1000000,
        totalGuestCollectCents: 1000000,
      },
      total: 1,
    })

    const { unmount } = renderTab()

    expect(await screen.findByRole('button', { name: '批量提交应收' })).toBeTruthy()
    unmount()

    listSourceOrders.mockResolvedValue({
      items: [baseOrder()],
      summary: {
        orderCount: 1,
        totalGuests: 10,
        partnerCount: 1,
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
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
    expect(screen.queryByRole('button', { name: '批量提交应收' })).toBeNull()
  })

  it('counts deposit+balance paths for guest_only and only balance for split in batch confirmation', async () => {
    const user = userEvent.setup()
    listSourceOrders.mockResolvedValue({
      items: [
        baseOrder({
          id: 'order-guest-only',
          collectionMode: 'guest_only',
          depositCents: 100000,
          balanceCents: 600000,
          partnerCollectedCents: 0,
          guestCollectCents: 700000,
          netReceivableCents: 700000,
          receivableStatus: 'not_generated',
          hasPaymentSchedule: false,
        }),
        baseOrder({
          id: 'order-split',
          collectionMode: 'split',
          depositCents: 400000,
          balanceCents: 600000,
          partnerCollectedCents: 400000,
          guestCollectCents: 600000,
          netReceivableCents: 600000,
          receivableStatus: 'not_generated',
          hasPaymentSchedule: false,
        }),
      ],
      summary: {
        orderCount: 2,
        totalGuests: 20,
        partnerCount: 1,
        totalGrossReceivableCents: 0,
        totalFareAdjustmentNetCents: 0,
        totalDiscountCents: 0,
        totalNetReceivableCents: 1300000,
        totalGuestCollectCents: 1300000,
      },
      total: 2,
    })

    renderTab()
    await user.click(await screen.findByRole('button', { name: '批量提交应收' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('批量提交应收').length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('button', { name: '提 交' })).toBeInTheDocument()

    // guest_only G=S → 2 paths; split G=S → 1 path (balance only)
    const summary = within(dialog).getByText('确认后将提交 3 条应收记录')
    const explanation = within(dialog).getByText(
      '「全部我方代收」按定金/尾款分别提交游客应收；「客户收定金+我方收尾款」仅提交尾款代收；当代收不足以覆盖结算金额时同批提交客户补款。',
    )
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(explanation).toHaveClass('ant-typography-secondary')
    expect(explanation).toHaveStyle({ fontSize: '12px' })
    expect(summary.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
