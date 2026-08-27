import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useAgentConversationRuntimeStore } from '@/features/agent-conversation/agent-conversation-runtime.store'
import { listAgentConversationEvents } from '@/services/agent-conversation.service'
import { MainLayout } from './MainLayout'

const navigate = vi.fn()
let pathname = '/departure'

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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
  useRouterState: (options?: {
    select?: (state: { location: { pathname: string; searchStr: string; hash: string } }) => unknown
  }) => {
    const state = { location: { pathname, searchStr: '', hash: '' } }
    return options?.select ? options.select(state) : state
  },
}))

vi.mock('@/services/auth.service', () => ({
  logout: vi.fn(),
}))

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
  saveAgentConversationDraft: vi.fn().mockResolvedValue({
    conversationId: 'c-1',
    text: '',
    draftEpoch: 0,
    revision: 1,
  }),
  sendAgentConversationText: vi.fn(),
  stopAgentConversationBatch: vi.fn(),
}))

vi.mock('@/features/agent-conversation/ConversationHistoryTrigger', () => ({
  ConversationHistoryTrigger: () => <button type="button">打开会话历史</button>,
}))

vi.mock('@/features/agent-conversation/ConversationHistoryList', () => ({
  ConversationHistoryList: () => <div>历史列表</div>,
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => children,
  CopilotChatReasoningMessage: Object.assign(
    () => null,
    {
      Header: () => null,
      Content: () => null,
      Toggle: () => null,
    },
  ),
  CopilotChatView: ({
    messages,
  }: {
    messages?: Array<{
      id?: string
      role?: string
      content?: unknown
    }>
  }) => (
    <div>
      {(messages ?? []).map((message) => {
        if (message.role === 'reasoning' && typeof message.content === 'string') {
          return <MockReasoningMessage key={message.id} content={message.content} />
        }
        return typeof message.content === 'string' ? (
          <div key={message.id ?? `${message.role}-${message.content}`}>{message.content}</div>
        ) : null
      })}
      <textarea aria-label="询问小团宝业务" />
    </div>
  ),
}))

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

const RUNNING_EVENTS = [
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
] as const

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConfigProvider>
        <MainLayout>
          <main>发团管理内容</main>
        </MainLayout>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

function pushSnapshot(source: MockEventSource | null, snapshot: {
  revision: number
  reasoningText: string
  text: string
}) {
  source?.onmessage?.(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'assistant.snapshot',
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        ...snapshot,
      }),
    }),
  )
}

describe('MainLayout side vs global live Agent projection #415 #370', () => {
  beforeEach(() => {
    lastEventSource = null
    pathname = '/departure'
    navigate.mockReset()
    vi.mocked(listAgentConversationEvents).mockResolvedValue({
      conversationId: 'c-1',
      events: [],
      lastSequence: 0,
    })
    useAuthStore.setState({
      user: { id: 'user-1', name: '张三' },
      menuKeys: ['/', '/departure'],
      sessionStatus: 'authenticated',
    })
    useUiStore.setState({ sidebarCollapsed: false, assistPaneCollapsed: false })
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [...RUNNING_EVENTS],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps 思考过程 and streaming reply after expanding, and continues snapshots in global mode', async () => {
    const user = userEvent.setup()
    renderLayout()

    const pane = screen.getByRole('complementary', { name: '电子化助理' })
    await waitFor(() => {
      expect(lastEventSource).not.toBeNull()
    })

    await act(async () => {
      pushSnapshot(lastEventSource, {
        revision: 1,
        reasoningText: '先核对出团日期',
        text: '已记下路线。',
      })
    })

    expect(within(pane).getByText('先核对出团日期')).toBeInTheDocument()
    expect(within(pane).getByText('已记下路线。')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '思考过程' })).toHaveLength(1)

    await user.click(within(pane).getByRole('button', { name: '进入全局模式' }))

    const overlay = screen.getByRole('dialog', { name: '小团宝 Agent' })
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    expect(within(overlay).getByText('先核对出团日期')).toBeInTheDocument()
    expect(within(overlay).getByText('已记下路线。')).toBeInTheDocument()
    expect(within(overlay).getByRole('button', { name: '思考过程' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '思考过程' })).toHaveLength(1)

    await waitFor(() => {
      expect(lastEventSource?.readyState).toBe(1)
    })

    await act(async () => {
      pushSnapshot(lastEventSource, {
        revision: 2,
        reasoningText: '再核人数',
        text: '已记下路线。人数待核。',
      })
    })

    expect(within(overlay).getByText('再核人数')).toBeInTheDocument()
    expect(within(overlay).getByText('已记下路线。人数待核。')).toBeInTheDocument()
    expect(within(overlay).queryByText('先核对出团日期')).not.toBeInTheDocument()

    await user.click(within(overlay).getByRole('button', { name: '返回业务页面' }))

    const restoredPane = screen.getByRole('complementary', { name: '电子化助理' })
    expect(screen.queryByRole('dialog', { name: '小团宝 Agent' })).not.toBeInTheDocument()
    expect(within(restoredPane).getByText('再核人数')).toBeInTheDocument()
    expect(within(restoredPane).getByText('已记下路线。人数待核。')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '思考过程' })).toHaveLength(1)
  })
})
