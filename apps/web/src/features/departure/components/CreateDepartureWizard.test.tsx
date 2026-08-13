import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider, Modal, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { AiCreateAssistSession, AiReviewPackageView, DepartureSummary } from '@/types/api'
import { ApiError } from '@/lib/request'
import { useUiStore } from '@/app/store/ui.store'
import { AssistPane } from '@/layouts/AssistPane'
import { AssistPaneSlotProvider } from '@/layouts/assist-pane-slot'
import { CreateDepartureWizard } from './CreateDepartureWizard'

const mockNavigate = vi.fn()
let mockSearch: { copyFrom?: string; taskId?: string } = {}

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

vi.mock('@/services/ai-create-task.service', () => ({
  saveDepartureCreationDraft: vi.fn(),
  getAiCreateTask: vi.fn(),
  confirmAiCreateTask: vi.fn(),
  getAiCreateAssistAvailability: vi.fn(),
  startAiCreateAssistSession: vi.fn(),
  patchAiReviewPackage: vi.fn(),
  confirmAiReviewPackage: vi.fn(),
  rejectAiReviewPackage: vi.fn(),
}))

vi.mock('@/services/segment.service', () => ({
  listSegments: vi.fn(),
}))

vi.mock('@/services/route-template.service', () => ({
  listRouteTemplates: vi.fn(),
  getRouteTemplate: vi.fn(),
  deleteRouteTemplate: vi.fn(),
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({
    children,
    headers,
  }: {
    children: ReactNode
    headers?: Record<string, string>
  }) => (
    <div
      data-testid="copilot-kit"
      data-authorization={headers?.Authorization}
      data-run-id={headers?.['X-Ai-Run-Id']}
    >
      {children}
    </div>
  ),
  CopilotChat: ({ agentId }: { agentId?: string }) => (
    <div data-testid="copilot-chat" data-agent-id={agentId} />
  ),
  useAgentContext: vi.fn(),
  useAgent: () => ({ agent: { addMessage: vi.fn() }, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
  useRenderTool: vi.fn(),
}))

vi.mock('@copilotkit/react-core/v2/styles.css', () => ({}))

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn(),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))

import {
  copyDeparture,
  createDeparture,
  getDeparture,
  previewDepartureNo,
} from '@/services/departure.service'
import {
  confirmAiCreateTask,
  confirmAiReviewPackage,
  getAiCreateAssistAvailability,
  getAiCreateTask,
  patchAiReviewPackage,
  rejectAiReviewPackage,
  saveDepartureCreationDraft,
  startAiCreateAssistSession,
} from '@/services/ai-create-task.service'
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
    receivables: '应收未提交',
    payables: '应付未提交',
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
    <AssistPaneSlotProvider>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN}>
          <CreateDepartureWizard />
          <AssistPane />
        </ConfigProvider>
      </QueryClientProvider>
    </AssistPaneSlotProvider>
  )

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

function mockAssistSession(
  overrides: Partial<Pick<AiCreateAssistSession, 'runId' | 'delegationToken'>> = {},
): AiCreateAssistSession {
  return {
    task: {
      id: 'task-assist',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 1,
        snapshot: { mode: 'template', routeName: '' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    },
    runId: 'run-1',
    delegationToken: 'deleg-1',
    agentRuntimeUrl: '/copilotkit',
    expiresAt: '2026-01-01T00:10:00.000Z',
    ...overrides,
  }
}

function mockPendingReview(
  overrides: Partial<AiReviewPackageView> = {},
): AiReviewPackageView {
  return {
    id: 'pkg-1',
    status: 'pending',
    confirmationUnit: 'basic_info_draft',
    baseObjectVersion: 1,
    runId: 'run-1',
    candidates: [
      {
        fieldKey: 'name',
        proposedValue: '八月川西团',
        userCorrectedValue: null,
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'user_message', excerpt: '团名叫八月川西团' }],
      },
    ],
    ...overrides,
  }
}

async function fillManualRouteAndContinue(
  user: ReturnType<typeof userEvent.setup>,
  routeName = '喀纳斯阿勒泰10日线',
  startDate = '2026-08-01',
) {
  await user.click(screen.getByText('手动输入'))
  await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), routeName)
  await user.click(screen.getByLabelText('出团日期'))
  await user.click(await screen.findByTitle(startDate))
  await user.click(screen.getByRole('button', { name: '下一步' }))
}

