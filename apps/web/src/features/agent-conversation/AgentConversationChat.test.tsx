import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConversationChat } from './AgentConversationChat'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import {
  cancelAgentConversationInteraction,
  listAgentConversationEvents,
  retractQueuedAgentConversationBatch,
  saveAgentConversationDraft,
  sendAgentConversationText,
  stopAgentConversationBatch,
} from '@/services/agent-conversation.service'
import { ApiError } from '@/lib/request'

const routerState = vi.hoisted(() => ({
  location: { pathname: '/partner/partner-1', searchStr: '?tab=accounts', hash: '' },
  navigate: vi.fn(),
}))

let queuedFiles: File[] = []

function renderChat(ui: ReactNode = <AgentConversationChat />) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )
}

function MockReasoningMessage({ content }: { content: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        思考过程
      </button>
      <div hidden={!open}>{content}</div>
    </div>
  )
}

function MockCopilotChatReasoningMessageHeader({
  label,
  isStreaming,
}: {
  label?: string
  isStreaming?: boolean
}) {
  return (
    <button type="button" data-testid="reasoning-header">
      {label ?? (isStreaming ? '正在思考' : '思考过程')}
    </button>
  )
}

function MockCopilotChatReasoningMessage({
  isRunning,
  message,
  header: HeaderSlot = MockCopilotChatReasoningMessageHeader,
}: {
  isRunning?: boolean
  message?: { id?: string; content?: unknown }
  header?:
    | ComponentType<{ isStreaming?: boolean; label?: string }>
    | ((props: { isStreaming?: boolean; label?: string }) => ReactNode)
}) {
  const Header = HeaderSlot
  return (
    <div data-testid="reasoning-message">
      <Header
        isStreaming={Boolean(isRunning)}
        label={isRunning ? '正在思考' : '思考过程'}
      />
      {typeof message?.content === 'string' ? <div>{message.content}</div> : null}
    </div>
  )
}
MockCopilotChatReasoningMessage.Header = MockCopilotChatReasoningMessageHeader
MockCopilotChatReasoningMessage.Content = () => null
MockCopilotChatReasoningMessage.Toggle = () => null


function useMockComposerAttachments() {
  const [files, setFiles] = useState<File[]>(() => {
    const seeded = queuedFiles
    queuedFiles = []
    return seeded
  })
  return {
    attachments: files.map((file) => ({
      id: file.name,
      filename: file.name,
      status: 'ready',
      source: { type: 'url', value: `blob:${file.name}`, mimeType: file.type },
    })),
    enabled: true,
    dragOver: false,
    fileInputRef: { current: null },
    containerRef: { current: null },
    processFiles: async (nextFiles: File[]) => {
      setFiles((current) => [...current, ...nextFiles])
    },
    handleFileUpload: async () => {},
    handleDragOver: () => {},
    handleDragLeave: () => {},
    handleDrop: async () => {},
    removeAttachment: (id: string) => {
      setFiles((current) => current.filter((file) => file.name !== id))
    },
    consumeAttachments: () => {
      const snapshot = files
      setFiles([])
      return snapshot.map((file) => ({
        id: file.name,
        filename: file.name,
        status: 'ready',
        source: { type: 'url', value: `blob:${file.name}`, mimeType: file.type },
        metadata: { file },
      }))
    },
  }
}

vi.mock('@/services/agent-conversation.service', () => ({
  getAgentConversation: vi.fn().mockResolvedValue({
    id: 'c-1',
    title: '历史会话',
    events: [],
    draft: { text: '', draftEpoch: 0, revision: 0 },
  }),
  listAgentConversationEvents: vi.fn().mockResolvedValue({
    conversationId: 'c-1',
    events: [],
    lastSequence: 0,
  }),
  cancelAgentConversationInteraction: vi.fn(),
  saveAgentConversationDraft: vi.fn().mockResolvedValue({
    conversationId: 'c-1',
    text: '',
    draftEpoch: 0,
    revision: 1,
  }),
  sendAgentConversationText: vi.fn(),
  retractQueuedAgentConversationBatch: vi.fn(),
  stopAgentConversationBatch: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerState.navigate,
  useRouterState: (options?: {
    select?: (state: { location: { pathname: string; searchStr: string; hash: string } }) => unknown
  }) => {
    const state = routerState
    return options?.select ? options.select(state) : state
  },
}))

let capturedActivityRenderers: Array<{
  activityType?: string
  render?: (props: { content: unknown }) => React.ReactNode
}> = []
let capturedChatConfig: { agentId?: string } = {}

