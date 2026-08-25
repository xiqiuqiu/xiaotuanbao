import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useUiStore } from '@/app/store/ui.store'
import { AssistPane } from './AssistPane'
import { AssistPaneSlotProvider, useAssistPaneSlot } from './assist-pane-slot'

const expandToGlobal = vi.fn()

vi.mock('@/features/agent-conversation/use-expand-agent-conversation', () => ({
  useExpandAgentConversation: () => expandToGlobal,
}))

vi.mock('@/features/agent-conversation/AgentConversationChat', () => ({
  AgentConversationChat: () => <p>通用会话</p>,
}))

vi.mock('@/features/agent-conversation/ConversationHistoryTrigger', () => ({
  ConversationHistoryTrigger: () => <button type="button">打开会话历史</button>,
}))

function SlotSetter({ text, extra }: { text: string; extra?: string }) {
  const { setContent, setHeaderExtra } = useAssistPaneSlot()
  useEffect(() => {
    setContent(<p>{text}</p>)
    if (extra) {
      setHeaderExtra(<button type="button">{extra}</button>)
    }
    return () => {
      setContent(null)
      setHeaderExtra(null)
    }
  }, [extra, setContent, setHeaderExtra, text])
  return null
}

describe('AssistPane', () => {
  beforeEach(() => {
    expandToGlobal.mockReset()
    useUiStore.setState({ assistPaneCollapsed: true })
    useAgentConversationStore.setState({
      view: 'page',
      conversationId: null,
      title: '新会话',
      returnLocation: null,
      historyRailCollapsed: false,
    })
  })
  afterEach(() => cleanup())

  it('hides the complementary role when collapsed so the main column keeps full width', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <main>发团表单</main>
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('发团表单')).toBeVisible()
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    const slot = document.querySelector('aside[aria-label="电子化助理"]')
    expect(slot).toBeInTheDocument()
    expect(slot).toHaveAttribute('aria-hidden', 'true')
  })

  it('closes from its own header without masking the main content', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <main>发团表单</main>
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('发团表单')).toBeVisible()
    expect(screen.getByText('通用会话')).toBeInTheDocument()
    expect(document.querySelector('[aria-label="关闭侧边栏"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    expect(useUiStore.getState().assistPaneCollapsed).toBe(true)
  })

  it('renders the registered page slot instead of the placeholder', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <SlotSetter text="建团协助" />
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('建团协助')).toBeInTheDocument()
    expect(screen.queryByText('通用会话')).not.toBeInTheDocument()
  })

  it('replaces the page slot when a historical conversation is selected', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'c-1',
      title: '历史会话甲',
      returnLocation: null,
      historyRailCollapsed: false,
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <SlotSetter text="建团协助" />
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('通用会话')).toBeInTheDocument()
    expect(screen.queryByText('建团协助')).not.toBeInTheDocument()
  })

  it('renders page header actions next to the close control', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <SlotSetter text="建团协助" extra="发团资料" />
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: '发团资料' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起电子化助理' })).toBeInTheDocument()
  })

  it('expands the same Conversation into the global route and keeps the ID', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ assistPaneCollapsed: false })
    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'c-1',
      title: '川西账款',
      returnLocation: null,
      historyRailCollapsed: false,
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: '进入全局模式' }))
    expect(expandToGlobal).toHaveBeenCalledTimes(1)
  })

  it('uses a different accessible name for expand than for hiding the pane', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistPaneSlotProvider>
          <AssistPane />
        </AssistPaneSlotProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: '进入全局模式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起电子化助理' })).toBeInTheDocument()
  })

  it('throws when useAssistPaneSlot is used outside AssistPaneSlotProvider', () => {
    function Probe() {
      useAssistPaneSlot()
      return null
    }

    expect(() => render(<Probe />)).toThrow(/AssistPaneSlotProvider/)
  })
})
