import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Modal } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureSummary } from '@/types/api'
import { CreateDepartureWizard } from './CreateDepartureWizard'

const mockNavigate = vi.fn()
let mockSearch: { copyFrom?: string } = {}

const mockUser = {
  id: 'user-1',
  username: 'wangjie',
  name: '王杰',
  organizationId: 'org-1',
  organizationName: '测试企业',
  roles: ['coordinator'],
  isPlatformAdmin: false,
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch,
}))

vi.mock('@/app/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser | null }) => unknown) =>
    selector({ user: mockUser }),
}))

vi.mock('@/services/departure.service', () => ({
  previewDepartureNo: vi.fn(),
  createDeparture: vi.fn(),
  copyDeparture: vi.fn(),
  getDeparture: vi.fn(),
}))

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(),
}))

vi.mock('@/services/route-template.service', () => ({
  listRouteTemplates: vi.fn(),
  getRouteTemplate: vi.fn(),
  deleteRouteTemplate: vi.fn(),
}))

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn(),
}))

import {
  copyDeparture,
  createDeparture,
  getDeparture,
  previewDepartureNo,
} from '@/services/departure.service'
import { listEmployeeOptions } from '@/services/employee.service'
import { listSegments } from '@/services/segment.service'
import {
  deleteRouteTemplate,
  getRouteTemplate,
  listRouteTemplates,
} from '@/services/route-template.service'

const mockDeparture: DepartureSummary = {
  id: 'departure-1',
  departureNo: 'XTB2026070001',
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
  canPurge: true,
}