vi.mock('@copilotkit/react-core/v2', () => {
  const MockCopilotChatInput = ({
    value,
    onChange,
    onSubmitMessage,
    onStop,
    isRunning,
    onAddFile,
    sendButton: SendButton,
  }: {
    value?: string
    onChange?: (value: string) => void
    onSubmitMessage?: (value: string) => void
    onStop?: () => void
    isRunning?: boolean
    onAddFile?: () => void
    sendButton?: (props: {
      onClick: () => void
      disabled?: boolean
      'aria-label'?: string
    }) => React.ReactNode
  }) => {
    const showStop = Boolean(isRunning && onStop && !(value ?? '').trim())
    const handleClick = () => {
      if (showStop) {
        onStop?.()
        return
      }
      onSubmitMessage?.(value ?? '')
      onChange?.('')
    }
    return (
      <div>
        <button
          type="button"
          data-testid="copilot-add-menu-button"
          aria-label="添加附件"
          disabled={!onAddFile}
          onClick={() => onAddFile?.()}
        >
          添加附件
        </button>
        <textarea
          aria-label="询问小团宝业务"
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {SendButton ? (
          <SendButton onClick={handleClick} aria-label={showStop ? '停止当前处理' : '发送'} />
        ) : (
          <button type="button" aria-label={showStop ? '停止当前处理' : '发送'} onClick={handleClick}>
            {showStop ? '停止当前处理' : '发送'}
          </button>
        )}
      </div>
    )
  }

  return {
    CopilotKit: ({
      children,
      renderActivityMessages,
    }: {
      children: React.ReactNode
      renderActivityMessages?: Array<{
        activityType?: string
        render?: (props: { content: unknown }) => React.ReactNode
      }>
    }) => {
      capturedActivityRenderers = renderActivityMessages ?? []
      return <div>{children}</div>
    },
    CopilotChatConfigurationProvider: ({
      children,
      agentId,
    }: {
      children: React.ReactNode
      agentId?: string
    }) => {
      capturedChatConfig = { agentId }
      return children
    },
    CopilotChatReasoningMessage: MockCopilotChatReasoningMessage,
    CopilotChatInput: Object.assign(MockCopilotChatInput, {
      SendButton: ({
        children,
        ...props
      }: {
        children?: React.ReactNode
        'aria-label'?: string
        onClick?: () => void
        disabled?: boolean
      }) => (
        <button type="button" {...props}>
          {props['aria-label'] ?? children}
        </button>
      ),
    }),
    useAttachments: useMockComposerAttachments,
    CopilotChatView: ({
      input: Input = MockCopilotChatInput,
      inputValue,
      onInputChange,
      onSubmitMessage,
      onStop,
      isRunning,
      messages,
      messageView,
      onAddFile,
      attachments,
    }: {
      input?: typeof MockCopilotChatInput
      inputValue?: string
      onInputChange?: (value: string) => void
      onSubmitMessage?: (value: string) => void
      onStop?: () => void
      isRunning?: boolean
      messageView?: {
        reasoningMessage?:
          | ComponentType<{
              message?: { id?: string; role?: string; content?: unknown }
              messages?: Array<{ id?: string; role?: string; content?: unknown }>
              isRunning?: boolean
            }>
          | { header?: ComponentType<{ isStreaming?: boolean; label?: string }> }
      }
      onAddFile?: () => void
      attachments?: Array<{ id?: string; filename?: string }>
      messages?: Array<{
        id?: string
        role?: string
        content?: unknown
        activityType?: string
      }>
    }) => (
      <div>
        {(attachments ?? []).map((item) => (
          <div key={item.id ?? item.filename}>{item.filename}</div>
        ))}
        {(messages ?? []).map((message) => {
          if (message.role === 'reasoning' && typeof message.content === 'string') {
            const Reasoning = messageView?.reasoningMessage
            if (typeof Reasoning === 'function') {
              return (
                <Reasoning
                  key={message.id}
                  message={message}
                  messages={messages}
                  isRunning={isRunning}
                />
              )
            }
            return <MockReasoningMessage key={message.id} content={message.content} />
          }
          if (
            message.role === 'activity' &&
            message.content &&
            typeof message.content === 'object'
          ) {
            const renderer = capturedActivityRenderers.find(
              (item) => item.activityType === message.activityType,
            )
            if (renderer?.render) {
              return <div key={message.id}>{renderer.render({ content: message.content })}</div>
            }
          }
          return typeof message.content === 'string' ? (
            <div key={message.id ?? `${message.role}-${message.content}`}>{message.content}</div>
          ) : null
        })}
        <Input
          value={inputValue}
          onChange={onInputChange}
          onSubmitMessage={onSubmitMessage}
          onStop={onStop}
          isRunning={isRunning}
          onAddFile={onAddFile}
        />
      </div>
    ),
  }
})

