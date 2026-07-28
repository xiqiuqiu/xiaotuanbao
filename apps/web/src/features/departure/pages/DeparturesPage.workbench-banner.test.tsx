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

vi.mock('@/services/departure.service', () => ({
  listDepartures: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
}))

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/partner.service', () => ({
  listPartners: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
}))

/** Avoid driving Ant DatePicker; exercise the same onStartDateRangeChange path. */
vi.mock('../components/DepartureFilters', () => ({
  DepartureFilters: ({
    onStartDateRangeChange,
    onReset,
  }: {
    onStartDateRangeChange: (
      value: [string | undefined, string | undefined] | null,
    ) => void
    onReset: () => void
  }) => (
    <>
      <button
        type="button"
        onClick={() => onStartDateRangeChange(['2026-07-23', '2026-07-26'])}
      >
        设置出团日期
      </button>
      <button type="button" onClick={onReset}>
        重置
      </button>
    </>
  ),
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

describe('DeparturesPage workbench filter banner', () => {
  beforeEach(() => {
    mockSearch = {}
    navigate.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not show「清除工作台筛选」when the user filters dates only on the list page', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '设置出团日期' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: '清除工作台筛选' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '设置出团日期' }))

    expect(screen.queryByRole('button', { name: '清除工作台筛选' })).not.toBeInTheDocument()
  })

  it('shows「清除工作台筛选」when entering via workbench date deep link', async () => {
    mockSearch = {
      startDateFrom: '2026-07-23',
      startDateTo: '2026-07-26',
      excludeClosed: '1',
    }
    renderPage()

    expect(
      await screen.findByRole('button', { name: '清除工作台筛选' }),
    ).toBeInTheDocument()
    expect(screen.getByText('已筛选：出团日 2026-07-23 至 2026-07-26')).toBeInTheDocument()
  })

  it('clears workbench URL search when clicking 重置', async () => {
    const user = userEvent.setup()
    mockSearch = {
      startDateFrom: '2026-07-23',
      startDateTo: '2026-07-26',
      excludeClosed: '1',
    }
    renderPage()

    expect(
      await screen.findByRole('button', { name: '清除工作台筛选' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置' }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/departure',
      search: {},
      replace: true,
    })
  })
})
