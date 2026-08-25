import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConversationPage } from './AgentConversationPage'
import { useAgentConversationStore } from './agent-conversation.store'
import { useUiStore } from '@/app/store/ui.store'

const navigate = vi.fn()
let routeConversationId = 'c-1'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ conversationId: routeConversationId }),
}))

vi.mock('./AgentConversationChat', () => ({
  AgentConversationChat: () => <p>当前聊天</p>,
}))

vi.mock('./ConversationHistoryList', () => ({
  ConversationHistoryList: () => <div>历史列表</div>,
}))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConfigProvider>
        <AgentConversationPage />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('AgentConversationPage #370', () => {
  beforeEach(() => {
    navigate.mockReset()
    routeConversationId = 'c-1'
    useUiStore.setState({ assistPaneCollapsed: true })
    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'c-1',
      title: '川西账款',
      returnLocation: { pathname: '/departure', search: '?status=open', hash: '' },
      historyRailCollapsed: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps history navigation and chat as two projections of the same Conversation', () => {
    renderPage()
    expect(screen.getByRole('complementary', { name: '会话历史导航' })).toBeInTheDocument()
    expect(screen.getByText('川西账款')).toBeInTheDocument()
    expect(screen.getByText('当前聊天')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '折叠历史导航' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回业务页面' })).toBeInTheDocument()
  })

  it('returns to the captured business location and restores the side pane', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '返回业务页面' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure',
      search: { status: 'open' },
      hash: undefined,
    })
    expect(useUiStore.getState().assistPaneCollapsed).toBe(false)
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-1',
      title: '川西账款',
      returnLocation: null,
    })
  })

  it('uses a distinct accessible name for collapsing history versus exiting global mode', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '折叠历史导航' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回业务页面' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入全局模式' })).not.toBeInTheDocument()
  })
})
