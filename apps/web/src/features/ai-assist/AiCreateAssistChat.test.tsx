import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, StrictMode, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiCreateSharedLightStateSchema } from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { AiCreateAssistChat } from './AiCreateAssistChat'
import { sendAiConversationMessage, listAiConversationEvents } from '@/services/ai-create-task.service'

const { addMessage, runAgent, useAgentContext } = vi.hoisted(() => ({
  addMessage: vi.fn(),
  runAgent: vi.fn(),
  useAgentContext: vi.fn(),
}))

let queuedFiles: File[] = []
let capturedKit: {
  runtimeUrl?: string
  headers?: Record<string, string>
  properties?: Record<string, unknown>
  useSingleEndpoint?: boolean
  enableInspector?: boolean
  onError?: (event: { error: Error }) => void
} = {}
let capturedView: {
  messages?: Array<{
    id: string
    role: string
    content?: unknown
    activityType?: string
  }>
  isRunning?: boolean
  inputValue?: string
  onSubmitMessage?: (value: string) => void
  onInputChange?: (value: string) => void
} = {}
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
    enableInspector,
    onError,
  }: {
    children: ReactNode
    runtimeUrl?: string
    headers?: Record<string, string>
    properties?: Record<string, unknown>
    useSingleEndpoint?: boolean
    enableInspector?: boolean
    onError?: (event: { error: Error }) => void
  }) => {
    capturedKit = {
      runtimeUrl,
      headers,
      properties,
      useSingleEndpoint,
      enableInspector,
      onError,
    }
    return <div data-testid="copilot-kit">{children}</div>
  },
  CopilotChatConfigurationProvider: ({ children }: { children: ReactNode }) => children,
  CopilotChatView: ({
    messages = [],
    isRunning,
    inputValue,
    onInputChange,
    onSubmitMessage,
    welcomeScreen,
    suggestions,
    onSelectSuggestion,
  }: {
    messages?: Array<{
      id: string
      role: string
      content?: unknown
      activityType?: string
    }>
    isRunning?: boolean
    inputValue?: string
    onInputChange?: (value: string) => void
    onSubmitMessage?: (value: string) => void
    welcomeScreen?:
      | false
      | ((props: { input?: ReactNode; suggestionView?: ReactNode }) => ReactNode)
    suggestions?: Array<{ title: string; message: string }>
    onSelectSuggestion?: (suggestion: { title: string; message: string }, index: number) => void
  }) => {
    capturedView = { messages, isRunning, inputValue, onInputChange, onSubmitMessage }
    const input = (
      <textarea
        aria-label="询问当前发团草稿"
        placeholder="询问当前发团草稿…"
        value={inputValue ?? ''}
        onChange={(event) => onInputChange?.(event.target.value)}
      />
    )
    const suggestionView =
      suggestions && suggestions.length > 0 ? (
        <div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onSelectSuggestion?.(suggestion, index)}
            >
              {suggestion.title}
            </button>
          ))}
        </div>
      ) : null
    const welcome =
      messages.length === 0 && typeof welcomeScreen === 'function'
        ? welcomeScreen({ input, suggestionView })
        : null
    return (
      <div data-testid="copilot-chat-view" data-running={isRunning ? 'true' : 'false'}>
        {welcome}
        <div role="log">
          {messages.map((message) => {
            if (message.role === 'activity' && message.content && typeof message.content === 'object') {
              const content = message.content as {
                label?: unknown
                failedMaterials?: Array<{ originalFilename: string; errorMessage: string | null }>
                showMaterialActions?: boolean
              }
              return (
                <div key={message.id}>
                  <p role="status">{typeof content.label === 'string' ? content.label : ''}</p>
                  {content.failedMaterials?.map((item) => (
                    <p key={item.originalFilename}>
                      {item.originalFilename}
                      {item.errorMessage ? `：${item.errorMessage}` : ''}
                    </p>
                  ))}
                  {content.showMaterialActions ? (
                    <>
                      <button type="button">重试失败资料</button>
                      <button type="button">放弃本批</button>
                    </>
                  ) : null}
                </div>
              )
            }
            return (
              <p key={message.id}>{typeof message.content === 'string' ? message.content : ''}</p>
            )
          })}
        </div>
        {welcome ? null : input}
        <button type="button" onClick={() => onSubmitMessage?.(inputValue ?? '')}>
          发送
        </button>
      </div>
    )
  },
  useAgentContext: (...args: unknown[]) => useAgentContext(...args),
  useAgent: () => ({ agent: { addMessage }, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
  useAttachments: () => ({
    attachments: queuedFiles.map((file) => ({
      id: file.name,
      filename: file.name,
      status: 'ready',
      source: { type: 'url', value: `blob:${file.name}`, mimeType: file.type },
    })),
    enabled: true,
    dragOver: false,
    fileInputRef: { current: null },
    containerRef: { current: null },
    processFiles: async (files: File[]) => {
      queuedFiles = [...queuedFiles, ...files]
    },
    handleFileUpload: async () => {},
    handleDragOver: () => {},
    handleDragLeave: () => {},
    handleDrop: async () => {},
    removeAttachment: () => {},
    consumeAttachments: () => {
      const files = queuedFiles
      queuedFiles = []
      return files.map((file) => ({
        id: file.name,
        filename: file.name,
        status: 'ready',
        source: { type: 'url', value: `blob:${file.name}`, mimeType: file.type },
        metadata: { file },
      }))
    },
  }),
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
  beforeEach(() => {
    vi.mocked(listAiConversationEvents).mockResolvedValue({
      conversationId: 'conv-1',
      events: [],
      lastSequence: 0,
      activeBatch: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    lastEventSource = null
    queuedFiles = []
    capturedKit = {}
    capturedView = {}
    capturedRenderTool = {}
    capturedSearchRenderTool = {}
    capturedHumanInTheLoop = {}
  })

  it('shows a compact welcome with greeting and prompt cards', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-welcome" />)

    expect(screen.getByRole('region', { name: '电子化助理说明' })).toBeInTheDocument()
    expect(screen.getByText(/上午好|下午好|晚上好/)).toBeInTheDocument()
    expect(screen.getByText('今天要做什么？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /补全团名和路线/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /查找常用路线/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /说明团期和人数/ })).toBeInTheDocument()
    expect(screen.queryByText(/建议会出现在中间表单/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('询问当前发团草稿')).toBeInTheDocument()
  })

  it('hides the welcome screen after the first user message', () => {
    render(
      <AiCreateAssistChat
        {...chatProps}
        runId="run-welcome-hidden"
        initialEvents={[
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '帮我建一个喀纳斯3日团' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ]}
      />,
    )

    expect(screen.queryByRole('region', { name: '电子化助理说明' })).not.toBeInTheDocument()
    expect(screen.getByText('帮我建一个喀纳斯3日团')).toBeInTheDocument()
  })

  it('sends a suggestion as a conversation message', async () => {
    vi.mocked(sendAiConversationMessage).mockResolvedValue({
      conversationId: 'conv-1',
      batch: { id: 'batch-1', status: 'ready_for_agent', conversationVersion: 1 },
      events: [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我查一下组织里的常用路线' },
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

    render(<AiCreateAssistChat {...chatProps} runId="run-welcome-suggest" />)
    fireEvent.click(screen.getByRole('button', { name: /查找常用路线/ }))

    expect(sendAiConversationMessage).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      { text: '帮我查一下组织里的常用路线' },
      expect.any(String),
    )
    expect(await screen.findByText('帮我查一下组织里的常用路线')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '电子化助理说明' })).not.toBeInTheDocument()
  })

  it('passes runtimeUrl and identity headers to a controlled CopilotChatView', () => {
    render(<AiCreateAssistChat {...chatProps} runId="run-headers" />)

    expect(capturedKit.headers).toMatchObject({
      Authorization: 'Bearer deleg-1',
      'X-Ai-Task-Id': 'task-assist',
      'X-Ai-Run-Id': 'run-headers',
    })
    expect(capturedKit.runtimeUrl).toBe('/copilotkit')
    expect(capturedKit.useSingleEndpoint).toBe(false)
    expect(capturedKit.enableInspector).toBe(false)
    expect(screen.getByTestId('copilot-chat-view')).toBeInTheDocument()
    expect(screen.getByLabelText('询问当前发团草稿')).toBeInTheDocument()
    expect(capturedView.onSubmitMessage).toEqual(expect.any(Function))
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
    expect(capturedView.isRunning).toBe(true)
    expect(runAgent).not.toHaveBeenCalled()
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
    expect(runAgent).not.toHaveBeenCalled()
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

  it('catches up agent replies on mount without waiting for the event stream to error', async () => {
    vi.mocked(listAiConversationEvents).mockResolvedValue({
      conversationId: 'conv-1',
      events: [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我建一个喀纳斯3日团' },
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent' },
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        {
          sequence: 4,
          kind: 'agent_message',
          payload: { text: '已提交待审核建议，请在中间表单确认。' },
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        {
          sequence: 5,
          kind: 'batch_status',
          payload: { status: 'awaiting_review' },
          createdAt: '2026-08-14T00:00:00.000Z',
        },
      ],
      lastSequence: 5,
      activeBatch: { id: 'batch-1', status: 'awaiting_review', conversationVersion: 1 },
    })

    render(<AiCreateAssistChat {...chatProps} />)

    expect(
      await screen.findByText('已提交待审核建议，请在中间表单确认。'),
    ).toBeInTheDocument()
    expect(capturedView.isRunning).toBe(false)
    expect(listAiConversationEvents).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal), silentError: true }),
    )
  })

  it('catches up from the last sequence when the event stream errors', async () => {
    render(<AiCreateAssistChat {...chatProps} />)
    expect(lastEventSource).not.toBeNull()
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

    await act(async () => {
      lastEventSource?.onerror?.(new Event('error'))
    })

    expect(listAiConversationEvents).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal), silentError: true }),
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

  it('shows parse progress while waiting for materials and keeps the chat running', () => {
    render(
      <AiCreateAssistChat
        {...chatProps}
        initialEvents={[
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '这是团期资料，请按附件填写。' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
          {
            sequence: 2,
            kind: 'batch_status',
            payload: { status: 'waiting_for_materials', readyCount: 0, totalCount: 1 },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ]}
      />,
    )

    expect(screen.getByText('已上传 1 个，解析 0/1')).toBeInTheDocument()
    expect(screen.queryByText('已收到')).not.toBeInTheDocument()
    expect(capturedView.isRunning).toBe(true)
  })

  it('stops treating the chat as running when material parse fails', async () => {
    render(
      <AiCreateAssistChat
        {...chatProps}
        initialEvents={[
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '这是团期资料，请按附件填写。' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
          {
            sequence: 2,
            kind: 'batch_status',
            payload: { status: 'waiting_for_materials', readyCount: 0, totalCount: 1 },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ]}
      />,
    )

    expect(capturedView.isRunning).toBe(true)

    await act(async () => {
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          sequence: 3,
          kind: 'error',
          payload: {
            errorCode: 'PARSE_FAILED',
            materialId: 'mat-1',
            originalFilename: '空白.png',
            errorMessage: '无法从该资料提取可用文字',
          },
          createdAt: '2026-08-14T00:00:01.000Z',
        }),
      } as MessageEvent)
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          sequence: 4,
          kind: 'batch_status',
          payload: {
            status: 'waiting_for_materials',
            batchId: 'batch-1',
            readyCount: 0,
            totalCount: 1,
            failedCount: 1,
            failedMaterials: [
              {
                materialId: 'mat-1',
                originalFilename: '空白.png',
                errorCode: 'PARSE_FAILED',
                errorMessage: '无法从该资料提取可用文字',
              },
            ],
          },
          createdAt: '2026-08-14T00:00:01.000Z',
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('有 1 个资料解析失败，请重试、移除后继续或放弃本批')).toBeInTheDocument()
    expect(screen.getByText('空白.png：无法从该资料提取可用文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试失败资料' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃本批' })).toBeInTheDocument()
    expect(capturedView.isRunning).toBe(false)
  })

  it('updates parse progress in place when a later batch_status event arrives', async () => {
    render(
      <AiCreateAssistChat
        {...chatProps}
        initialEvents={[
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '这是团期资料，请按附件填写。' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
          {
            sequence: 2,
            kind: 'batch_status',
            payload: { status: 'waiting_for_materials', readyCount: 0, totalCount: 1 },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ]}
      />,
    )

    expect(screen.getByText('已上传 1 个，解析 0/1')).toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          sequence: 3,
          kind: 'batch_status',
          payload: { status: 'waiting_for_materials', readyCount: 1, totalCount: 1 },
          createdAt: '2026-08-14T00:00:01.000Z',
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('已上传 1 个，解析 1/1')).toBeInTheDocument()
    expect(screen.queryByText('已上传 1 个，解析 0/1')).not.toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.({
        data: JSON.stringify({
          sequence: 4,
          kind: 'batch_status',
          payload: { status: 'agent_running' },
          createdAt: '2026-08-14T00:00:02.000Z',
        }),
      } as MessageEvent)
    })

    expect(screen.getByText('AI 处理中')).toBeInTheDocument()
    expect(screen.queryByText('已上传 1 个，解析 1/1')).not.toBeInTheDocument()
  })

  it('sends local files with the message and does not call runAgent', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], '团期.png', { type: 'image/png' })
    queuedFiles = [file]
    let resolveSend!: (value: {
      conversationId: string
      batch: {
        id: string
        status: 'waiting_for_materials'
        conversationVersion: number
        materialProgress: { ready: number; total: number }
      }
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
      target: { value: '这是团期资料，请按附件填写。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('上传 1 个附件')).toBeInTheDocument()
    expect(runAgent).not.toHaveBeenCalled()

    await act(async () => {
      resolveSend({
        conversationId: 'conv-1',
        batch: {
          id: 'batch-1',
          status: 'waiting_for_materials',
          conversationVersion: 1,
          materialProgress: { ready: 0, total: 1 },
        },
        events: [
          {
            sequence: 1,
            kind: 'user_message',
            payload: { text: '这是团期资料，请按附件填写。' },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
          {
            sequence: 2,
            kind: 'batch_status',
            payload: { status: 'waiting_for_materials', readyCount: 0, totalCount: 1 },
            createdAt: '2026-08-14T00:00:00.000Z',
          },
        ],
        lastSequence: 2,
      })
    })

    expect(sendAiConversationMessage).toHaveBeenCalledWith(
      'task-assist',
      'conv-1',
      { text: '这是团期资料，请按附件填写。', files: [file] },
      expect.any(String),
    )
    expect(runAgent).not.toHaveBeenCalled()
    expect(await screen.findByText('已上传 1 个，解析 0/1')).toBeInTheDocument()
  })
})
