import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider, Modal } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { StrictMode, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluateReviewConfirmMerge } from '@xiaotuanbao/ai-contracts'
import { DepartureType } from '@xiaotuanbao/shared'
import type {
  AiReviewPackageView,
  DepartureSummary,
  RouteTemplateDetailSummary,
} from '@/types/api'
import { ApiError } from '@/lib/request'
import { useUiStore } from '@/app/store/ui.store'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useAgentConversationRuntimeStore } from '@/features/agent-conversation/agent-conversation-runtime.store'
import { AssistPane } from '@/layouts/AssistPane'
import { AssistPaneSlotProvider } from '@/layouts/assist-pane-slot'
import { CreateDepartureWizard } from './CreateDepartureWizard'

vi.mock('@/features/agent-conversation/AgentConversationChat', () => ({
  AgentConversationChat: () => <p>通用会话</p>,
}))

vi.mock('@/features/agent-conversation/ConversationHistoryTrigger', () => ({
  ConversationHistoryTrigger: () => <button type="button">打开会话历史</button>,
}))

const mockNavigate = vi.fn()
let mockSearch: { copyFrom?: string; taskId?: string } = {}
const navigationGuard = vi.hoisted(() => ({
  shouldBlockFn: null as null | ((args: {
    current: { pathname: string }
    next: { pathname: string }
  }) => boolean | Promise<boolean>),
}))
const hitlRegistration = vi.hoisted(() => ({
  current: null as null | {
    render: ComponentType<{
      name: string
      description: string
      toolCallId: string
      args: { reviewPackageId: string }
      status: 'executing'
      result: undefined
      respond: (result: unknown) => Promise<void>
    }>
  },
}))

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
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; searchStr: string; hash: string } }) => unknown
  }) =>
    select({
      location: { pathname: '/departures/new', searchStr: '', hash: '' },
    }),
  useBlocker: (opts: {
    shouldBlockFn: (args: {
      current: { pathname: string }
      next: { pathname: string }
    }) => boolean | Promise<boolean>
  }) => {
    navigationGuard.shouldBlockFn = opts.shouldBlockFn
  },
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
  cancelAiReviewPackage: vi.fn(),
  getAiCreateAssistAvailability: vi.fn(),
  getAiCreateAssistTaskState: vi.fn(),
  startAiCreateAssistSession: vi.fn(),
  sendAiConversationMessage: vi.fn(),
  listAiConversationEvents: vi.fn(),
  listDepartureMaterials: vi.fn().mockResolvedValue([]),
  previewDepartureMaterial: vi.fn(),
  patchAiReviewPackage: vi.fn().mockResolvedValue({
    id: 'task-assist',
    status: 'in_progress',
    currentPhase: 'basic_info',
    departureId: null,
    creatorUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    draft: {
      version: 1,
      snapshot: { mode: 'manual', routeName: '' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    pendingReview: null,
  }),
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
  CopilotChatConfigurationProvider: ({ children }: { children: ReactNode }) => children,
  CopilotChatView: ({
    welcomeScreen,
    inputValue,
    onInputChange,
    onSubmitMessage,
  }: {
    welcomeScreen?: false | ((props: { input?: ReactNode }) => ReactNode)
    inputValue?: string
    onInputChange?: (value: string) => void
    onSubmitMessage?: (value: string) => void
  }) => {
    const input = (
      <textarea
        aria-label="询问当前发团草稿"
        placeholder="询问当前发团草稿…"
        value={inputValue ?? ''}
        onChange={(event) => onInputChange?.(event.target.value)}
      />
    )
    const welcome = typeof welcomeScreen === 'function' ? welcomeScreen({ input }) : null
    return (
      <div data-testid="copilot-chat-view">
        {welcome}
        {welcome ? null : input}
        <button type="button" onClick={() => onSubmitMessage?.(inputValue ?? '')}>
          发送
        </button>
      </div>
    )
  },
  useAgentContext: vi.fn(),
  useAttachments: () => ({
    attachments: [],
    enabled: true,
    dragOver: false,
    fileInputRef: { current: null },
    containerRef: { current: null },
    processFiles: async () => {},
    handleFileUpload: async () => {},
    handleDragOver: () => {},
    handleDragLeave: () => {},
    handleDrop: async () => {},
    removeAttachment: () => {},
    consumeAttachments: () => [],
  }),
  useAgent: () => ({ agent: { addMessage: vi.fn() }, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
  useRenderTool: vi.fn(),
  useHumanInTheLoop: (config: NonNullable<typeof hitlRegistration.current>) => {
    hitlRegistration.current = config
  },
}))

vi.mock('@copilotkit/react-core/v2/styles.css', () => ({}))

vi.stubGlobal(
  'EventSource',
  class MockEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null
    close() {}
    constructor(_url: string, _init?: EventSourceInit) {}
  },
)

vi.mock('@/services/employee.service', () => ({
  listEmployeeOptions: vi.fn(),
}))