class MockEventSource {
  url: string
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = 1
  constructor(url: string, _init?: EventSourceInit) {
    this.url = url
    lastEventSource = this
  }
  close() {
    this.readyState = 2
  }
}

let lastEventSource: MockEventSource | null = null
vi.stubGlobal('EventSource', MockEventSource)

describe('AgentConversationChat page locator #371', () => {
  beforeEach(() => {
    lastEventSource = null
    routerState.location = {
      pathname: '/partner/partner-1',
      searchStr: '?tab=accounts',
      hash: '',
    }
    vi.mocked(sendAgentConversationText).mockReset()
    queuedFiles = []
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a removable current-page chip on a new conversation', async () => {
    const user = userEvent.setup()
    renderChat()
    expect(await screen.findByText('当前合作伙伴往来账款')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '移除当前页面' }))
    expect(screen.queryByText('当前合作伙伴往来账款')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '获取当前页面' })).toBeInTheDocument()
  })

  it('同步草稿版本时不重建输入框，保留选区并继续接收输入', async () => {
    const user = userEvent.setup()
    renderChat()

    const composer = await screen.findByRole('textbox', { name: '询问小团宝业务' })
    await user.type(composer, '正在编辑的内容')
    composer.setSelectionRange(2, 6)

    await act(async () => {
      useAgentConversationRuntimeStore.getState().hydrate({
        conversationId: 'c-1',
        draft: '正在编辑的内容',
        draftEpoch: 1,
        revision: 1,
      })
    })

    const syncedComposer = screen.getByRole('textbox', { name: '询问小团宝业务' })
    expect(syncedComposer).toBe(composer)
    expect(syncedComposer).toHaveValue('正在编辑的内容')
    expect(syncedComposer).toHaveProperty('selectionStart', 2)
    expect(syncedComposer).toHaveProperty('selectionEnd', 6)

    await user.type(syncedComposer, '继续')
    expect(syncedComposer).toHaveValue('正在编辑的内容继续')
  })

  it('保持 CopilotKit activity renderer 数组引用稳定', () => {
    const view = renderChat()
    const first = capturedActivityRenderers

    routerState.location = {
      ...routerState.location,
      searchStr: '?tab=overview',
    }
    view.rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AgentConversationChat />
      </QueryClientProvider>,
    )

    expect(capturedActivityRenderers).toBe(first)
  })

  it('does not auto-attach when opening a historical conversation', () => {
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    vi.mocked(saveAgentConversationDraft).mockImplementation(async (conversationId, input) => ({
      conversationId,
      text: input.text,
      draftEpoch: input.draftEpoch,
      revision: 1,
    }))
    renderChat()
    expect(screen.queryByText('当前合作伙伴往来账款')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '获取当前页面' })).toBeInTheDocument()
  })

  it('sends the attached locator and omits it after the chip is removed', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-new',
      events: [],
      lastSequence: 1,
    } as never)
    renderChat()
    await screen.findByText('当前合作伙伴往来账款')
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '查一下账款')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      null,
      {
        text: '查一下账款',
        pageLocator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
      },
      expect.any(String),
    )

    useAgentConversationStore.getState().detachCurrentPage()
    await user.clear(screen.getByRole('textbox', { name: '询问小团宝业务' }))
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '不带页面')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenLastCalledWith(
      expect.any(String),
      { text: '不带页面' },
      expect.any(String),
    )
    expect(await screen.findByRole('button', { name: '获取当前页面' })).toBeInTheDocument()
    expect(screen.queryByText('当前合作伙伴往来账款')).not.toBeInTheDocument()
  })

  it('shows one task chip and sends it as the primary task candidate', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-new',
      events: [],
      lastSequence: 1,
    } as never)
    routerState.location = {
      pathname: '/departure/new',
      searchStr: '?taskId=task-1',
      hash: '',
    }

    renderChat()

    expect(await screen.findByText('当前建团工作')).toBeInTheDocument()
    expect(screen.getAllByTestId('current-page-chip')).toHaveLength(1)
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '继续补充行程')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(sendAgentConversationText).toHaveBeenCalledWith(
      null,
      { text: '继续补充行程', primaryTaskId: 'task-1' },
      expect.any(String),
    )

    await user.click(screen.getByRole('button', { name: '移除当前页面' }))
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '不带任务')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenLastCalledWith(
      expect.any(String),
      { text: '不带任务' },
      expect.any(String),
    )
    expect(await screen.findByRole('button', { name: '获取当前页面' })).toBeInTheDocument()
    expect(screen.queryByText('当前建团工作')).not.toBeInTheDocument()
  })

  it('shows the API validation message and restores the draft when sending fails', async () => {
    const user = userEvent.setup()
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    vi.mocked(sendAgentConversationText).mockRejectedValue(
      new ApiError('消息内容不能超过 100000 个字符', 400),
    )
    renderChat()

    const composer = await screen.findByRole('textbox', { name: '询问小团宝业务' })
    await user.type(composer, '需要保留的超长说明')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '消息内容不能超过 100000 个字符',
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(composer).toHaveValue('需要保留的超长说明')
  })

  it('enables the composer attachment button so User can queue files', async () => {
    renderChat()
    expect(await screen.findByTestId('copilot-add-menu-button')).toBeEnabled()
  })

  it('sends queued files with the message instead of dropping them', async () => {
    const user = userEvent.setup()
    const file = new File([new Uint8Array([1, 2, 3])], '团期.png', { type: 'image/png' })
    queuedFiles = [file]
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-new',
      events: [],
      lastSequence: 1,
    } as never)
    renderChat()
    await screen.findByText('当前合作伙伴往来账款')
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '请根据附件回答')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      null,
      {
        text: '请根据附件回答',
        files: [file],
        pageLocator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
      },
      expect.any(String),
    )
  })

  it('sends files without typed text using the default attachment prompt', async () => {
    const user = userEvent.setup()
    const file = new File([new Uint8Array([1, 2, 3])], '团期.png', { type: 'image/png' })
    queuedFiles = [file]
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-new',
      events: [],
      lastSequence: 1,
    } as never)
    renderChat()
    await screen.findByTestId('copilot-add-menu-button')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      null,
      {
        text: '请根据附件回答。',
        files: [file],
        pageLocator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
      },
      expect.any(String),
    )
  })

  it('drops unsaved composer attachments when starting a new conversation', async () => {
    queuedFiles = [new File([new Uint8Array([1, 2, 3])], 'sample.pdf', { type: 'application/pdf' })]
    renderChat()
    expect(await screen.findByText('sample.pdf')).toBeInTheDocument()

    await act(async () => {
      useAgentConversationStore.getState().startNewConversation()
    })

    expect(screen.queryByText('sample.pdf')).not.toBeInTheDocument()
  })
})

