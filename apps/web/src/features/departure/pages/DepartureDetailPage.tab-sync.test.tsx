import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureDetail } from '@/types/api'
import { DepartureDetailPage } from './DepartureDetailPage'

const navigate = vi.fn()
let mockSearch: { tab?: string; segmentId?: string; listReturn?: string } = {
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
  departureNo: 'XTB2026070003',
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

describe('DepartureDetailPage tab URL sync', () => {
  beforeEach(() => {
    navigate.mockReset()
    mockSearch = { tab: 'execution' }
    vi.mocked(getDeparture).mockResolvedValue(departure)
  })

  afterEach(() => {
    cleanup()
  })

  it('顶栏切换 Tab 时以 replace 同步 URL ?tab=，并保留既有可见财务入口', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('tab', { name: '执行安排' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: '应付管理' })).toBeInTheDocument()
    expect(screen.queryByText('业务执行')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '应付管理' }))

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'payables' },
        replace: true,
      })
    })
  })

  it('刷新时按 URL tab 落在同一页', async () => {
    mockSearch = { tab: 'payables' }
    renderPage()

    expect(await screen.findByRole('tab', { name: '应付管理' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('应收应付内容')).toBeInTheDocument()
  })
})