describe('CreateDepartureWizard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Modal.destroyAll()
    message.destroy()
    mockSearch = {}
    useUiStore.setState({ assistPaneCollapsed: true })
  })

  beforeEach(() => {
    mockSearch = {}
    useUiStore.setState({ assistPaneCollapsed: true })
    vi.mocked(previewDepartureNo).mockResolvedValue({ departureNo: 'XTB2026070001' })
    vi.mocked(createDeparture).mockResolvedValue(mockDeparture)
    vi.mocked(copyDeparture).mockResolvedValue(mockDeparture)
    vi.mocked(saveDepartureCreationDraft).mockImplementation(async (payload) => ({
      id: payload.taskId ?? 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: payload.taskId ? (payload.expectedVersion ?? 0) + 1 : 1,
        snapshot: payload.draft,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    }))
    vi.mocked(confirmAiCreateTask).mockResolvedValue(mockDeparture)
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 1,
        snapshot: {
          mode: 'manual',
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线',
          startDate: '2026-08-01',
          endDate: '2026-08-01',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: false,
      agentRuntimeUrl: null,
    })
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

  it('keeps next enabled and warns when route name or start date is missing on manual tab', async () => {
    const user = userEvent.setup()
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => {})
    renderWizard()

    await user.click(screen.getByText('手动输入'))
    const next = screen.getByRole('button', { name: '下一步' })
    expect(next).toBeEnabled()

    await user.click(next)
    expect(warningSpy).toHaveBeenCalledWith('请填写路线名称')
    expect(screen.queryByLabelText('团名')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('如：喀纳斯阿勒泰10日线'), '喀纳斯阿勒泰10日线')
    await user.click(next)
    expect(warningSpy).toHaveBeenCalledWith('请选择出团日期')
    expect(screen.queryByLabelText('团名')).not.toBeInTheDocument()

    warningSpy.mockRestore()
  })

  it('enters step 2 from manual tab without template copy modal', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillManualRouteAndContinue(user)

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('使用该路线建团')).not.toBeInTheDocument()
    expect(screen.queryByText('无模板复制项')).not.toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
  })

  it('creates manual departure without templateId or structure summary', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')

    expect(screen.queryByText(/将复制/)).not.toBeInTheDocument()
    expect(screen.queryByText('无模板复制项')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })

    const draftPayloads = vi.mocked(saveDepartureCreationDraft).mock.calls.map((call) => call[0])
    const lastDraft = draftPayloads.at(-1)?.draft
    expect(lastDraft).toMatchObject({
      mode: 'manual',
      routeName: '喀纳斯阿勒泰10日线',
    })
    expect(lastDraft).not.toHaveProperty('templateId', expect.anything())
    expect(createDeparture).not.toHaveBeenCalled()
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
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })

    const draftPayloads = vi.mocked(saveDepartureCreationDraft).mock.calls.map((call) => call[0])
    const lastDraft = draftPayloads.at(-1)?.draft
    expect(lastDraft).toMatchObject({
      mode: 'template',
      templateId: 'template-1',
      routeName: '西安-青海湖-茶卡6日游',
      defaultDayCount: 6,
    })
    expect(createDeparture).not.toHaveBeenCalled()
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
      fareAdjustmentNetCents: 0,
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
        payableOverview: '应付未提交',
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
        payableOverview: '应付未提交',
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
      fareAdjustmentNetCents: 0,
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
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })

    const draftPayloads = vi.mocked(saveDepartureCreationDraft).mock.calls.map((call) => call[0])
    const lastDraft = draftPayloads.at(-1)?.draft
    expect(lastDraft).toMatchObject({
      mode: 'copy',
      copyFromDepartureId: 'source-departure-1',
    })
    expect(copyDeparture).not.toHaveBeenCalled()
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

    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')

    await user.clear(screen.getByLabelText('团名'))
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    expect(await screen.findByText('请输入团名')).toBeInTheDocument()
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('navigates to departure detail after successful create', async () => {
    const user = userEvent.setup()
    renderWizard()

    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'overview' },
      })
    })
  })

  it('restores template defaultDayCount from the server draft snapshot', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 2,
        snapshot: {
          mode: 'template',
          routeName: '西安-青海湖-茶卡6日游',
          templateId: 'template-1',
          defaultDayCount: 6,
          name: '2026年8月1日 西安-青海湖-茶卡6日游',
          startDate: '2026-08-01',
          endDate: '2026-08-06',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    renderWizard()

    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.getByText('默认 6 天')).toBeInTheDocument()

    await user.click(screen.getByLabelText('出团日期'))
    await user.click(await screen.findByTitle('2026-08-10'))

    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-08-15')
    expect(screen.getByLabelText('天数')).toHaveValue('6')
    expect(screen.getByLabelText('团名')).toHaveValue('2026年8月10日 西安-青海湖-茶卡6日游')
  })

  it('adopts the latest draft version after a 409 so later saves can proceed', async () => {
    const user = userEvent.setup()
    const conflict = new ApiError('草稿版本已变化，请基于最新快照重试', 409, {
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 3,
        snapshot: {
          mode: 'manual',
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    vi.mocked(saveDepartureCreationDraft)
      .mockImplementationOnce(async (payload) => ({
        id: 'task-1',
        status: 'in_progress',
        currentPhase: 'basic_info',
        departureId: null,
        creatorUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: {
          version: 1,
          snapshot: payload.draft,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }))
      .mockRejectedValueOnce(conflict)

    renderWizard()
    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')
    await user.type(screen.getByLabelText('团名'), '改')

    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalledTimes(3)
    })
    expect(vi.mocked(saveDepartureCreationDraft).mock.calls[2]?.[0]).toMatchObject({
      taskId: 'task-1',
      expectedVersion: 3,
    })
  })

  it('retries confirm after a 409 with the latest version and a new idempotency key', async () => {
    const user = userEvent.setup()
    const conflict = new ApiError('草稿版本已变化，请基于最新快照重试', 409, {
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 3,
        snapshot: {
          mode: 'manual',
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    vi.mocked(confirmAiCreateTask).mockRejectedValueOnce(conflict).mockResolvedValueOnce(mockDeparture)

    renderWizard()
    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalledTimes(2)
    })

    const confirmCalls = vi.mocked(confirmAiCreateTask).mock.calls
    expect(confirmCalls[0]?.[1]).toMatchObject({ expectedVersion: 1 })
    expect(confirmCalls[1]?.[1]?.expectedVersion).toBeGreaterThanOrEqual(3)
    expect(confirmCalls[1]?.[2]).toEqual(expect.any(String))
    expect(confirmCalls[1]?.[2]).not.toBe(confirmCalls[0]?.[2])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'overview' },
      })
    })
  })

  it('opens AI assist from an empty template step without posting an invalid draft', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockResolvedValue({
      task: {
        id: 'task-assist',
        status: 'in_progress',
        currentPhase: 'basic_info',
        departureId: null,
        creatorUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: {
          version: 1,
          snapshot: { mode: 'template', routeName: '' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        pendingReview: null,
      },
      runId: 'run-1',
      delegationToken: 'deleg-1',
      agentRuntimeUrl: '/copilotkit',
      expiresAt: '2026-01-01T00:10:00.000Z',
    })

    renderWizard()
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))

    expect(useUiStore.getState().assistPaneCollapsed).toBe(false)
    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(screen.queryByText('AI 辅助建团')).not.toBeInTheDocument()
    expect(saveDepartureCreationDraft).not.toHaveBeenCalled()
    expect(startAiCreateAssistSession).toHaveBeenCalledWith({
      taskId: undefined,
      draft: expect.objectContaining({ mode: 'template', routeName: '' }),
    })
  })

  it('starts assist when the pane expands without clicking AI 辅助', async () => {
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockResolvedValue({
      task: {
        id: 'task-assist',
        status: 'in_progress',
        currentPhase: 'basic_info',
        departureId: null,
        creatorUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: {
          version: 1,
          snapshot: { mode: 'template', routeName: '' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        pendingReview: null,
      },
      runId: 'run-1',
      delegationToken: 'deleg-1',
      agentRuntimeUrl: '/copilotkit',
      expiresAt: '2026-01-01T00:10:00.000Z',
    })

    renderWizard()
    await screen.findByRole('button', { name: /AI 辅助/ })
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })

    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(startAiCreateAssistSession).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /AI 辅助/ })).toBeInTheDocument()
    expect(screen.queryByText('当前页尚未接入业务辅助')).not.toBeInTheDocument()
  })

  it('starts a new assist session when the header toggle reopens the pane', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession)
      .mockResolvedValueOnce(mockAssistSession())
      .mockResolvedValueOnce(
        mockAssistSession({ runId: 'run-2', delegationToken: 'deleg-2' }),
      )

    renderWizard()
    await screen.findByRole('button', { name: /AI 辅助/ })

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })
    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(screen.getByTestId('copilot-kit')).toHaveAttribute(
      'data-authorization',
      'Bearer deleg-1',
    )
    expect(screen.getByTestId('copilot-kit')).toHaveAttribute('data-run-id', 'run-1')

    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    await waitFor(() => {
      expect(screen.queryByTestId('copilot-chat')).not.toBeInTheDocument()
    }, { timeout: 700 })

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })

    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(startAiCreateAssistSession).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('copilot-kit')).toHaveAttribute(
      'data-authorization',
      'Bearer deleg-2',
    )
    expect(screen.getByTestId('copilot-kit')).toHaveAttribute('data-run-id', 'run-2')
  })

  it('opens the AI sidebar without losing the form edit buffer', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockResolvedValue({
      task: {
        id: 'task-assist',
        status: 'in_progress',
        currentPhase: 'basic_info',
        departureId: null,
        creatorUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: {
          version: 1,
          snapshot: {
            mode: 'manual',
            routeName: '喀纳斯阿勒泰10日线',
            name: '喀纳斯阿勒泰10日线',
          },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        pendingReview: null,
      },
      runId: 'run-1',
      delegationToken: 'deleg-1',
      agentRuntimeUrl: '/copilotkit',
      expiresAt: '2026-01-01T00:10:00.000Z',
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    const nameInput = await screen.findByLabelText('团名')
    await user.clear(nameInput)
    await user.type(nameInput, '侧栏打开后仍在')

    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(screen.getByLabelText('团名')).toHaveValue('侧栏打开后仍在')

    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    expect(screen.getByLabelText('团名')).toHaveValue('侧栏打开后仍在')
  })

  it('keeps create departure available after a structured agent failure', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockRejectedValue(new Error('Agent unavailable'))

    renderWizard()
    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    await waitFor(() => {
      expect(startAiCreateAssistSession).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: /创建发团/ }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
  })

  it('shows the agreed assist error in the pane when bootstrap fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockRejectedValue(new Error('Agent unavailable'))

    renderWizard()
    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))

    expect(await screen.findByText('Agent unavailable')).toBeInTheDocument()
    expect(screen.queryByText('当前页尚未接入业务辅助')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建发团/ })).toBeInTheDocument()
  })

  it('replaces Copilot chat with the error copy when a later bootstrap fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession)
      .mockResolvedValueOnce({
        task: {
          id: 'task-assist',
          status: 'in_progress',
          currentPhase: 'basic_info',
          departureId: null,
          creatorUserId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          draft: {
            version: 1,
            snapshot: { mode: 'template', routeName: '' },
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        runId: 'run-1',
        delegationToken: 'deleg-1',
        agentRuntimeUrl: '/copilotkit',
        expiresAt: '2026-01-01T00:10:00.000Z',
      })
      .mockRejectedValueOnce(new Error('委托已过期'))

    renderWizard()
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByText('委托已过期')).toBeInTheDocument()
    expect(screen.queryByTestId('copilot-chat')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('does not mark the form saved when assist bootstrap flush fails', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(startAiCreateAssistSession).mockResolvedValue({
      task: {
        id: 'task-assist',
        status: 'in_progress',
        currentPhase: 'basic_info',
        departureId: null,
        creatorUserId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        draft: {
          version: 2,
          snapshot: {
            mode: 'manual',
            routeName: '喀纳斯阿勒泰10日线',
            name: '未落盘的团名',
          },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        pendingReview: null,
      },
      runId: 'run-1',
      delegationToken: 'deleg-1',
      agentRuntimeUrl: '/copilotkit',
      expiresAt: '2026-01-01T00:10:00.000Z',
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    const nameInput = await screen.findByLabelText('团名')

    vi.mocked(saveDepartureCreationDraft).mockRejectedValue(new Error('发团创建草稿保存失败'))
    await user.clear(nameInput)
    await user.type(nameInput, '未落盘的团名')

    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByTestId('copilot-chat')).toBeInTheDocument()
    expect(screen.queryByText('发团创建草稿已保存')).not.toBeInTheDocument()
    expect(screen.getByText('发团创建草稿保存失败')).toBeInTheDocument()

    mockNavigate.mockClear()
    await user.click(screen.getByRole('button', { name: /返回发团列表/ }))
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/departure' })
  })

  it('shows the pending review overlay and sticky bar from the restored task, not the saved form value', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview()
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 2,
        snapshot: {
          mode: 'manual',
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线 8月1日团',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    })

    renderWizard()

    expect(await screen.findByRole('region', { name: 'AI 阶段审核包' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认写入草稿' })).toBeInTheDocument()
    expect(await screen.findByLabelText('团名候选')).toHaveValue('八月川西团')
    expect(screen.getByText('已保存：喀纳斯阿勒泰10日线 8月1日团')).toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText('出团日期 + 路线名称，可按实际调整'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('负责人')).toBeInTheDocument()
    expect(screen.getByLabelText('发团类型')).toBeInTheDocument()
  })

  it('confirms the pending package through the user API and writes the returned snapshot', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview({ baseObjectVersion: 2 })
    const restored = {
      id: 'task-1',
      status: 'in_progress' as const,
      currentPhase: 'basic_info' as const,
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 2,
        snapshot: {
          mode: 'manual' as const,
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线 8月1日团',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(confirmAiReviewPackage).mockResolvedValue({
      ...restored,
      draft: {
        version: 3,
        snapshot: {
          ...restored.draft.snapshot,
          name: '八月川西团',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    renderWizard()
    await screen.findByRole('button', { name: '确认写入草稿' })
    fireEvent.change(await screen.findByLabelText('团名候选'), { target: { value: '修正团名' } })
    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))

    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        expectedVersion: 2,
        corrections: { name: '修正团名' },
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'AI 阶段审核包' })).not.toBeInTheDocument()
    })
    expect(await screen.findByLabelText('团名')).toHaveValue('八月川西团')
  })

  it('rejects the pending package without writing the candidate into the draft', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview()
    const restored = {
      id: 'task-1',
      status: 'in_progress' as const,
      currentPhase: 'basic_info' as const,
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 2,
        snapshot: {
          mode: 'manual' as const,
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线 8月1日团',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(rejectAiReviewPackage).mockResolvedValue({
      ...restored,
      pendingReview: null,
    })

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '拒绝建议' }))

    await waitFor(() => {
      expect(rejectAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1')
    })
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'AI 阶段审核包' })).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('团名')).toHaveValue('喀纳斯阿勒泰10日线 8月1日团')
    expect(confirmAiReviewPackage).not.toHaveBeenCalled()
  })

  it('patches candidate corrections without autosaving them into the draft snapshot', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview()
    const restored = {
      id: 'task-1',
      status: 'in_progress' as const,
      currentPhase: 'basic_info' as const,
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 2,
        snapshot: {
          mode: 'manual' as const,
          routeName: '喀纳斯阿勒泰10日线',
          name: '喀纳斯阿勒泰10日线 8月1日团',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(patchAiReviewPackage).mockResolvedValue({
      ...restored,
      pendingReview: {
        ...pending,
        candidates: [
          {
            ...pending.candidates[0]!,
            userCorrectedValue: '修正团名',
          },
        ],
      },
    })

    renderWizard()
    const input = await screen.findByLabelText('团名候选')
    fireEvent.change(input, { target: { value: '修正团名' } })

    await waitFor(() => {
      expect(patchAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        corrections: { name: '修正团名' },
      })
    })
    expect(saveDepartureCreationDraft).not.toHaveBeenCalled()
  })
})