describe('AgentConversationChat task and review activities', () => {
  beforeEach(() => {
    lastEventSource = null
    routerState.navigate.mockReset()
    vi.mocked(listAgentConversationEvents).mockResolvedValue({
      conversationId: 'c-1',
      events: [],
      lastSequence: 4,
    })
    vi.mocked(retractQueuedAgentConversationBatch).mockReset()
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '创建川西发团',
    })
    useAgentConversationStore.getState().openGlobalFromRoute('c-1')
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-1',
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我创建发团：9 月 15 日出发，行程 8 天' },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-1',
            createdTaskId: 'task-1',
            createdTaskGoal: '创建 9 月 15 日出发的 8 天行程',
            createdTaskType: 'departure_creation',
            continuation: true,
          },
          createdAt: '2026-08-27T00:00:01.000Z',
        },
        {
          id: 'e-3',
          sequence: 3,
          kind: 'agent_message',
          payload: {
            text: '已提交待审核建议，请在中间表单确认。',
            batchId: 'batch-1',
            taskId: 'task-1',
            reviewPackageId: 'pkg-1',
            fieldKeys: ['routeName', 'startDate', 'endDate'],
            payloadSchema: 'departure.basic_info_draft@v1',
            confirmationUnit: 'basic_info_draft',
          },
          createdAt: '2026-08-27T00:00:02.000Z',
        },
        {
          id: 'e-4',
          sequence: 4,
          kind: 'batch_status',
          payload: {
            status: 'awaiting_review',
            batchId: 'batch-1',
            taskId: 'task-1',
            reviewPackageId: 'pkg-1',
          },
          createdAt: '2026-08-27T00:00:03.000Z',
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the task card and opens the matching departure review form', async () => {
    const user = userEvent.setup()
    renderChat()

    expect(await screen.findByRole('region', { name: 'Agent 任务' })).toHaveTextContent(
      '创建 9 月 15 日出发的 8 天行程',
    )
    expect(screen.getByRole('region', { name: '待审核内容' })).toHaveTextContent(
      '路线、出团日期、结束日期',
    )

    await user.click(screen.getByRole('button', { name: '查看审核内容' }))
    expect(routerState.navigate).toHaveBeenCalledWith({
      to: '/departure/new',
      search: { taskId: 'task-1' },
    })
    expect(useAgentConversationStore.getState().globalOpen).toBe(false)
  })

  it('refreshes the current wizard task instead of no-op navigating when already on it', async () => {
    const user = userEvent.setup()
    routerState.location = {
      pathname: '/departure/new',
      searchStr: '?taskId=task-1',
      hash: '',
    }
    renderChat()

    await user.click(await screen.findByRole('button', { name: '查看审核内容' }))
    expect(routerState.navigate).not.toHaveBeenCalled()
  })

  it('同一会话并列展示多条未处置追问，普通输入框保持独立', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-1',
      batch: { id: 'reply-batch', status: 'ready_for_agent' },
      events: [],
      lastSequence: 2,
    } as never)
    vi.mocked(cancelAgentConversationInteraction).mockResolvedValue({
      conversationId: 'c-1',
      batch: { id: 'cancelled-batch', status: 'cancelled' },
      events: [],
      lastSequence: 2,
    } as never)
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'interaction-event-1',
          sequence: 1,
          kind: 'agent_message',
          payload: {
            text: '还需要确认两个问题。',
            interaction: {
              interactionId: 'interaction-1',
              eventId: 'interaction-event-1',
              type: 'free_text',
              prompt: '请补充出发城市',
              options: [],
              version: 1,
              status: 'pending',
            },
          },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
        {
          id: 'interaction-event-2',
          sequence: 2,
          kind: 'agent_message',
          payload: {
            text: '请选择预算档位。',
            interaction: {
              interactionId: 'interaction-2',
              eventId: 'interaction-event-2',
              type: 'single_choice',
              prompt: '预算档位',
              options: [
                { id: 'standard', label: '标准' },
                { id: 'premium', label: '品质' },
              ],
              version: 1,
              status: 'pending',
            },
          },
          createdAt: '2026-08-27T00:00:01.000Z',
        },
      ],
    })

    renderChat()

    expect(await screen.findByRole('region', { name: '追问：请补充出发城市' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '追问：预算档位' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '回答追问：请补充出发城市' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '标准' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '询问小团宝业务' })).toBeInTheDocument()

    await user.type(
      screen.getByRole('textbox', { name: '回答追问：请补充出发城市' }),
      '上海',
    )
    await user.click(
      within(screen.getByRole('region', { name: '追问：请补充出发城市' })).getByRole(
        'button',
        { name: '发送回答' },
      ),
    )
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      'c-1',
      {
        text: '上海',
        replyToEventId: 'interaction-event-1',
        interactionId: 'interaction-1',
        interactionVersion: 1,
        selectedOptionId: undefined,
      },
      expect.any(String),
    )

    await user.click(
      within(screen.getByRole('region', { name: '追问：预算档位' })).getByRole('button', {
        name: '取消本次等待',
      }),
    )
    expect(cancelAgentConversationInteraction).toHaveBeenCalledWith(
      'c-1',
      'interaction-2',
      1,
      expect.any(String),
    )
  })

  it('keeps a queued message above the composer until its batch starts', async () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        ...useAgentConversationRuntimeStore.getState().events,
        {
          id: 'e-5',
          sequence: 5,
          kind: 'user_message',
          payload: { text: '还有吗' },
          createdAt: '2026-08-27T00:00:04.000Z',
        },
        {
          id: 'e-6',
          sequence: 6,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-2',
            queued: true,
          },
          createdAt: '2026-08-27T00:00:05.000Z',
        },
      ],
    })

    renderChat()

    const queue = await screen.findByRole('region', { name: '排队消息，共 1 条' })
    expect(queue).toHaveTextContent('排队中 · 1')
    expect(queue).toHaveTextContent('当前处理结束后自动发送')
    expect(queue).toHaveTextContent('还有吗')
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.event',
            event: {
              id: 'e-7',
              sequence: 7,
              kind: 'batch_status',
              payload: { status: 'preparing_context', batchId: 'batch-2' },
              createdAt: '2026-08-27T00:00:06.000Z',
            },
          }),
        }),
      )
    })

    expect(screen.queryByRole('region', { name: '排队消息，共 1 条' })).not.toBeInTheDocument()
    expect(await screen.findByText('还有吗')).toBeInTheDocument()
  })

  it('撤回排队消息并回填输入框供重新编辑', async () => {
    const user = userEvent.setup()
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        ...useAgentConversationRuntimeStore.getState().events,
        {
          id: 'e-5',
          sequence: 5,
          kind: 'user_message',
          payload: { text: '还有吗' },
          createdAt: '2026-08-27T00:00:04.000Z',
        },
        {
          id: 'e-6',
          sequence: 6,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent', batchId: 'batch-2', queued: true },
          createdAt: '2026-08-27T00:00:05.000Z',
        },
      ],
    })
    vi.mocked(retractQueuedAgentConversationBatch).mockResolvedValue({
      conversationId: 'c-1',
      batch: { id: 'batch-2', status: 'cancelled' },
      events: [
        {
          id: 'e-7',
          sequence: 7,
          kind: 'batch_status',
          payload: {
            status: 'cancelled',
            batchId: 'batch-2',
            reason: 'queue_retracted',
            retractedUserMessageSequence: 5,
          },
          createdAt: '2026-08-27T00:00:06.000Z',
        },
      ],
      lastSequence: 7,
      draft: {
        conversationId: 'c-1',
        text: '还有吗',
        draftEpoch: 1,
        revision: 2,
        updatedAt: '2026-08-27T00:00:06.000Z',
      },
    } as never)

    renderChat()
    await user.click(await screen.findByRole('button', { name: '编辑' }))

    expect(retractQueuedAgentConversationBatch).toHaveBeenCalledWith(
      'c-1',
      'batch-2',
      expect.any(String),
    )
    expect(screen.queryByRole('region', { name: '排队消息，共 1 条' })).not.toBeInTheDocument()
    const composer = screen.getByRole('textbox', { name: '询问小团宝业务' })
    expect(composer).toHaveValue('还有吗')

    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-8',
          sequence: 8,
          kind: 'user_message',
          payload: { text: '还有吗，改过了' },
          createdAt: '2026-08-27T00:00:07.000Z',
        },
        {
          id: 'e-9',
          sequence: 9,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent', batchId: 'batch-3', queued: true },
          createdAt: '2026-08-27T00:00:07.000Z',
        },
      ],
      lastSequence: 9,
    } as never)
    await user.type(composer, '，改过了')
    expect(composer).toHaveValue('还有吗，改过了')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      'c-1',
      { text: '还有吗，改过了' },
      expect.any(String),
    )
    expect(await screen.findByText('排队中 · 1')).toBeInTheDocument()
    expect(screen.getByText('还有吗，改过了')).toBeInTheDocument()
  })

  it('moves a queued send into the transcript when live output arrives before batch_status promotion', async () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        ...useAgentConversationRuntimeStore.getState().events,
        {
          id: 'e-5',
          sequence: 5,
          kind: 'user_message',
          payload: { text: '还有吗' },
          createdAt: '2026-08-27T00:00:04.000Z',
        },
        {
          id: 'e-6',
          sequence: 6,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-2',
            queued: true,
          },
          createdAt: '2026-08-27T00:00:05.000Z',
        },
      ],
    })

    renderChat()

    expect(await screen.findByRole('region', { name: '排队消息，共 1 条' })).toHaveTextContent(
      '还有吗',
    )

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-2',
            batchId: 'batch-2',
            generation: 1,
            revision: 1,
            reasoningText: '',
            text: '请问您指的是什么呢？',
          }),
        }),
      )
    })

    expect(screen.queryByRole('region', { name: '排队消息，共 1 条' })).not.toBeInTheDocument()
    expect(await screen.findByText('还有吗')).toBeInTheDocument()
    expect(screen.getByText('请问您指的是什么呢？')).toBeInTheDocument()
  })
})