vi.mock('@/services/supplier.service', () => ({
  listSuppliers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getSupplier: vi.fn(),
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
  cancelAiReviewPackage,
  getAiCreateAssistAvailability,
  getAiCreateAssistTaskState,
  getAiCreateTask,
  patchAiReviewPackage,
  rejectAiReviewPackage,
  saveDepartureCreationDraft,
  startAiCreateAssistSession,
  sendAiConversationMessage,
  listAiConversationEvents,
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
          <App>
            <CreateDepartureWizard />
            <AssistPane />
          </App>
        </ConfigProvider>
      </QueryClientProvider>
    </AssistPaneSlotProvider>
  )

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

function mockPendingReview(
  overrides: Partial<AiReviewPackageView> = {},
): AiReviewPackageView {
  return {
    id: 'pkg-1',
    status: 'pending',
    confirmationUnit: 'basic_info_draft',
    payloadSchema: 'departure.basic_info_draft@v1',
    schemaSupported: true,
    baseObjectVersion: 1,
    version: 1,
    runId: 'run-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    capabilityKey: 'departure.review-package.propose',
    capabilityVersion: 1,
    targetKind: 'departure_creation_draft',
    targetId: 'draft-1',
    proposalHash: 'a'.repeat(64),
    candidates: [
      {
        fieldKey: 'name',
        proposedValue: '八月川西团',
        userCorrectedValue: undefined,
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫八月川西团' }],
      },
    ],
    baselineSnapshot: {
      mode: 'manual',
      routeName: '喀纳斯阿勒泰10日线',
      name: '喀纳斯阿勒泰10日线 8月1日团',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId: 'user-1',
    },
    ...overrides,
  }
}

async function fillManualRouteAndContinue(
  user: ReturnType<typeof userEvent.setup>,
  routeName = '喀纳斯阿勒泰10日线',
  startDate = '2026-08-01',
) {
  const routeInput = screen.getByLabelText('路线名称')
  await user.clear(routeInput)
  await user.type(routeInput, routeName)
  await user.click(screen.getByLabelText('出团日期'))
  await user.click(await screen.findByTitle(startDate))
}

async function selectCommonRoute(
  user: ReturnType<typeof userEvent.setup>,
  routeName = '西安-青海湖-茶卡6日游',
) {
  await user.click(screen.getByText('选用常用路线'))
  await user.click(await screen.findByRole('button', { name: `选择路线 ${routeName}` }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function templateCard(
  id: string,
  name: string,
  defaultDayCount: number,
): {
  id: string
  name: string
  defaultDayCount: number
  usageCount: number
  updatedAt: string
} {
  return {
    id,
    name,
    defaultDayCount,
    usageCount: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function templateDetail(
  id: string,
  name: string,
  defaultDayCount: number,
  segmentCount: number,
  resourceCount: number,
): RouteTemplateDetailSummary {
  return {
    ...templateCard(id, name, defaultDayCount),
    segmentCount,
    resourceCount,
  }
}

describe('CreateDepartureWizard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Modal.destroyAll()
    mockSearch = {}
    useUiStore.setState({ assistPaneCollapsed: true })
    useAgentConversationStore.getState().reset()
    useAgentConversationRuntimeStore.getState().clear()
    hitlRegistration.current = null
    navigationGuard.shouldBlockFn = null
  })

  beforeEach(() => {
    mockSearch = {}
    useUiStore.setState({ assistPaneCollapsed: true })
    useAgentConversationStore.getState().reset()
    useAgentConversationRuntimeStore.getState().clear()
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
    vi.mocked(listAiConversationEvents).mockResolvedValue({
      conversationId: 'conv-1',
      events: [],
      lastSequence: 0,
      activeBatch: null,
    })
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
    vi.mocked(getAiCreateAssistTaskState).mockResolvedValue({ status: 'idle' })
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

  it('shows one form with create as the primary action and defaults to filling the route name', async () => {
    renderWizard()

    expect(screen.getByText('填写路线名称')).toBeInTheDocument()
    expect(screen.getByLabelText('路线名称')).toBeInTheDocument()
    expect(screen.getByLabelText('团名')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建发团/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('创建进度')).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: /创建发团/ }))
    expect(await screen.findByText('请填写路线名称')).toBeInTheDocument()
    expect(screen.queryByText('请先选择一条常用路线')).not.toBeInTheDocument()
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('claims a task proposed in the active conversation and updates it on the first draft save', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'proposed-task',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 3,
        snapshot: { mode: 'manual', routeName: '' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })
    renderWizard()

    act(() => {
      useAgentConversationStore
        .getState()
        .persistConversation({ id: 'conversation-1', title: '帮我建团' })
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: 'conversation-1',
        events: [
          {
            sequence: 5,
            kind: 'batch_status',
            payload: { createdTaskId: 'proposed-task', continuation: true },
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      })
    })

    await waitFor(() => {
      expect(getAiCreateTask).toHaveBeenCalledWith('proposed-task')
    })
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/departure/new',
        search: { taskId: 'proposed-task' },
        replace: true,
      }),
    )

    await fillManualRouteAndContinue(user)
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    expect(vi.mocked(saveDepartureCreationDraft).mock.calls[0]?.[0]).toMatchObject({
      taskId: 'proposed-task',
      expectedVersion: 3,
    })
    expect(
      vi.mocked(saveDepartureCreationDraft).mock.calls.some(([payload]) => !payload.taskId),
    ).toBe(false)
  })

  it('does not claim a workbench proposal that predates opening the blank wizard', async () => {
    const user = userEvent.setup()
    useAgentConversationStore
      .getState()
      .persistConversation({ id: 'conversation-1', title: '工作台建团' })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'conversation-1',
      events: [
        {
          sequence: 5,
          kind: 'batch_status',
          payload: { createdTaskId: 'workbench-task', continuation: true },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      ],
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })

    expect(getAiCreateTask).not.toHaveBeenCalledWith('workbench-task')
    expect(vi.mocked(saveDepartureCreationDraft).mock.calls[0]?.[0].taskId).toBeUndefined()
  })

  it('keeps an existing wizard task independent from a later conversation proposal', async () => {
    mockSearch = { taskId: 'wizard-task' }
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'wizard-task',
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
          routeName: '原向导路线',
          name: '原向导任务',
          startDate: '2026-08-01',
          endDate: '2026-08-01',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })
    useAgentConversationStore
      .getState()
      .persistConversation({ id: 'conversation-1', title: '另一个提案' })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'conversation-1',
      events: [],
    })
    renderWizard()
    expect(await screen.findByLabelText('团名')).toHaveValue('原向导任务')

    act(() => {
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: 'conversation-1',
        events: [
          {
            sequence: 6,
            kind: 'batch_status',
            payload: { createdTaskId: 'proposed-task', continuation: true },
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      })
    })

    await waitFor(() => {
      expect(getAiCreateTask).toHaveBeenCalledWith('wizard-task')
    })
    expect(getAiCreateTask).toHaveBeenCalledWith('wizard-task')
    expect(getAiCreateTask).not.toHaveBeenCalledWith('proposed-task')
    expect(screen.getByLabelText('团名')).toHaveValue('原向导任务')
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: { taskId: 'proposed-task' } }),
    )
  })

  it('creates a manual departure from the same form without a templateId', async () => {
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

  it('selects a common route in the drawer and shows copy counts on the same form', async () => {
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

    expect(screen.queryByText('西安-青海湖-茶卡6日游')).not.toBeInTheDocument()
    await selectCommonRoute(user)

    expect(await screen.findAllByText('将复制 2 段行程、5 项资源草稿')).not.toHaveLength(0)
    expect(screen.getByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用该路线建团' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
  })

  it('keeps a user-chosen end date when selecting a common route', async () => {
    mockSearch = { taskId: 'task-1' }
    vi.mocked(listRouteTemplates).mockResolvedValue([
      templateCard('template-1', '西安-青海湖-茶卡6日游', 6),
    ])
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
          name: '2026年8月1日 喀纳斯阿勒泰10日线',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    const user = userEvent.setup()
    renderWizard()

    expect(await screen.findByLabelText('结束日期')).toHaveValue('2026-08-10')
    await selectCommonRoute(user)

    expect(await screen.findAllByText('将复制 2 段行程、5 项资源草稿')).not.toHaveLength(0)
    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-08-10')
    expect(screen.getByLabelText('天数')).toHaveValue('10')
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('blocks create when the selected common route has more days than the tour period', async () => {
    mockSearch = { taskId: 'task-1' }
    vi.mocked(listRouteTemplates).mockResolvedValue([
      templateCard('template-1', '西安-青海湖-茶卡6日游', 6),
    ])
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
          name: '2026年8月1日 喀纳斯阿勒泰10日线',
          startDate: '2026-08-01',
          endDate: '2026-08-03',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    const user = userEvent.setup()
    renderWizard()

    expect(await screen.findByLabelText('结束日期')).toHaveValue('2026-08-03')
    await selectCommonRoute(user)
    expect(await screen.findAllByText('将复制 2 段行程、5 项资源草稿')).not.toHaveLength(0)
    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-08-03')

    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    expect(
      await screen.findByText(
        '常用路线为 6 天，与所选团期 3 天（2026-08-01～2026-08-03）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。',
      ),
    ).toBeInTheDocument()
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('blocks create when the selected common route days do not match the tour period', async () => {
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
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    const user = userEvent.setup()
    renderWizard()

    expect(await screen.findByLabelText('结束日期')).toHaveValue('2026-08-10')
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    expect(
      await screen.findByText(
        '常用路线为 6 天，与所选团期 10 天（2026-08-01～2026-08-10）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。',
      ),
    ).toBeInTheDocument()
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
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

    await selectCommonRoute(user)
    await screen.findAllByText('将复制 2 段行程、5 项资源草稿')
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

  it('clears templateId when switching back to filling the route name', async () => {
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
    await selectCommonRoute(user)
    await screen.findAllByText('将复制 2 段行程、5 项资源草稿')

    await user.click(screen.getByText('填写路线名称'))
    expect(screen.getByLabelText('路线名称')).toHaveValue('西安-青海湖-茶卡6日游')
    expect(screen.queryByText('将复制 2 段行程、5 项资源草稿')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /创建发团/ }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
    const lastDraft = vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]?.draft
    expect(lastDraft).toMatchObject({
      mode: 'manual',
      routeName: '西安-青海湖-茶卡6日游',
    })
    expect(lastDraft?.templateId ?? null).toBeNull()
  })

  it('ignores a slower earlier template fetch after picking another route', async () => {
    vi.mocked(listRouteTemplates).mockResolvedValue([
      templateCard('template-1', '西安-青海湖-茶卡6日游', 6),
      templateCard('template-2', '喀纳斯阿勒泰10日线', 10),
    ])
    const first = deferred<RouteTemplateDetailSummary>()
    const second = deferred<RouteTemplateDetailSummary>()
    vi.mocked(getRouteTemplate).mockImplementation((id) => {
      if (id === 'template-1') return first.promise
      if (id === 'template-2') return second.promise
      return Promise.reject(new Error(`unexpected template ${id}`))
    })

    const user = userEvent.setup()
    renderWizard()
    await user.click(screen.getByText('选用常用路线'))
    await user.click(await screen.findByRole('button', { name: '选择路线 西安-青海湖-茶卡6日游' }))
    await user.click(await screen.findByRole('button', { name: '选择路线 喀纳斯阿勒泰10日线' }))

    await act(async () => {
      second.resolve(templateDetail('template-2', '喀纳斯阿勒泰10日线', 10, 3, 8))
      await second.promise
    })
    expect(await screen.findAllByText('将复制 3 段行程、8 项资源草稿')).not.toHaveLength(0)

    await act(async () => {
      first.resolve(templateDetail('template-1', '西安-青海湖-茶卡6日游', 6, 2, 5))
      await first.promise
    })

    expect(screen.getAllByText('将复制 3 段行程、8 项资源草稿').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('将复制 2 段行程、5 项资源草稿')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /创建发团/ }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
    expect(vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]?.draft).toMatchObject({
      mode: 'template',
      templateId: 'template-2',
      routeName: '喀纳斯阿勒泰10日线',
    })
  })

  it('does not re-apply a template after switching back to filling the route name', async () => {
    vi.mocked(listRouteTemplates).mockResolvedValue([
      templateCard('template-1', '西安-青海湖-茶卡6日游', 6),
    ])
    const pending = deferred<RouteTemplateDetailSummary>()
    vi.mocked(getRouteTemplate).mockImplementation(() => pending.promise)

    const user = userEvent.setup()
    renderWizard()
    await selectCommonRoute(user)

    await user.click(screen.getByText('填写路线名称'))
    expect(screen.getByLabelText('路线名称')).toBeInTheDocument()
    expect(screen.queryByText(/将复制/)).not.toBeInTheDocument()

    await act(async () => {
      pending.resolve(templateDetail('template-1', '西安-青海湖-茶卡6日游', 6, 2, 5))
      await pending.promise
    })

    expect(screen.queryAllByText('将复制 2 段行程、5 项资源草稿')).toHaveLength(0)
    expect(screen.getByLabelText('路线名称')).toHaveValue('')

    await user.type(screen.getByLabelText('路线名称'), '喀纳斯阿勒泰10日线')
    await user.click(screen.getByRole('button', { name: /创建发团/ }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
    const lastDraft = vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]?.draft
    expect(lastDraft).toMatchObject({
      mode: 'manual',
      routeName: '喀纳斯阿勒泰10日线',
    })
    expect(lastDraft?.templateId ?? null).toBeNull()
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

  it('keeps the mobile create action at least 44px high', () => {
    const css = readFileSync(resolve(__dirname, './CreateDepartureWizard.module.css'), 'utf8')
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.primaryAction\s*\{[^}]*min-height:\s*44px/)
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
    expect(screen.getByText('复制自发团 XTB2026060009，复用发团类型、备注与执行结构，不含客源、财务、金额与供应关系')).toBeInTheDocument()
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
    expect(screen.queryByText('选用常用路线')).not.toBeInTheDocument()
    expect(screen.queryByText('复制行程段')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建发团/ })).toBeDisabled()

    resolveDeparture({
      ...mockDeparture,
      id: 'source-departure-1',
      departureNo: 'XTB2026060009',
      routeName: '喀纳斯阿勒泰10日线',
      departureType: DepartureType.INDEPENDENT,
      notes: '源团基础备注',
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
    expect(screen.getByText('复制自发团 XTB2026060009，复用发团类型、备注与执行结构，不含客源、财务、金额与供应关系')).toBeInTheDocument()
    expect(screen.getByText('独立团')).toBeInTheDocument()
    expect(screen.getByLabelText('备注')).toHaveValue('源团基础备注')
    await user.clear(screen.getByLabelText('备注'))

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
      departureType: DepartureType.INDEPENDENT,
      notes: null,
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

      await user.click(screen.getByText('选用常用路线'))
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
        replace: true,
      })
    })
  })

  it('opens the already-created departure without stacking another wizard history entry', async () => {
    mockSearch = { taskId: 'task-1' }
    vi.mocked(getAiCreateTask).mockResolvedValue({
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      departureId: 'departure-1',
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 1,
        snapshot: { mode: 'manual', routeName: '喀纳斯阿勒泰10日线' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    renderWizard()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'overview' },
        replace: true,
      })
    })
    expect(screen.queryByText('该 AI 建团任务已创建正式发团，正在打开详情')).not.toBeInTheDocument()
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
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    await user.type(screen.getByLabelText('团名'), '改')

    await waitFor(() => {
      expect(saveDepartureCreationDraft.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
    expect(vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]).toMatchObject({
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
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    await user.click(screen.getByRole('button', { name: /创建发团/ }))

    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalledTimes(2)
    })

    const confirmCalls = vi.mocked(confirmAiCreateTask).mock.calls
    expect(confirmCalls[0]?.[1]?.expectedVersion).toEqual(expect.any(Number))
    expect(confirmCalls[1]?.[1]?.expectedVersion).toBeGreaterThanOrEqual(3)
    expect(confirmCalls[1]?.[2]).toEqual(expect.any(String))
    expect(confirmCalls[1]?.[2]).not.toBe(confirmCalls[0]?.[2])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/departure/$departureId',
        params: { departureId: 'departure-1' },
        search: { tab: 'overview' },
        replace: true,
      })
    })
  })

  it('opens the unified Agent pane from an empty form without starting a dedicated assist session', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))

    expect(useUiStore.getState().assistPaneCollapsed).toBe(false)
    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(screen.queryByLabelText('询问当前发团草稿')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发团资料' })).not.toBeInTheDocument()
    expect(screen.queryByText('AI 辅助建团')).not.toBeInTheDocument()
    expect(screen.getByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument()
    expect(saveDepartureCreationDraft).not.toHaveBeenCalled()
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()
  })

  it('shows persisted background work at the task entry without opening the assist pane', async () => {
    mockSearch = { taskId: 'task-1' }
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(getAiCreateAssistTaskState).mockResolvedValue({ status: 'ai_processing' })

    renderWizard()

    expect(await screen.findByText('AI 辅助 · AI 处理中')).toBeInTheDocument()
    expect(useUiStore.getState().assistPaneCollapsed).toBe(true)
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()
  })

  it('uses the unified Agent pane when expanded without clicking AI 辅助', async () => {
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await screen.findByRole('button', { name: /AI 辅助/ })
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })

    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(screen.queryByLabelText('询问当前发团草稿')).not.toBeInTheDocument()
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /AI 辅助/ })).toBeInTheDocument()
    expect(screen.queryByText('当前页尚未接入业务辅助')).not.toBeInTheDocument()
  })

  it('reopening the pane keeps the unified Agent shell and does not start a dedicated session', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await screen.findByRole('button', { name: /AI 辅助/ })

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })
    expect(await screen.findByText('通用会话')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    })

    act(() => {
      useUiStore.setState({ assistPaneCollapsed: false })
    })

    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()
  })

  it('opens the unified Agent pane without losing the form edit buffer', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    const nameInput = await screen.findByLabelText('团名')
    await user.clear(nameInput)
    await user.type(nameInput, '侧栏打开后仍在')

    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(screen.getByLabelText('团名')).toHaveValue('侧栏打开后仍在')

    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    expect(screen.getByLabelText('团名')).toHaveValue('侧栏打开后仍在')
  })

  it('keeps create departure available after opening the unified Agent pane', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    await screen.findByLabelText('团名')
    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /创建发团/ }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
  })

  it('does not start a dedicated assist session or rewrite save status when opening the pane', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })

    renderWizard()
    await fillManualRouteAndContinue(user)
    const nameInput = await screen.findByLabelText('团名')

    vi.mocked(saveDepartureCreationDraft).mockRejectedValue(new Error('发团创建草稿保存失败'))
    await user.clear(nameInput)
    await user.type(nameInput, '未落盘的团名')

    await user.click(await screen.findByRole('button', { name: /AI 辅助/ }))
    expect(await screen.findByText('通用会话')).toBeInTheDocument()
    expect(startAiCreateAssistSession).not.toHaveBeenCalled()
    expect(screen.queryByText('发团创建草稿已保存')).not.toBeInTheDocument()
  })

  it('reopens the pending-review conversation when restoring a task after reload', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview({ conversationId: 'conv-restore' })
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
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'conv-restore',
      view: 'history',
    })
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

  it('shows a read-only templateId overlay on the form without chat write buttons', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview({
      candidates: [
        {
          fieldKey: 'templateId',
          proposedValue: 'tpl-1',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: 'searchRouteTemplates:name_contains_token:川西' }],
        },
      ],
    })
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
          routeName: '',
          name: '喀纳斯阿勒泰10日线 8月1日团',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
          ownerUserId: 'user-1',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    })

    vi.mocked(getRouteTemplate).mockResolvedValue({
      id: 'tpl-1',
      name: '川西稻城线',
      defaultDayCount: 8,
      usageCount: 4,
      updatedAt: '2026-01-01T00:00:00.000Z',
      segmentCount: 2,
      resourceCount: 1,
    })

    renderWizard()

    expect(await screen.findByRole('region', { name: 'AI 阶段审核包' })).toBeInTheDocument()
    expect(await screen.findByLabelText('常用路线候选')).toHaveTextContent('川西稻城线')
    expect(screen.getByRole('button', { name: '确认写入草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '采用' })).not.toBeInTheDocument()
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
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(patchAiReviewPackage).mockResolvedValue(restored)
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
      expect(confirmAiReviewPackage).toHaveBeenCalledWith(
        'task-1',
        'pkg-1',
        {
          expectedVersion: 2,
          expectedPackageVersion: 1,
          corrections: { name: '修正团名' },
        },
        expect.stringMatching(/\S+/),
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'AI 阶段审核包' })).not.toBeInTheDocument()
    })
    expect(await screen.findByLabelText('团名')).toHaveValue('八月川西团')
  })

  it('confirms the open conversation package instead of the newest pendingReview alias', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    const newestOther = mockPendingReview({
      id: 'pkg-newest',
      conversationId: 'conv-other',
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '另一会话团名',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '另一会话团名' }],
        },
      ],
    })
    const currentConversation = mockPendingReview({
      id: 'pkg-current',
      conversationId: 'conv-1',
    })
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
      pendingReview: newestOther,
      pendingReviews: [newestOther, currentConversation],
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    vi.mocked(confirmAiReviewPackage).mockResolvedValue({
      ...restored,
      pendingReview: newestOther,
      pendingReviews: [newestOther],
      draft: {
        version: 3,
        snapshot: {
          ...restored.draft.snapshot,
          name: '八月川西团',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'conv-1',
      title: '当前会话',
      returnLocation: null,
      historyRailCollapsed: false,
      globalOpen: false,
    })
    renderWizard()
    expect(await screen.findByLabelText('团名候选')).toHaveValue('八月川西团')
    expect(screen.queryByDisplayValue('另一会话团名')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))

    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenCalledWith(
        'task-1',
        'pkg-current',
        {
          expectedVersion: 2,
          expectedPackageVersion: 1,
        },
        expect.stringMatching(/\S+/),
      )
    })
    expect(confirmAiReviewPackage).not.toHaveBeenCalledWith(
      'task-1',
      'pkg-newest',
      expect.anything(),
      expect.anything(),
    )
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
      expect(rejectAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        expectedPackageVersion: 1,
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'AI 阶段审核包' })).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('团名')).toHaveValue('喀纳斯阿勒泰10日线 8月1日团')
    expect(confirmAiReviewPackage).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before cancelling the suggestion and creating from the saved draft', async () => {
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
    vi.mocked(cancelAiReviewPackage).mockResolvedValue({ ...restored, pendingReview: null })
    vi.mocked(confirmAiCreateTask).mockResolvedValue(mockDeparture)

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '创建发团' }))

    expect((await screen.findAllByText('取消 AI 建议并创建发团？')).length).toBeGreaterThan(0)
    expect(screen.getByText(/当前有待审核建议/)).toHaveTextContent('团名：八月川西团')
    expect(cancelAiReviewPackage).not.toHaveBeenCalled()
    expect(confirmAiCreateTask).not.toHaveBeenCalled()

    await user.click((await screen.findAllByRole('button', { name: '确认取消并创建' }))[0]!)

    await waitFor(() => {
      expect(cancelAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        expectedPackageVersion: 1,
      }, { silentError: true })
      expect(confirmAiCreateTask).toHaveBeenCalled()
    })
    expect(cancelAiReviewPackage.mock.invocationCallOrder[0]).toBeLessThan(
      confirmAiCreateTask.mock.invocationCallOrder[0]!,
    )
  })

  it('does not create when cancelling the package reports that another device handled it', async () => {
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
    const handled = {
      ...restored,
      draft: {
        ...restored.draft,
        version: 3,
        snapshot: { ...restored.draft.snapshot, name: '已应用的 AI 团名' },
      },
      pendingReview: { ...pending, id: 'other-pkg' },
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(cancelAiReviewPackage).mockRejectedValue(
      new ApiError('审核包已处理', 409, handled),
    )

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '创建发团' }))
    await user.click((await screen.findAllByRole('button', { name: '确认取消并创建' }))[0]!)

    await waitFor(() => {
      expect(cancelAiReviewPackage).toHaveBeenCalled()
    })
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('does not create when cancelling the package has a version conflict without a task summary', async () => {
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
    vi.mocked(cancelAiReviewPackage).mockRejectedValue(
      new ApiError('审核包版本已变化，请刷新后重试', 409),
    )

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '创建发团' }))
    await user.click((await screen.findAllByRole('button', { name: '确认取消并创建' }))[0]!)

    await waitFor(() => {
      expect(cancelAiReviewPackage).toHaveBeenCalled()
    })
    expect(confirmAiCreateTask).not.toHaveBeenCalled()
  })

  it('does not cancel again when creation fails after the package was cancelled', async () => {
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
    const cancelled = { ...restored, pendingReview: null }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(cancelAiReviewPackage).mockResolvedValue(cancelled)
    vi.mocked(confirmAiCreateTask)
      .mockRejectedValueOnce(new Error('创建暂时失败'))
      .mockResolvedValueOnce(mockDeparture)

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '创建发团' }))
    await user.click((await screen.findAllByRole('button', { name: '确认取消并创建' }))[0]!)

    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalledTimes(1)
    })
    expect(cancelAiReviewPackage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '确认取消并创建' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '创建发团' }))
    await waitFor(() => {
      expect(confirmAiCreateTask).toHaveBeenCalledTimes(2)
    })
    expect(cancelAiReviewPackage).toHaveBeenCalledTimes(1)
  })

  it('clears the pending review overlay when another device already handled the package', async () => {
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
    const handled = {
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
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(confirmAiReviewPackage).mockRejectedValue(
      new ApiError('审核包已处理', 409, handled),
    )

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '确认写入草稿' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'AI 阶段审核包' })).not.toBeInTheDocument()
    })
    expect(await screen.findByLabelText('团名')).toHaveValue('八月川西团')
  })

  it('syncs the form from a 409 draft-version conflict so the next confirm uses the latest version', async () => {
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
    const remote = {
      ...restored,
      draft: {
        version: 3,
        snapshot: {
          ...restored.draft.snapshot,
          name: '八月川西团',
          startDate: '2026-10-01',
          endDate: '2026-10-08',
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: {
        ...pending,
        id: 'pkg-2',
        baseObjectVersion: 3,
        baselineSnapshot: {
          ...restored.draft.snapshot,
          name: '八月川西团',
          startDate: '2026-10-01',
          endDate: '2026-10-08',
        },
      },
      reviewConflict: { status: 'draft_version' as const, conflictFields: [] },
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(confirmAiReviewPackage)
      .mockRejectedValueOnce(new ApiError('草稿版本已变化，请基于最新快照重试', 409, remote))
      .mockResolvedValueOnce({
        ...remote,
        pendingReview: null,
      })

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '确认写入草稿' }))

    await waitFor(() => {
      expect(screen.getByText('已保存：八月川西团')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))
    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenNthCalledWith(
        2,
        'task-1',
        'pkg-2',
        {
          expectedVersion: 3,
          expectedPackageVersion: 1,
        },
        expect.stringMatching(/\S+/),
      )
    })
  })

  it('confirms with the local autosaved draft version instead of the stale task query cache', async () => {
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
        version: 4,
        snapshot: restored.draft.snapshot,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    renderWizard()
    await screen.findByRole('button', { name: '确认写入草稿' })
    const savesBeforeEdit = vi.mocked(saveDepartureCreationDraft).mock.calls.length

    await user.type(screen.getByLabelText('备注'), '集合时间提前')
    await waitFor(() => {
      expect(vi.mocked(saveDepartureCreationDraft).mock.calls.length).toBeGreaterThan(savesBeforeEdit)
    })

    const lastSave = vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]
    const localVersion = (lastSave?.expectedVersion ?? 0) + 1
    expect(localVersion).toBeGreaterThan(restored.draft.version)

    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))
    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenCalledWith(
        'task-1',
        'pkg-1',
        {
          expectedVersion: localVersion,
          expectedPackageVersion: 1,
        },
        expect.stringMatching(/\S+/),
      )
    })
  })

  it('does not persist auto-derived 团名 when filling 路线名称 over a pending name candidate', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    const baseline = {
      mode: 'manual' as const,
      routeName: '',
      name: null,
      startDate: '2026-08-18',
      endDate: '2026-08-18',
      ownerUserId: 'user-1',
    }
    const pending = mockPendingReview({
      baseObjectVersion: 1,
      baselineSnapshot: baseline,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '2026年8月13号西北大环线10日游',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫2026年8月13号西北大环线10日游' }],
        },
        {
          fieldKey: 'startDate',
          proposedValue: '2026-08-13',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '开始时间是2026年的8月13号' }],
        },
        {
          fieldKey: 'endDate',
          proposedValue: '2026-08-22',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '行程总共10天' }],
        },
        {
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 12,
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '大概12个人' }],
        },
      ],
    })
    const restored = {
      id: 'task-1',
      status: 'in_progress' as const,
      currentPhase: 'basic_info' as const,
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 1,
        snapshot: baseline,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(saveDepartureCreationDraft).mockImplementation(async (payload) => ({
      ...restored,
      draft: {
        version: (payload.expectedVersion ?? 0) + 1,
        snapshot: payload.draft,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }))
    vi.mocked(confirmAiReviewPackage).mockResolvedValue({
      ...restored,
      draft: {
        version: 3,
        snapshot: {
          ...baseline,
          routeName: '西北大环线',
          name: '2026年8月13号西北大环线10日游',
          startDate: '2026-08-13',
          endDate: '2026-08-22',
          expectedGuestCountHint: 12,
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: null,
    })

    renderWizard()
    await screen.findByRole('button', { name: '确认写入草稿' })
    await user.type(screen.getByLabelText('路线名称'), '西北大环线')
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })

    const lastDraft = vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]?.draft
    expect(lastDraft?.routeName).toBe('西北大环线')
    expect(lastDraft?.name ?? null).toBeNull()
    expect(
      evaluateReviewConfirmMerge({
        baselineSnapshot: baseline,
        currentSnapshot: lastDraft!,
        submissions: {
          name: '2026年8月13号西北大环线10日游',
          startDate: '2026-08-13',
          endDate: '2026-08-22',
          expectedGuestCountHint: 12,
        },
      }).status,
    ).toBe('ok')

    await user.click(screen.getByRole('button', { name: '确认写入草稿' }))
    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenCalled()
    })
  })

  it('restores a previously auto-saved 团名 back to the review baseline before confirm', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    const baseline = {
      mode: 'manual' as const,
      routeName: '',
      name: null as string | null,
      startDate: '2026-08-18',
      endDate: '2026-08-18',
      ownerUserId: 'user-1',
    }
    const poisoned = {
      ...baseline,
      routeName: '西北大环线',
      name: '2026年8月18日 西',
    }
    const pending = mockPendingReview({
      baseObjectVersion: 1,
      baselineSnapshot: baseline,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '2026年8月13号西北大环线10日游',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫2026年8月13号西北大环线10日游' }],
        },
      ],
    })
    const restored = {
      id: 'task-1',
      status: 'in_progress' as const,
      currentPhase: 'basic_info' as const,
      departureId: null,
      creatorUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      draft: {
        version: 6,
        snapshot: poisoned,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(saveDepartureCreationDraft).mockImplementation(async (payload) => ({
      ...restored,
      draft: {
        version: (payload.expectedVersion ?? 0) + 1,
        snapshot: payload.draft,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }))
    vi.mocked(confirmAiReviewPackage).mockResolvedValue({
      ...restored,
      pendingReview: null,
    })

    renderWizard()
    await user.click(await screen.findByRole('button', { name: '确认写入草稿' }))

    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    const flushed = vi.mocked(saveDepartureCreationDraft).mock.calls.at(-1)?.[0]?.draft
    expect(flushed?.routeName).toBe('西北大环线')
    expect(flushed?.name ?? null).toBeNull()
    await waitFor(() => {
      expect(confirmAiReviewPackage).toHaveBeenCalled()
    })
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

  it('patches every field corrected inside the same debounce window', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview({
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '八月川西团',
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫八月川西团' }],
        },
        {
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 8,
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '大概12人' }],
        },
      ],
    })
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
    vi.mocked(patchAiReviewPackage).mockImplementation(async (_taskId, _packageId, payload) => ({
      ...restored,
      pendingReview: {
        ...pending,
        candidates: pending.candidates.map((candidate) =>
          candidate.fieldKey in payload.corrections
            ? { ...candidate, userCorrectedValue: payload.corrections[candidate.fieldKey] ?? null }
            : candidate,
        ),
      },
    }))

    renderWizard()
    fireEvent.change(await screen.findByLabelText('团名候选'), { target: { value: '修正团名' } })
    fireEvent.change(await screen.findByLabelText('预计人数提示候选'), { target: { value: '12' } })

    await waitFor(() => {
      expect(patchAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        corrections: { name: '修正团名', expectedGuestCountHint: 12 },
      })
    })
    expect(screen.getByLabelText('团名候选')).toHaveValue('修正团名')
    expect(screen.getByLabelText('预计人数提示候选')).toHaveValue('12')
  })

  it('keeps an explicit guest-count clear through patch instead of restoring the proposal', async () => {
    mockSearch = { taskId: 'task-1' }
    const pending = mockPendingReview({
      candidates: [
        {
          fieldKey: 'expectedGuestCountHint',
          proposedValue: 8,
          userCorrectedValue: undefined,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '大概8人' }],
        },
      ],
    })
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
          expectedGuestCountHint: 8,
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      pendingReview: pending,
    }
    vi.mocked(getAiCreateTask).mockResolvedValue(restored)
    vi.mocked(patchAiReviewPackage).mockImplementation(async (_taskId, _packageId, payload) => ({
      ...restored,
      pendingReview: {
        ...pending,
        candidates: pending.candidates.map((item) =>
          item.fieldKey in payload.corrections
            ? { ...item, userCorrectedValue: payload.corrections[item.fieldKey] ?? null }
            : item,
        ),
      },
    }))

    renderWizard()
    fireEvent.change(await screen.findByLabelText('预计人数提示候选'), { target: { value: '' } })

    await waitFor(() => {
      expect(patchAiReviewPackage).toHaveBeenCalledWith('task-1', 'pkg-1', {
        corrections: { expectedGuestCountHint: null },
      })
    })
    expect(screen.getByLabelText('预计人数提示候选')).toHaveValue('')
  })

  it('does not show a half-initialized form when task restore fails', async () => {
    mockSearch = { taskId: 'missing-task' }
    vi.mocked(getAiCreateTask).mockRejectedValue(new Error('任务不存在'))

    renderWizard()

    expect(await screen.findByText('发团创建草稿恢复失败')).toBeInTheDocument()
    expect(screen.getByText('任务不存在')).toBeInTheDocument()
    expect(screen.queryByLabelText('团名')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建草稿' })).toBeInTheDocument()
  })

  it('retries a failed task restore without leaving the recovery view until it succeeds', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'task-1' }
    vi.mocked(getAiCreateTask).mockRejectedValueOnce(new Error('网络中断'))

    renderWizard()
    expect(await screen.findByText('发团创建草稿恢复失败')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByLabelText('团名')).toBeInTheDocument()
    expect(screen.queryByText('发团创建草稿恢复失败')).not.toBeInTheDocument()
  })

  it('starts a new draft from restore failure instead of exposing an empty form', async () => {
    const user = userEvent.setup()
    mockSearch = { taskId: 'missing-task' }
    vi.mocked(getAiCreateTask).mockRejectedValue(new Error('任务不存在'))

    renderWizard()
    await screen.findByText('发团创建草稿恢复失败')
    await user.click(screen.getByRole('button', { name: '新建草稿' }))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/departure/new',
      search: {},
      replace: true,
    })
    expect(screen.queryByLabelText('团名')).not.toBeInTheDocument()
  })

  it('offers retry after draft save failure', async () => {
    const user = userEvent.setup()
    renderWizard()
    await fillManualRouteAndContinue(user)
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })

    vi.mocked(saveDepartureCreationDraft).mockRejectedValueOnce(new Error('发团创建草稿保存失败'))
    await user.type(screen.getByLabelText('团名'), '改')

    expect(await screen.findByText('发团创建草稿保存失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试保存' }))
    expect(await screen.findByText('发团创建草稿已保存')).toBeInTheDocument()
  })

  it('flushes a dirty draft before SPA navigation and stays when save fails', async () => {
    const user = userEvent.setup()
    renderWizard()
    await fillManualRouteAndContinue(user)
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    vi.mocked(saveDepartureCreationDraft).mockClear()
    await user.type(screen.getByLabelText('团名'), '改')

    const blocked = await navigationGuard.shouldBlockFn?.({
      current: { pathname: '/departure/new' },
      next: { pathname: '/' },
    })

    expect(saveDepartureCreationDraft).toHaveBeenCalled()
    expect(blocked).toBe(false)
  })

  it('blocks SPA navigation when flush fails and keeps a retry action', async () => {
    const user = userEvent.setup()
    renderWizard()
    await fillManualRouteAndContinue(user)
    await waitFor(() => {
      expect(saveDepartureCreationDraft).toHaveBeenCalled()
    })
    vi.mocked(saveDepartureCreationDraft).mockRejectedValue(new Error('发团创建草稿保存失败'))
    await user.type(screen.getByLabelText('团名'), '改')

    const blocked = await navigationGuard.shouldBlockFn?.({
      current: { pathname: '/departure/new' },
      next: { pathname: '/departure' },
    })

    expect(blocked).toBe(true)
    expect(await screen.findByText('发团创建草稿保存失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试保存' })).toBeInTheDocument()
    expect(screen.getByLabelText('团名')).toBeInTheDocument()
  })

  it('shows AI availability errors instead of hiding the assist entry', async () => {
    const user = userEvent.setup()
    vi.mocked(getAiCreateAssistAvailability).mockRejectedValueOnce(new Error('网络中断'))

    renderWizard()
    expect(await screen.findByText('AI 辅助状态加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AI 辅助/ })).not.toBeInTheDocument()

    vi.mocked(getAiCreateAssistAvailability).mockResolvedValue({
      enabled: true,
      agentRuntimeUrl: '/copilotkit',
    })
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('button', { name: /AI 辅助/ })).toBeInTheDocument()
  })

  it('shows route template load errors instead of an empty list', async () => {
    const user = userEvent.setup()
    vi.mocked(listRouteTemplates).mockRejectedValue(new Error('网络中断'))

    renderWizard()
    await user.click(screen.getByText('选用常用路线'))

    expect(await screen.findByText('常用路线加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无常用路线。可先填写路线名称')).not.toBeInTheDocument()
  })
})
