import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConversationChat } from './AgentConversationChat'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
import {
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

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CopilotChatConfigurationProvider: ({ children }: { children: React.ReactNode }) => children,
  CopilotChatView: ({
    inputValue,
    onInputChange,
    onSubmitMessage,
  }: {
    inputValue?: string
    onInputChange?: (value: string) => void
    onSubmitMessage?: (value: string) => void
  }) => (
    <div>
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

describe('AgentConversationChat page locator #371', () => {
  beforeEach(() => {
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