describe('AgentConversationChat live assistant snapshot #415', () => {
  beforeEach(() => {
    lastEventSource = null
    vi.mocked(listAgentConversationEvents).mockResolvedValue({
      conversationId: 'c-1',
      events: [],
      lastSequence: 0,
    })
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-1',
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我查一下账款' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('projects growing assistant text from SSE snapshots and replaces it with agent_message', async () => {
    renderChat()
    expect(lastEventSource).not.toBeNull()
    expect(screen.queryByText('已整理当前资料。')).not.toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 1,
            reasoningText: '',
            text: '已整理当前资料。',
          }),
        }),
      )
    })
    expect(await screen.findByText('已整理当前资料。')).toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.event',
            event: {
              id: 'e-3',
              sequence: 3,
              kind: 'agent_message',
              payload: {
                text: '已整理当前资料。可继续问。',
                batchId: 'batch-1',
                attemptId: 'attempt-9',
              },
              createdAt: '2026-08-26T00:00:02.000Z',
            },
          }),
        }),
      )
    })
    expect(await screen.findByText('已整理当前资料。可继续问。')).toBeInTheDocument()
    expect(screen.queryByText('已整理当前资料。')).not.toBeInTheDocument()
  })

  it('shows a transient working mascot from the first reasoning token and hides it after durable agent_message', async () => {
    renderChat()
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 1,
            reasoningText: '先核对出团日期',
            text: '',
          }),
        }),
      )
    })
    expect(await screen.findByTestId('agent-working-indicator')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Agent 正在工作' })).toHaveAttribute(
      'data-mascot-preset',
      'working',
    )
    expect(screen.queryByRole('button', { name: /正在思考|思考过程/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-thinking-mascot')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('agent-working-indicator')).getByRole('status'),
    ).toHaveTextContent('先核对出团日期')

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 2,
            reasoningText: '再核人数',
            text: '已记下路线。',
          }),
        }),
      )
    })
    expect(await screen.findByText('已记下路线。')).toBeInTheDocument()
    // live-assistant-* is not durable — keep working indicator while streaming
    expect(screen.getByTestId('agent-working-indicator')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('agent-working-indicator')).getByRole('status'),
    ).toHaveTextContent('再核人数')

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.event',
            event: {
              id: 'e-3',
              sequence: 3,
              kind: 'agent_message',
              payload: {
                text: '已记下路线。可继续问。',
                batchId: 'batch-1',
                attemptId: 'attempt-9',
              },
              createdAt: '2026-08-26T00:00:02.000Z',
            },
          }),
        }),
      )
    })
    expect(await screen.findByText('已记下路线。可继续问。')).toBeInTheDocument()
    // Durable event-* assistant ends the turn indicator even while batch is still agent_running
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /正在思考|思考过程/ })).not.toBeInTheDocument()
  })

  it('shows working mascot while isRunning and keeps it gone after completed batch', async () => {
    renderChat()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 1,
            reasoningText: '正在组织回复',
            text: '',
          }),
        }),
      )
    })

    expect(await screen.findByTestId('agent-working-indicator')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Agent 正在工作' })).toHaveAttribute(
      'data-mascot-preset',
      'working',
    )
    expect(screen.getByRole('img', { name: 'Agent 正在工作' })).toHaveAttribute('width', '56')

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.event',
            event: {
              id: 'e-3',
              sequence: 3,
              kind: 'agent_message',
              payload: {
                text: '完成。',
                batchId: 'batch-1',
                attemptId: 'attempt-9',
              },
              createdAt: '2026-08-26T00:00:03.000Z',
            },
          }),
        }),
      )
    })
    expect(await screen.findByText('完成。')).toBeInTheDocument()
    // Gone immediately after durable agent_message — do not wait for batch_status completed
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'conversation.event',
            event: {
              id: 'e-4',
              sequence: 4,
              kind: 'batch_status',
              payload: {
                status: 'completed',
                batchId: 'batch-1',
                attemptId: 'attempt-9',
                generation: 3,
              },
              createdAt: '2026-08-26T00:00:04.000Z',
            },
          }),
        }),
      )
    })

    // Second guarantee: completed batch also leaves no working indicator
    expect(screen.queryByTestId('agent-working-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /正在思考|思考过程/ })).not.toBeInTheDocument()
  })
})

