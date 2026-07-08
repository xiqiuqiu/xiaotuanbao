import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureSummary } from '@/types/api'
import { CreateDepartureWizard } from './CreateDepartureWizard'

const mockNavigate = vi.fn()
const mockUser = {
  id: 'user-1',
  username: 'wangjie',
  name: '王杰',
  organizationId: 'org-1',
  organizationName: '测试企业',
  roles: ['coordinator'],
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useSearch: () => ({}),
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser | null }) => unknown) =>
    selector({ user: mockUser }),
}))

vi.mock('@/services/departure.service', () => ({
  previewDepartureNo: vi.fn(),
  createDeparture: vi.fn(),
}))

vi.mock('@/services/route-template.service', () => ({
  listRouteTemplates: vi.fn(),
  getRouteTemplate: vi.fn(),
}))

vi.mock('@/services/employee.service', () => ({
  listEmployees: vi.fn(),
}))

import { createDeparture, previewDepartureNo } from '@/services/departure.service'
import { listEmployees } from '@/services/employee.service'
import { getRouteTemplate, listRouteTemplates } from '@/services/route-template.service'

const mockDeparture: DepartureSummary = {
  id: 'departure-1',
  departureNo: 'DT202608010001',
  name: '喀纳斯阿勒泰10日线 8月1日团',
  routeName: '喀纳斯阿勒泰10日线',
  routeSource: 'manual',
  sourceTemplateId: null,
  departureType: DepartureType.COMBINED,
  startDate: '2026-08-01',
  endDate: '2026-08-10',
  dayCount: 10,
  ownerUserId: 'user-1',
  status: 'editing',
  departureProgress: 'not_started',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalGuests: 0,
  sourceOrderCount: 0,
  segmentCount: 0,
  resourceCount: 0,
  completionTags: {
    sourceOrders: '客源未录入',
    segments: '行程未录入',
    resources: '资源未安排',
    receivables: '应收未生成',
    payables: '应付未生成',
  },
  netReceivableCents: 0,
  payableCents: 0,
  estimatedMarginCents: 0,
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateDepartureWizard />
    </QueryClientProvider>,
  )
}

describe('CreateDepartureWizard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Modal.destroyAll()
  })

  beforeEach(() => {
    vi.mocked(previewDepartureNo).mockResolvedValue({ departureNo: 'DT202608010001' })
    vi.mocked(createDeparture).mockResolvedValue(mockDeparture)
    vi.mocked(listRouteTemplates).mockResolvedValue([])
    vi.mocked(listEmployees).mockResolvedValue({
      items: [
        {
          id: 'user-1',
          name: '王杰',
          username: 'wangjie',
          status: 'enabled',
          roles: ['coordinator'],
          remark: null,
          lastLoginAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
      stats: { total: 1, enabled: 1, disabled: 0, createdToday: 0 },
    })
    vi.mocked(getRouteTemplate).mockResolvedValue({
      id: 'template-1',
      name: '西安-青海湖-茶卡6日游',
      defaultDayCount: 6,
      usageCount: 3,
      updatedAt: '2026-01-01T00:00:00.000Z',
      segmentCount: 2,
      resourceCount: 5,
    })
  })

  it('disables next step until route name is filled on manual tab', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('tab', { name: '手动输入' }))
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
  })

  it('enters step 2 from manual tab without template copy modal', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('tab', { name: '手动输入' }))
    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('使用该路线建团')).not.toBeInTheDocument()
    expect(screen.getByText('无模板复制项')).toBeInTheDocument()
  })

  it('opens copy modal for template tab before entering step 2', async () => {
    vi.mocked(listRouteTemplates).mockResolvedValue([
      {
        id: 'template-1',
        name: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        usageCount: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    const user = userEvent.setup()
    renderWizard()

    expect(await screen.findByText('西安-青海湖-茶卡6日游')).toBeInTheDocument()
    await user.click(screen.getByText('西安-青海湖-茶卡6日游'))
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('复制行程段')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用该路线建团' })).toBeInTheDocument()
  })

  it('validates required fields before creating departure', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('tab', { name: '手动输入' }))
    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await screen.findByLabelText('团名')

    await user.clear(screen.getByLabelText('团名'))
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    expect(await screen.findByText('请输入团名')).toBeInTheDocument()
    expect(createDeparture).not.toHaveBeenCalled()
  })

  it('navigates to departure detail after successful create', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('tab', { name: '手动输入' }))
    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await screen.findByLabelText('团名')

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(createDeparture).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'overview' },
      })
    })
  })
})
