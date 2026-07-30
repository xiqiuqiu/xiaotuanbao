import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { SourceOrdersTab } from './SourceOrdersTab'

/**
 * #227 护栏：客源管理不再挂载方案 A/B/C 原型；?variant= 不得劫持正式抽屉。
 */

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ variant: 'A', tab: 'sourceOrders' }),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn(async () => ({
    items: [{ id: 'partner-1', name: '杭州同行' }],
    total: 1,
  })),
}))

vi.mock('@/services/source-order.service', () => ({
  listSourceOrders: vi.fn(async () => ({
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
  })),
  createSourceOrder: vi.fn(),
  updateSourceOrder: vi.fn(),
  deleteSourceOrder: vi.fn(),
  generateReceivables: vi.fn(),
  generateReceivablesForDeparture: vi.fn(),
  getGuestCollectionChangeImpact: vi.fn(async () => ({ affectedTransactionCount: 0 })),
}))

vi.mock('./SourceOrderDrawer', () => ({
  SourceOrderDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="source-order-drawer">正式客源单抽屉</div> : null,
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
        <SourceOrdersTab departure={departure} readOnly={false} canEdit={true} />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('SourceOrdersTab prototype removal (#227)', () => {
  it('does not show PrototypeSwitcher and opens the real drawer even when ?variant=A', async () => {
    const user = userEvent.setup()
    renderTab()

    const addButton = await screen.findByRole('button', { name: /添加客源单/ })
    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一方案')).not.toBeInTheDocument()
    expect(screen.queryByText(/加宽纵排/)).not.toBeInTheDocument()

    await user.click(addButton)

    await waitFor(() => {
      expect(screen.getByTestId('source-order-drawer')).toBeInTheDocument()
    })
    expect(screen.getByText('正式客源单抽屉')).toBeInTheDocument()
  })
})