describe('AgentConversationChat Agent 本次运行停止 #417', () => {
  beforeEach(() => {
    lastEventSource = null
    vi.mocked(listAgentConversationEvents).mockResolvedValue({
      conversationId: 'c-1',
      events: [],
      lastSequence: 0,
    })
    vi.mocked(stopAgentConversationBatch).mockReset()
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-1',
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我查一下账款' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('posts stop-batch from the running composer button and replaces live text with 已停止当前处理', async () => {
    const user = userEvent.setup()
    vi.mocked(stopAgentConversationBatch).mockResolvedValue({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-3',
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'cancelled',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            reason: 'user_stop',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
      lastSequence: 3,
    } as never)
    renderChat()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 2,
            reasoningText: '先核对出团日期',
            text: '已记下半段',
          }),
        }),
      )
    })
    expect(await screen.findByText('已记下半段')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止当前处理' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument()
    expect(screen.getByText('AI 处理中')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '停止当前处理' }))
    expect(stopAgentConversationBatch).toHaveBeenCalledWith('c-1', 'batch-1', expect.any(String))
    expect(await screen.findByText('已停止当前处理')).toBeInTheDocument()
    expect(screen.queryByText('已记下半段')).not.toBeInTheDocument()
    expect(screen.queryByText('先核对出团日期')).not.toBeInTheDocument()
  })

  it('keeps 发送 available while the Agent is running so the next turn can queue', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAgentConversationText).mockResolvedValue({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-3',
          sequence: 3,
          kind: 'user_message',
          payload: { text: '排队甲' },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
        {
          id: 'e-4',
          sequence: 4,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent', batchId: 'batch-2', queued: true },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
      lastSequence: 4,
    } as never)
    renderChat()
    expect(screen.getByRole('button', { name: '停止当前处理' })).toBeEnabled()
    await user.type(screen.getByRole('textbox', { name: '询问小团宝业务' }), '排队甲')
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '停止当前处理' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(sendAgentConversationText).toHaveBeenCalledWith(
      'c-1',
      { text: '排队甲' },
      expect.any(String),
    )
    expect(stopAgentConversationBatch).not.toHaveBeenCalled()
    expect(await screen.findByText('排队中 · 1')).toBeInTheDocument()

    vi.mocked(retractQueuedAgentConversationBatch).mockResolvedValue({
      conversationId: 'c-1',
      batch: { id: 'batch-2', status: 'cancelled' },
      events: [
        {
          id: 'e-5',
          sequence: 5,
          kind: 'batch_status',
          payload: {
            status: 'cancelled',
            batchId: 'batch-2',
            reason: 'queue_retracted',
            retractedUserMessageSequence: 3,
          },
          createdAt: '2026-08-26T00:00:03.000Z',
        },
      ],
      lastSequence: 5,
      draft: {
        conversationId: 'c-1',
        text: '排队甲',
        draftEpoch: 1,
        revision: 2,
        updatedAt: '2026-08-26T00:00:03.000Z',
      },
    } as never)
    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(retractQueuedAgentConversationBatch).toHaveBeenCalledWith(
      'c-1',
      'batch-2',
      expect.any(String),
    )
    expect(screen.queryByRole('region', { name: '排队消息，共 1 条' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '询问小团宝业务' })).toHaveValue('排队甲')
  })

  it('restores the current cumulative snapshot after EventSource reconnect without calling stop', async () => {
    const { unmount } = renderChat()
    expect(lastEventSource).not.toBeNull()

    await act(async () => {
      lastEventSource?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'assistant.snapshot',
            attemptId: 'attempt-9',
            batchId: 'batch-1',
            generation: 3,
            revision: 4,
            reasoningText: '先核对出团日期',
            text: '已整理当前资料。',
          }),
        }),
      )
    })
    expect(await screen.findByText('已整理当前资料。')).toBeInTheDocument()
    expect(screen.getByText('先核对出团日期')).toBeInTheDocument()

    await act(async () => {
      lastEventSource?.onerror?.(new Event('error'))
    })
    unmount()

    expect(stopAgentConversationBatch).not.toHaveBeenCalled()
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toMatchObject({
      revision: 4,
      text: '已整理当前资料。',
      reasoningText: '先核对出团日期',
    })
  })

  it('does not call stop when EventSource errors or the chat unmounts', async () => {
    const { unmount } = renderChat()
    expect(lastEventSource).not.toBeNull()

    await act(async () => {
      lastEventSource?.onerror?.(new Event('error'))
    })
    unmount()

    expect(stopAgentConversationBatch).not.toHaveBeenCalled()
    expect(listAgentConversationEvents).toHaveBeenCalled()
  })

  it('uses the CopilotKit runtime agent id so getAgent does not warn Agent not found', async () => {
    renderChat()
    await screen.findByRole('textbox', { name: '询问小团宝业务' })
    expect(capturedChatConfig.agentId).toBe('ai-create-readonly-assist')
  })
})
