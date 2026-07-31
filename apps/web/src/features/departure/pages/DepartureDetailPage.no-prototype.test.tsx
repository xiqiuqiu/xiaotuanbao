/**
 * 概览原型只换 Overview：其它 Tab 不受 ?variant= 劫持（Overview 在本文件被 mock）。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { DepartureDetailPage } from './DepartureDetailPage'

const navigate = vi.fn()
let mockSearch: {
  tab?: string
  segmentId?: string
  listReturn?: string
  variant?: string
} = {
  tab: 'execution',
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={typeof to === 'string' ? to : '#'}>{children}</a>
  ),
  useNavigate: () => navigate,
  useParams: () => ({ departureId: 'departure-1' }),
  useSearch: () => mockSearch,
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (
    selector: (state: { menuKeys: string[]; actionKeys: string[] }) => unknown,
  ) =>
    selector({
      menuKeys: ['/', '/departure', '/finance/transactions', '/finance/verification'],
      actionKeys: ['departure:write'],
    }),
}))

vi.mock('@/services/departure.service', () => ({
  getDeparture: vi.fn(),
}))

vi.mock('../components/DepartureHeader', () => ({
  DepartureHeader: () => <div>发团头</div>,
}))

vi.mock('../components/DepartureOverview', () => ({
  DepartureOverview: () => <div>概览内容</div>,
}))

vi.mock('../components/SourceOrdersTab', () => ({
  SourceOrdersTab: () => <div>客源内容</div>,
}))

vi.mock('../components/ExecutionTab', () => ({
  ExecutionTab: () => <div>执行内容</div>,
}))

vi.mock('../components/IncomeRecordsPanel', () => ({
  IncomeRecordsPanel: () => <div>增收内容</div>,
}))

vi.mock('@/features/finance/components/PaymentScheduleWorkspace', () => ({
  PaymentScheduleWorkspace: () => <div>应收应付内容</div>,
}))

vi.mock('@/features/finance/components/TransactionsWorkspace', () => ({
  TransactionsWorkspace: () => <div>流水内容</div>,
}))

vi.mock('@/features/finance/components/VerificationsWorkspace', () => ({
  VerificationsWorkspace: () => <div>核销内容</div>,
}))

vi.mock('@/components/StaleDataAlert', () => ({
  StaleDataAlert: () => null,
}))

const { getDeparture } = await import('@/services/departure.service')

const departure = {
  id: 'departure-1',
  departureNo: 'XTB26070003',
  name: '乌镇西栅2日线',
  status: 'editing',
} as unknown as DepartureDetail

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DepartureDetailPage />
    </QueryClientProvider>,
  )
}

describe('DepartureDetailPage no-prototype workspace', () => {
  beforeEach(() => {
    navigate.mockReset()
    mockSearch = { tab: 'execution' }
    vi.mocked(getDeparture).mockResolvedValue(departure)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the production workspace', async () => {
    renderPage()

    expect(await screen.findByRole('tab', { name: '执行安排' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('执行内容')).toBeInTheDocument()
    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('下一方案')).not.toBeInTheDocument()
  })

  it('ignores ?variant= on non-overview workspace tabs', async () => {
    mockSearch = { tab: 'sourceOrders', variant: 'A' }
    renderPage()

    expect(await screen.findByRole('tab', { name: '客源管理' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('客源内容')).toBeInTheDocument()
    // Overview (host of PrototypeSwitcher) is mocked — switcher must not appear here.
    expect(screen.queryByLabelText('上一方案')).not.toBeInTheDocument()
  })

  it('preserves overview variant when syncing tab URL', async () => {
    const user = userEvent.setup()
    mockSearch = { tab: 'execution', variant: 'C', segmentId: 'seg-1' }
    renderPage()

    await screen.findByRole('tab', { name: '执行安排' })
    await user.click(screen.getByRole('tab', { name: '应付管理' }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'payables', segmentId: 'seg-1', variant: 'C' },
        replace: true,
      })
    })
  })
})
