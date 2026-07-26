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

vi.mock('@/services/departure.service', () => ({
  listDepartures: (...args: unknown[]) => listDepartures(...args),
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
  getDepartureRouteLedger: vi.fn().mockResolvedValue({
    routeName: '',
    startDateFrom: null,
    startDateTo: null,
    dateBlocks: [],
  }),
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
  })

  afterEach(() => {
    cleanup()
  })

  it('默认展示发团视图，可切换到线路视图空态', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(listDepartures).toHaveBeenCalled()
    })

    expect(
      screen.getByText('发团视图').closest('.ant-segmented-item'),
    ).toHaveClass('ant-segmented-item-selected')
    expect(screen.queryByText('请先选择路线名称')).not.toBeInTheDocument()

    await user.click(screen.getByText('线路视图'))

    await waitFor(() => {
      expect(screen.getByText('请先选择路线名称')).toBeInTheDocument()
    })
    expect(
      screen.getByText('线路视图').closest('.ant-segmented-item'),
    ).toHaveClass('ant-segmented-item-selected')
    expect(listDepartureRouteNames).toHaveBeenCalled()
  })
})