function renderWizard({ strict = false }: { strict?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const tree = (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <CreateDepartureWizard />
      </ConfigProvider>
    </QueryClientProvider>
  )

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('CreateDepartureWizard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Modal.destroyAll()
    mockSearch = {}
  })

  beforeEach(() => {
    mockSearch = {}
    vi.mocked(previewDepartureNo).mockResolvedValue({ departureNo: 'XTB2026070001' })
    vi.mocked(createDeparture).mockResolvedValue(mockDeparture)
    vi.mocked(copyDeparture).mockResolvedValue(mockDeparture)
    vi.mocked(listRouteTemplates).mockResolvedValue([])
    vi.mocked(deleteRouteTemplate).mockResolvedValue({ success: true })
    vi.mocked(listEmployeeOptions).mockResolvedValue([{ id: 'user-1', name: '王杰' }])
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

    await user.click(screen.getByText('手动输入'))
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
  })

  it('enters step 2 from manual tab without template copy modal', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByText('手动输入'))
    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('使用该路线建团')).not.toBeInTheDocument()
    expect(screen.queryByText('无模板复制项')).not.toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
  })

  it('creates manual departure without templateId or structure summary', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByText('手动输入'))
    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await screen.findByLabelText('团名')

    expect(screen.queryByText(/将复制/)).not.toBeInTheDocument()
    expect(screen.queryByText('无模板复制项')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(createDeparture).toHaveBeenCalled()
    })

    const payload = vi.mocked(createDeparture).mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      routeName: '喀纳斯阿勒泰10日线',
    })
    expect(payload).not.toHaveProperty('templateId')
    expect(payload).not.toHaveProperty('copySegments')
    expect(payload).not.toHaveProperty('copyResources')
    expect(payload).not.toHaveProperty('copyReferencePrices')
  })

  it('enters step 2 from template tab without copy modal and shows structure summary', async () => {
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

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用该路线建团' })).not.toBeInTheDocument()
    expect(screen.getByText('将复制 2 段行程、5 项资源草稿')).toBeInTheDocument()
  })

  it('creates departure from template without copy flags', async () => {
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
    await screen.findByLabelText('团名')
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(createDeparture).toHaveBeenCalled()
    })

    const payload = vi.mocked(createDeparture).mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      templateId: 'template-1',
      routeName: '西安-青海湖-茶卡6日游',
    })
    expect(payload).not.toHaveProperty('copySegments')
    expect(payload).not.toHaveProperty('copyResources')
    expect(payload).not.toHaveProperty('copyReferencePrices')
  })

  it('keeps copy-source loading tip from nesting over a widthless placeholder', () => {
    mockSearch = { copyFrom: 'source-departure-1' }
    vi.mocked(getDeparture).mockImplementation(() => new Promise(() => {}))
    vi.mocked(listSegments).mockImplementation(() => new Promise(() => {}))

    renderWizard()

    const tip = screen.getByText('正在加载源发团…')
    const spin = tip.closest('.ant-spin')
    expect(spin).toBeTruthy()

    // Nested Spin positions the tip against a root sized by `.ant-spin-container` children.
    // An empty widthless child collapses that root, so Chinese tip glyphs stack vertically
    // (the weak-network screenshot). Non-nested Spin sizes to the tip content instead.
    const nestedChild = spin!.querySelector('.ant-spin-container > *') as HTMLElement | null
    if (!nestedChild) return

    const css = readFileSync(resolve(__dirname, './CreateDepartureWizard.module.css'), 'utf8')
    const hasWidthFloor = /\.loadingPlaceholder\s*\{[^}]*\b(min-width|width)\s*:/.test(css)
    const hasContent =
      Boolean(nestedChild.textContent?.trim()) || nestedChild.children.length > 0

    expect(
      hasContent || hasWidthFloor,
      'nested Spin tip collapses vertically when the placeholder has no width floor',
    ).toBe(true)
  })

  it('exits copy-source loading under StrictMode after source resolves', async () => {
    mockSearch = { copyFrom: 'source-departure-1' }
    vi.mocked(getDeparture).mockResolvedValue({
      ...mockDeparture,
      id: 'source-departure-1',
      departureNo: 'XTB2026060009',
      routeName: '喀纳斯阿勒泰10日线',
      dayCount: 10,
      grossReceivableCents: 0,
      discountCents: 0,
      verifiedReceivableCents: 0,
      openUnsettledReceivableCents: 0,
      verifiedPayableCents: 0,
      openUnsettledPayableCents: 0,
      unverifiedIncomeCents: 0,
      unverifiedExpenseCents: 0,
      isFinanciallySettled: false,
    })
    vi.mocked(listSegments).mockResolvedValue({
      items: [],
      summary: {
        segmentCount: 3,
        totalDays: 10,
        resourceCount: 7,
        payableOverview: '应付未生成',
      },
      total: 0,
    })

    renderWizard({ strict: true })

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('正在加载源发团…')).not.toBeInTheDocument()
    expect(screen.getByText('复制自发团 XTB2026060009，不含客源与财务')).toBeInTheDocument()
  })

  it('enters copy mode without copy modal and creates without copy flags', async () => {
    mockSearch = { copyFrom: 'source-departure-1' }
    let resolveDeparture: (value: Awaited<ReturnType<typeof getDeparture>>) => void = () => {}
    vi.mocked(getDeparture).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDeparture = resolve
        }),
    )
    vi.mocked(listSegments).mockResolvedValue({
      items: [],
      summary: {
        segmentCount: 3,
        totalDays: 10,
        resourceCount: 7,
        payableOverview: '应付未生成',
      },
      total: 0,
    })

    const user = userEvent.setup()
    renderWizard()

    expect(screen.getByText('正在加载源发团…')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '常用路线' })).not.toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建发团/ })).toBeDisabled()

    resolveDeparture({
      ...mockDeparture,
      id: 'source-departure-1',
      departureNo: 'XTB2026060009',
      routeName: '喀纳斯阿勒泰10日线',
      dayCount: 10,
      grossReceivableCents: 0,
      discountCents: 0,
      verifiedReceivableCents: 0,
      openUnsettledReceivableCents: 0,
      verifiedPayableCents: 0,
      openUnsettledPayableCents: 0,
      unverifiedIncomeCents: 0,
      unverifiedExpenseCents: 0,
      isFinanciallySettled: false,
    })

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
    expect(screen.queryByText('复制已有发团')).not.toBeInTheDocument()
    expect(screen.getByText('复制自发团 XTB2026060009，不含客源与财务')).toBeInTheDocument()

    const { default: wizardStyles } = await import('./CreateDepartureWizard.module.css')
    const workspace = screen.getByText('发团基础信息').closest(`.${wizardStyles.wizardBody}`)
    expect(workspace?.className.split(/\s+/)).toEqual(
      expect.arrayContaining([wizardStyles.wizardBody, wizardStyles.wizardBodyNoRail]),
    )
    expect(screen.queryByLabelText('创建进度')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(copyDeparture).toHaveBeenCalled()
    })

    expect(vi.mocked(copyDeparture).mock.calls[0]?.[0]).toBe('source-departure-1')
    const payload = vi.mocked(copyDeparture).mock.calls[0]?.[1]
    expect(payload).not.toHaveProperty('copySegments')
    expect(payload).not.toHaveProperty('copyResources')
    expect(payload).not.toHaveProperty('copyReferencePrices')
  })

  it('removes route template card from list after confirmed delete', async () => {
    vi.mocked(listRouteTemplates)
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          name: '西安-青海湖-茶卡6日游',
          defaultDayCount: 6,
          usageCount: 3,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'template-2',
          name: '喀纳斯阿勒泰10日线',
          defaultDayCount: 10,
          usageCount: 1,
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ])
      .mockResolvedValue([
        {
          id: 'template-2',
          name: '喀纳斯阿勒泰10日线',
          defaultDayCount: 10,
          usageCount: 1,
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ])
    vi.mocked(deleteRouteTemplate).mockResolvedValue({ success: true })

    type ConfirmConfig = Parameters<typeof Modal.confirm>[0]
    let confirmConfig: ConfirmConfig | undefined
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      confirmConfig = config
      return {
        destroy: vi.fn(),
        update: vi.fn(),
        then: undefined,
      } as ReturnType<typeof Modal.confirm>
    })

    try {
      const user = userEvent.setup()
      renderWizard()

      expect(await screen.findByText('西安-青海湖-茶卡6日游')).toBeInTheDocument()
      expect(screen.getByText('喀纳斯阿勒泰10日线')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '删除常用路线 西安-青海湖-茶卡6日游' }))

      expect(confirmConfig).toMatchObject({
        title: '确认删除该常用路线？',
        content: '删除「西安-青海湖-茶卡6日游」后不影响已用该路线建出的发团及其执行安排。',
        okText: '删除',
        okType: 'danger',
      })

      await confirmConfig?.onOk?.()

      expect(vi.mocked(deleteRouteTemplate).mock.calls[0]?.[0]).toBe('template-1')
      await waitFor(() => {
        expect(screen.queryByText('西安-青海湖-茶卡6日游')).not.toBeInTheDocument()
      })
      expect(screen.getByText('喀纳斯阿勒泰10日线')).toBeInTheDocument()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('validates required fields before creating departure', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByText('手动输入'))
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

    await user.click(screen.getByText('手动输入'))
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
