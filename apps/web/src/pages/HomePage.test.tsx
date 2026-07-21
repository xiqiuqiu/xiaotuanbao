import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkbench } from '@/services/workbench.service'
import { useAuthStore } from '@/app/store/auth.store'
import { HomePage } from './HomePage'
import { workbenchQueryOptions } from './workbench-query'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/services/workbench.service', () => ({
  getWorkbench: vi.fn(),
}))

const coordinatorSnapshot = {
  template: 'coordinator' as const,
  organization: { id: 'org-1', name: '测试旅行社' },
  asOf: '2026-07-21T02:03:04.000Z',
  modules: [
    {
      key: 'coordinator-departures' as const,
      title: '近期发团',
      description: '掌握近期发团与资料状态。',
      metrics: [
        { key: 'zero', label: '真实零值', value: 0 },
        { key: 'missing', label: '缺失值', value: null },
      ],
      items: [],
    },
  ],
  actions: [
    {
      key: 'create-departure' as const,
      label: '新建发团',
      href: '/departure/new' as const,
      requiredPermission: 'departure:write' as const,
      emphasis: 'primary' as const,
    },
  ],
}

function renderPage() {
  return renderPageWithClient(new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }))
}

function renderPageWithClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  )
}

describe('HomePage workbench lifecycle', () => {
  beforeEach(() => {
    navigate.mockReset()
    vi.mocked(getWorkbench).mockReset()
    useAuthStore.setState({ actionKeys: ['departure:write'] })
  })

  afterEach(cleanup)

  it('refetches on mount and window focus without polling', () => {
    expect(workbenchQueryOptions).toMatchObject({
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
    })
    expect(workbenchQueryOptions).not.toHaveProperty('refetchInterval')
  })

  it('refetches when returning from a drill-down page while keeping the cached snapshot', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const firstVisit = renderPageWithClient(queryClient)
    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()

    firstVisit.unmount()
    renderPageWithClient(queryClient)

    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    await waitFor(() => expect(getWorkbench).toHaveBeenCalledTimes(2))
  })

  it('distinguishes initial loading, zero, missing value and empty module data', async () => {
    let resolveRequest!: (value: typeof coordinatorSnapshot) => void
    vi.mocked(getWorkbench).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve }),
    )

    renderPage()
    expect(screen.getByText('正在加载工作台')).toBeInTheDocument()

    resolveRequest(coordinatorSnapshot)

    expect(await screen.findByRole('heading', { level: 4, name: '工作台' })).toBeInTheDocument()
    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    expect(screen.getByText('计调工作台')).toBeInTheDocument()
    expect(screen.getByText('真实零值')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('缺失值')).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByText('当前模块暂无待处理数据，可稍后刷新查看')).toBeInTheDocument()
    expect(screen.getByText(/数据更新时间/)).toBeInTheDocument()
  })

  it('renders the permission-backed primary action and navigates to departure creation', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    const user = userEvent.setup()
    renderPage()

    const action = await screen.findByRole('button', { name: /新建发团/ })
    expect(action).toHaveClass('ant-btn-primary')
    await user.click(action)
    expect(navigate).toHaveBeenCalledWith({ to: '/departure/new' })
  })

  it('does not render an action when the current session lacks its permission', async () => {
    useAuthStore.setState({ actionKeys: [] })
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    renderPage()

    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新建发团/ })).not.toBeInTheDocument()
  })

  it('renders a retryable first-load error', async () => {
    vi.mocked(getWorkbench)
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce(coordinatorSnapshot)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('工作台加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    expect(getWorkbench).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous snapshot and asOf when a background refresh fails', async () => {
    let rejectRefresh!: (reason: Error) => void
    vi.mocked(getWorkbench)
      .mockResolvedValueOnce(coordinatorSnapshot)
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectRefresh = reject }),
      )
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /刷新/ }))
    expect(await screen.findByText(/正在更新/)).toBeInTheDocument()

    rejectRefresh(new Error('刷新失败'))

    expect(await screen.findByText('刷新失败，已保留上次数据')).toBeInTheDocument()
    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    expect(screen.getByText(/数据更新时间/)).toBeInTheDocument()
    await waitFor(() => expect(getWorkbench).toHaveBeenCalledTimes(2))
  })
})
