import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DepartureListSearch } from '../utils/departure-list-search'
import { DeparturesPage } from './DeparturesPage'

const navigate = vi.fn()
let mockSearch: DepartureListSearch = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
  useSearch: () => mockSearch,
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (selector: (state: { actionKeys: string[] }) => unknown) =>
    selector({ actionKeys: ['departure:write'] }),
}))

const listDepartures = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
const listDepartureRouteNames = vi.fn().mockResolvedValue({ items: ['伊犁环线'] })
const getDepartureRouteLedger = vi.fn().mockResolvedValue({
  routeName: null,
  startDateFrom: null,
  startDateTo: null,
  dateBlocks: [],
})

vi.mock('@/services/departure.service', () => ({
  listDepartures: (...args: unknown[]) => listDepartures(...args),
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
  getDepartureRouteLedger: (...args: unknown[]) => getDepartureRouteLedger(...args),
  purgeDeparture: vi.fn(),
}))

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <DeparturesPage />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('DeparturesPage view toggle', () => {
  beforeEach(() => {
    mockSearch = {}
    navigate.mockReset()
    listDepartures.mockClear()
    listDepartureRouteNames.mockClear()
    getDepartureRouteLedger.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('默认展示发团视图，可切换到线路视图并默认选中首条路线', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(listDepartures).toHaveBeenCalled()
    })

    expect(screen.getByRole('tab', { name: '发团视图' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByText('请选择路线名称或出团日期')).not.toBeInTheDocument()

    await user.click(screen.getByText('线路视图'))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '线路视图' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(listDepartureRouteNames).toHaveBeenCalled()
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        { routeName: '伊犁环线' },
        expect.anything(),
      )
    })
    expect(screen.queryByText('请选择路线名称或出团日期')).not.toBeInTheDocument()
  })

  it('URL 带 view=route-ledger 与筛选时直接进入线路视图并按条件查询 (#221)', async () => {
    mockSearch = {
      view: 'route-ledger',
      routeName: '伊犁环线',
      startDateFrom: '2026-07-15',
      startDateTo: '2026-07-15',
    }
    getDepartureRouteLedger.mockResolvedValue({
      routeName: '伊犁环线',
      startDateFrom: '2026-07-15',
      startDateTo: '2026-07-15',
      dateBlocks: [],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '线路视图' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        {
          routeName: '伊犁环线',
          startDateFrom: '2026-07-15',
          startDateTo: '2026-07-15',
        },
        expect.anything(),
      )
      expect(screen.getByText('「伊犁环线」暂无匹配发团')).toBeInTheDocument()
    })

    expect(listDepartures).not.toHaveBeenCalled()
  })
})
