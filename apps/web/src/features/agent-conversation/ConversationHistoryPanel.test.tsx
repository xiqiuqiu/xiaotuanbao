import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationHistoryPage } from '@xiaotuanbao/shared'
import { ConversationHistoryTrigger } from './ConversationHistoryTrigger'
import { useAgentConversationStore } from './agent-conversation.store'
import { listAgentConversations } from '@/services/agent-conversation.service'

vi.mock('@/services/agent-conversation.service', () => ({
  listAgentConversations: vi.fn(),
}))

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

function page(items: ConversationHistoryPage['items'], nextCursor: string | null = null): ConversationHistoryPage {
  return { items, nextCursor }
}

function renderTrigger() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConfigProvider locale={zhCN}>
        <ConversationHistoryTrigger />
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('ConversationHistoryTrigger', () => {
  beforeEach(() => {
    navigate.mockReset()
    useAgentConversationStore.setState({
      view: 'page',
      conversationId: null,
      title: '新会话',
    })
    vi.mocked(listAgentConversations).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('opens the history overlay with search, new conversation and grouped items', async () => {
    const user = userEvent.setup()
    vi.mocked(listAgentConversations).mockResolvedValue(
      page([
        {
          id: 'c-today',
          title: '今天的账款查询',
          status: 'open',
          lastActivityAt: '2026-08-25T02:00:00.000Z',
          activityGroup: 'today',
        },
        {
          id: 'c-old',
          title: '更早的建团讨论',
          status: 'open',
          lastActivityAt: '2026-07-01T02:00:00.000Z',
          activityGroup: 'earlier',
        },
      ]),
    )

    renderTrigger()
    await user.click(screen.getByRole('button', { name: '打开会话历史' }))

    const overlay = await screen.findByRole('dialog', { name: '会话历史' })
    expect(within(overlay).getByRole('searchbox', { name: '搜索会话' })).toBeInTheDocument()
    expect(within(overlay).getByRole('button', { name: '新建会话' })).toBeInTheDocument()
    expect(within(overlay).getByText('今天')).toBeInTheDocument()
    expect(within(overlay).getByRole('option', { name: '今天的账款查询' })).toBeInTheDocument()
    expect(within(overlay).getByText('更早')).toBeInTheDocument()
    expect(within(overlay).getByRole('option', { name: '更早的建团讨论' })).toBeInTheDocument()
  })

  it('shows empty and loading states', async () => {
    const user = userEvent.setup()
    let resolveList: (value: ConversationHistoryPage) => void = () => undefined
    vi.mocked(listAgentConversations).mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )

    renderTrigger()
    await user.click(screen.getByRole('button', { name: '打开会话历史' }))
    expect(screen.getByLabelText('正在加载会话历史')).toBeInTheDocument()

    resolveList(page([]))
    expect(await screen.findByText('还没有会话')).toBeInTheDocument()
  })

  it('switches a historical conversation without navigating the business page', async () => {
    const user = userEvent.setup()
    vi.mocked(listAgentConversations).mockResolvedValue(
      page([
        {
          id: 'c-1',
          title: '历史会话甲',
          status: 'open',
          lastActivityAt: '2026-08-25T02:00:00.000Z',
          activityGroup: 'today',
        },
      ]),
    )

    renderTrigger()
    await user.click(screen.getByRole('button', { name: '打开会话历史' }))
    await user.click(await screen.findByRole('option', { name: '历史会话甲' }))

    expect(navigate).not.toHaveBeenCalled()
    expect(useAgentConversationStore.getState()).toMatchObject({
      view: 'history',
      conversationId: 'c-1',
      title: '历史会话甲',
    })
    expect(screen.getByRole('button', { name: '打开会话历史' })).toHaveAccessibleName('打开会话历史')
    expect(screen.getByRole('button', { name: '打开会话历史' })).toHaveTextContent('历史会话甲')
  })

  it('starts an unsaved new conversation from the overlay', async () => {
    const user = userEvent.setup()
    useAgentConversationStore.setState({ conversationId: 'c-1', title: '历史会话甲' })
    vi.mocked(listAgentConversations).mockResolvedValue(page([]))

    renderTrigger()
    await user.click(screen.getByRole('button', { name: '打开会话历史' }))
    const overlay = await screen.findByRole('dialog', { name: '会话历史' })
    await user.click(within(overlay).getByRole('button', { name: '新建会话' }))

    expect(navigate).not.toHaveBeenCalled()
    expect(useAgentConversationStore.getState()).toMatchObject({
      view: 'new',
      conversationId: null,
      title: '新会话',
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '打开会话历史' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  })

  it('returns focus to the title trigger after Escape', async () => {
    const user = userEvent.setup()
    vi.mocked(listAgentConversations).mockResolvedValue(page([]))

    renderTrigger()
    const trigger = screen.getByRole('button', { name: '打开会话历史' })
    await user.click(trigger)
    await screen.findByRole('dialog', { name: '会话历史' })
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
    expect(trigger).toHaveFocus()
  })

  it('keeps the new-conversation control large enough for mobile touch', async () => {
    const user = userEvent.setup()
    vi.mocked(listAgentConversations).mockResolvedValue(page([]))

    renderTrigger()
    await user.click(screen.getByRole('button', { name: '打开会话历史' }))
    const overlay = await screen.findByRole('dialog', { name: '会话历史' })
    const create = within(overlay).getByRole('button', { name: '新建会话' })
    expect(create).toHaveStyle({ minHeight: '44px' })
  })
})
