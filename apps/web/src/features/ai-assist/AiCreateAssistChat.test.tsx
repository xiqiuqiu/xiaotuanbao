import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, StrictMode, type ComponentType, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiCreateSharedLightStateSchema } from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { AiCreateAssistChat } from './AiCreateAssistChat'
import { sendAiConversationMessage, listAiConversationEvents } from '@/services/ai-create-task.service'

const { addMessage, runAgent, useAgentContext } = vi.hoisted(() => ({
  addMessage: vi.fn(),
  runAgent: vi.fn(),
  useAgentContext: vi.fn(),
}))

let capturedKit: {
  runtimeUrl?: string
  headers?: Record<string, string>
  properties?: Record<string, unknown>
  useSingleEndpoint?: boolean
  onError?: (event: { error: Error }) => void
} = {}
let capturedChat: { agentId?: string; onError?: (event: { error: Error }) => void } = {}
let capturedRenderTool: {
  name?: string
  render?: (props: {
    status: string
    parameters?: { candidates?: Array<{ fieldKey: string }> }
    result?: unknown
  }) => ReactNode
} = {}
let capturedSearchRenderTool: {
  name?: string
  render?: (props: {
    status: string
    result?: unknown
  }) => ReactNode
} = {}
let capturedHumanInTheLoop: {
  name?: string
  render?: ComponentType<{
    name: string
    description: string
    toolCallId: string
    args: { reviewPackageId: string }
    status: 'executing'
    result: undefined
    respond: (result: unknown) => Promise<void>
  }>
} = {}

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({
    children,
    runtimeUrl,
    headers,
    properties,
    useSingleEndpoint,
    onError,
  }: {
    children: ReactNode
    runtimeUrl?: string
    headers?: Record<string, string>
    properties?: Record<string, unknown>
    useSingleEndpoint?: boolean
    onError?: (event: { error: Error }) => void
  }) => {
    capturedKit = { runtimeUrl, headers, properties, useSingleEndpoint, onError }
    return <div data-testid="copilot-kit">{children}</div>
  },
  CopilotChat: ({
    agentId,
    onError,
  }: {
    agentId?: string
    onError?: (event: { error: Error }) => void
  }) => {
    capturedChat = { agentId, onError }
    return (
      <div data-testid="copilot-chat" data-agent-id={agentId}>
        <button type="button" onClick={() => onError?.({ error: new Error('runtime down') })}>
          触发协助错误
        </button>
      </div>
    )
  },
  useAgentContext: (...args: unknown[]) => useAgentContext(...args),
  useAgent: () => ({ agent: { addMessage }, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
  useRenderTool: (config: { name?: string; render?: (props: never) => ReactNode }) => {
    if (config.name === 'searchRouteTemplates') {
      capturedSearchRenderTool = config
      return
    }
    capturedRenderTool = config
  },
  useHumanInTheLoop: (config: typeof capturedHumanInTheLoop) => {
    capturedHumanInTheLoop = config
  },
}))

vi.mock('@/services/ai-create-task.service', () => ({
  sendAiConversationMessage: vi.fn(),
  listAiConversationEvents: vi.fn(),
}))

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  url: string
  close() {}
  constructor(url: string, _init?: EventSourceInit) {
    this.url = url
    lastEventSource = this
  }
}
let lastEventSource: MockEventSource | null = null
vi.stubGlobal('EventSource', MockEventSource)

vi.mock('@copilotkit/react-core/v2/styles.css', () => ({}))

const chatProps = {
  agentRuntimeUrl: '/copilotkit',
  delegationToken: 'deleg-1',
  taskId: 'task-assist',
  runId: 'run-1',
  conversationId: 'conv-1',
  snapshotVersion: 1,
  stageKey: 'basic_info' as const,
  runStatus: 'idle' as const,
}

const pendingReview: AiReviewPackageView = {
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
      evidence: [{ kind: 'user_message', excerpt: '八月川西团' }],
    },
  ],
}

