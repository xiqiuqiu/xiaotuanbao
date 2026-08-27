import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConversationChat } from './AgentConversationChat'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import {
  listAgentConversationEvents,
  saveAgentConversationDraft,
  sendAgentConversationText,
} from '@/services/agent-conversation.service'
import { ApiError } from '@/lib/request'

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
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: (options?: {
    select?: (state: { location: { pathname: string; searchStr: string; hash: string } }) => unknown
  }) => {
    const state = {
      location: { pathname: '/partner/partner-1', searchStr: '?tab=accounts', hash: '' },
    }
    return options?.select ? options.select(state) : state
  },
}))

let capturedActivityRenderers: Array<{
  activityType?: string
  render?: (props: { content: unknown }) => React.ReactNode
}> = []

vi.mock('@copilotkit/react-core/v2', () => ({
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
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => children,
  CopilotChatView: ({
    inputValue,
    onInputChange,
    onSubmitMessage,
    messages,
  }: {
    inputValue?: string
    onInputChange?: (value: string) => void
    onSubmitMessage?: (value: string) => void
    messages?: Array<{
      id?: string
      role?: string
      content?: unknown
      activityType?: string
    }>
  }) => (
    <div>
      {(messages ?? []).map((message) => {
        if (message.role === 'activity' && message.content && typeof message.content === 'object') {
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
      <textarea
        aria-label="询问小团宝业务"
        value={inputValue ?? ''}
        onChange={(event) => onInputChange?.(event.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          onSubmitMessage?.(inputValue ?? '')
          onInputChange?.('')
        }}
      >
        发送
      </button>
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

describe('AgentConversationChat page locator #371', () => {
  beforeEach(() => {
    lastEventSource = null
    vi.mocked(sendAgentConversationText).mockReset()
    useAgentConversationRuntimeStore.getState().clear()
    useAgentConversationStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a removable current-page chip on a new conversation', async () => {
    const user = userEvent.setup()
    render(<AgentConversationChat />)
    expect(await screen.findByText('当前合作伙伴往来账款')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '移除当前页面' }))
    expect(screen.queryByText('当前合作伙伴往来账款')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '获取当前页面' })).toBeInTheDocument()
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
    render(<AgentConversationChat />)
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
    render(<AgentConversationChat />)
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
      {
        text: '不带页面',
        pageLocator: null,
      },
      expect.any(String),
    )
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
    render(<AgentConversationChat />)

    const composer = await screen.findByRole('textbox', { name: '询问小团宝业务' })
    await user.type(composer, '需要保留的超长说明')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '消息内容不能超过 100000 个字符',
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(composer).toHaveValue('需要保留的超长说明')
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
    render(<AgentConversationChat />)
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

  it('shows collapsible 思考过程 from the first reasoning token and drops it after agent_message', async () => {
    const user = userEvent.setup()
    render(<AgentConversationChat />)
    expect(screen.queryByText('先核对出团日期')).not.toBeInTheDocument()

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
    expect(await screen.findByText('先核对出团日期')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: '思考过程' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

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
    expect(screen.queryByText('先核对出团日期')).not.toBeInTheDocument()
    expect(screen.getByText('再核人数')).toBeInTheDocument()

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
    expect(screen.queryByText('再核人数')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '思考过程' })).not.toBeInTheDocument()
  })
})