describe('AiCreateAssistChat', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    lastEventSource = null
    capturedKit = {}
    capturedChat = {}
    capturedRenderTool = {}
    capturedSearchRenderTool = {}
    capturedHumanInTheLoop = {}
  })

  it('passes runtimeUrl and identity headers without mounting CopilotChat send', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-headers" />)

    expect(capturedKit.headers).toMatchObject({
      Authorization: 'Bearer deleg-1',
      'X-Ai-Task-Id': 'task-assist',
      'X-Ai-Run-Id': 'run-headers',
    })
    expect(capturedKit.runtimeUrl).toBe('/copilotkit')
    expect(capturedKit.useSingleEndpoint).toBe(false)
    expect(screen.getByLabelText('询问当前发团草稿')).toBeInTheDocument()
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('exposes only shared light state to CopilotKit, never the draft snapshot', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-light" reviewPackageId="pkg-1" />)

    expect(useAgentContext).toHaveBeenCalled()
    const readable = useAgentContext.mock.calls[0]?.[0] as { value?: unknown }
    const parsed = aiCreateSharedLightStateSchema.parse(readable.value)
    expect(parsed).toEqual({
      taskId: 'task-assist',
      stageKey: 'basic_info',
      runStatus: 'idle',
      reviewPackageId: 'pkg-1',
      snapshotVersion: 1,
      progress: 'collecting',
    })
    expect(parsed).not.toHaveProperty('draft')
    expect(JSON.stringify(parsed)).not.toContain('routeName')
  })

  it('renders a thin notice that confirmation belongs on the form', async () => {
    const onReviewPackageSubmitted = vi.fn()
    render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-notice"
        onReviewPackageSubmitted={onReviewPackageSubmitted}
      />,
    )

    expect(capturedRenderTool.name).toBe('submitReviewPackage')
    const inProgress = capturedRenderTool.render?.({
      status: 'inProgress',
      parameters: { candidates: [{ fieldKey: 'name' }] },
    })
    const complete = capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'name' }, { fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-1' },
    })

    render(
      <>
        {inProgress}
        {complete}
      </>,
    )
    expect(screen.getByText('正在整理审核建议…')).toBeInTheDocument()
    expect(
      screen.getByText(
        '已建议修改团名、路线。请到中间表单确认，不会自动写入发团创建草稿。',
      ),
    ).toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(1)
  })

  it('notifies again when a later submitReviewPackage completes with a different package', async () => {
    const onReviewPackageSubmitted = vi.fn()
    render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-notice-second"
        onReviewPackageSubmitted={onReviewPackageSubmitted}
      />,
    )

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'name' }] },
      result: { reviewPackageId: 'pkg-1', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(1)

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-2', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(2)

    capturedRenderTool.render?.({
      status: 'complete',
      parameters: { candidates: [{ fieldKey: 'routeName' }] },
      result: { reviewPackageId: 'pkg-2', status: 'pending' },
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onReviewPackageSubmitted).toHaveBeenCalledTimes(2)
  })

  it('shows a waiting state and responds after the form confirms', async () => {
    const respond = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-hitl"
        pendingReview={{
          ...pendingReview,
          candidates: pendingReview.candidates.map((candidate) => ({
            ...candidate,
            clarity: 'needs_confirmation' as const,
          })),
        }}
      />,
    )

    expect(capturedHumanInTheLoop.name).toBe('awaitReviewPackageDecision')
    const RenderHitl = capturedHumanInTheLoop.render!
    const hitlProps = {
      name: 'awaitReviewPackageDecision',
      description: '等待 User 审核 AI 候选',
      toolCallId: 'call-1',
      args: { reviewPackageId: 'pkg-1' },
      status: 'executing' as const,
      result: undefined,
      respond,
    }
    const card = render(createElement(RenderHitl, hitlProps))

    expect(screen.getByText('AI 建议待审核')).toBeInTheDocument()
    expect(screen.getByText('已建议修改团名')).toBeInTheDocument()
    expect(screen.getByText('其中 1 项需要重点核对')).toBeInTheDocument()
    expect(screen.getByText('等待你在发团表单中完成审核')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认写入草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝建议' })).not.toBeInTheDocument()
    expect(card.container.querySelector('button')).toBeNull()
    expect(respond).not.toHaveBeenCalled()

    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-hitl"
        pendingReview={null}
        reviewDecision={{
          reviewPackageId: 'pkg-1',
          status: 'confirmed',
          snapshotVersion: 2,
        }}
      />,
    )
    const UpdatedRenderHitl = capturedHumanInTheLoop.render!
    card.rerender(createElement(UpdatedRenderHitl, hitlProps))

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith({
        reviewPackageId: 'pkg-1',
        status: 'confirmed',
        snapshotVersion: 2,
      })
    })
    expect(respond).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting without a decision and returns a rejection only after the user API succeeds', async () => {
    const respond = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-reject"
        pendingReview={pendingReview}
        reviewDecision={null}
      />,
    )
    const RenderHitl = capturedHumanInTheLoop.render!
    const hitlProps = {
      name: 'awaitReviewPackageDecision',
      description: '等待 User 审核 AI 候选',
      toolCallId: 'call-reject',
      args: { reviewPackageId: 'pkg-1' },
      status: 'executing' as const,
      result: undefined,
      respond,
    }
    const card = render(createElement(RenderHitl, hitlProps))

    expect(respond).not.toHaveBeenCalled()
    rerender(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-reject"
        pendingReview={null}
        reviewDecision={{ reviewPackageId: 'pkg-1', status: 'rejected' }}
      />,
    )
    card.rerender(createElement(capturedHumanInTheLoop.render!, hitlProps))

    await waitFor(() => {
      expect(respond).toHaveBeenCalledWith({ reviewPackageId: 'pkg-1', status: 'rejected' })
    })
    expect(screen.getByText('本次建议已放弃，草稿未修改。')).toBeInTheDocument()
  })

  it('does not call runAgent when the durable chat mounts', () => {
    render(
      <StrictMode>
        <AiCreateAssistChat {...chatProps} runId="run-first" />
      </StrictMode>,
    )

    expect(runAgent).not.toHaveBeenCalled()
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('shows 发送中 until the server confirms, then restores the input on failure', async () => {
    let resolveSend!: (value: {
      conversationId: string
      batch: { id: string; status: 'ready_for_agent'; conversationVersion: number }
      events: Array<{
        sequence: number
        kind: 'user_message' | 'batch_status'
        payload: Record<string, unknown>
        createdAt: string
      }>
      lastSequence: number
    }) => void
    vi.mocked(sendAiConversationMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve
        }),
    )

    render(<AiCreateAssistChat {...chatProps} />)
    fireEvent.change(screen.getByLabelText('询问当前发团草稿'), {
      target: { value: '团名用九月川西' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('发送中')).toBeInTheDocument()
    expect(sendAiConversationMessage).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      { text: '团名用九月川西' },
      expect.any(String),
    )

    await act(async () => {
      resolveSend({
        conversationId: 'conv-1',
        batch: { id: 'batch-1', status: 'ready_for_agent', conversationVersion: 1 },
        events: [
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '团名用九月川西' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
          {
            sequence: 2,
            kind: 'batch_status',
            payload: { status: 'ready_for_agent' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ],
        lastSequence: 2,
      })
    })

    expect(screen.getByText('团名用九月川西')).toBeInTheDocument()
    expect(screen.getByText('已发送')).toBeInTheDocument()
    expect(screen.queryByText('发送中')).not.toBeInTheDocument()
  })

  it('keeps the unsent text after a failed send so it can be retried', async () => {
    vi.mocked(sendAiConversationMessage).mockRejectedValue(new Error('network'))
    render(<AiCreateAssistChat {...chatProps} />)
    const textarea = screen.getByLabelText('询问当前发团草稿')
    fireEvent.change(textarea, { target: { value: '保留这句' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI 辅助暂时不可用，请稍后重试或继续使用表单',
    )
    expect(textarea.value).toBe('保留这句')
  })

  it('catches up from the last sequence when the event stream errors', async () => {
    vi.mocked(listAiConversationEvents).mockResolvedValue({
      conversationId: 'conv-1',
      events: [
        {
          sequence: 3,
          kind: 'agent_message',
          payload: { text: '已记下你的出团说明，可以继续在表单完善。' },
          createdAt: '2026-08-14T00:00:00.000Z',
        },
      ],
      lastSequence: 3,
      activeBatch: { id: 'batch-1', status: 'completed', conversationVersion: 1 },
    })

    render(<AiCreateAssistChat {...chatProps} />)
    expect(lastEventSource).not.toBeNull()

    await act(async () => {
      lastEventSource?.onerror?.(new Event('error'))
    })

    expect(listAiConversationEvents).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(
      await screen.findByText('已记下你的出团说明，可以继续在表单完善。'),
    ).toBeInTheDocument()
  })

  it('renders searchRouteTemplates results as read-only chat copy without adopt buttons', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-search" />)

    expect(capturedSearchRenderTool.name).toBe('searchRouteTemplates')
    const empty = capturedSearchRenderTool.render?.({
      status: 'complete',
      result: { items: [] },
    })
    const results = capturedSearchRenderTool.render?.({
      status: 'complete',
      result: {
        items: [
          {
            id: 'tpl-1',
            name: '川西稻城线',
            defaultDayCount: 8,
            usageCount: 4,
            updatedAt: '2026-08-01T00:00:00.000Z',
            matchReasons: [{ code: 'name_contains_token', token: '川西' }],
          },
        ],
      },
    })

    render(
      <>
        {empty}
        {results}
      </>,
    )
    expect(screen.getByText(/没有匹配的常用路线/)).toBeInTheDocument()
    expect(screen.getByText(/川西稻城线 · 8 天 · 用过 4 次/)).toBeInTheDocument()
    expect(screen.getByText(/名称包含「川西」/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /采用|确认|选择/ })).not.toBeInTheDocument()
  })
})
