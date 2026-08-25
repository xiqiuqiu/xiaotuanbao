import {
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Tooltip, Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useUiStore } from '@/app/store/ui.store'
import { AgentConversationChat } from './AgentConversationChat'
import { ConversationHistoryList } from './ConversationHistoryList'
import { toReturnNavigateOptions } from './agent-conversation-location'
import { nextAgentConversationRoute } from './agent-conversation-route'
import { NEW_CONVERSATION_TITLE, useAgentConversationStore } from './agent-conversation.store'
import styles from './AgentConversationPage.module.css'

export function AgentConversationPage() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const params = useParams({ from: '/app/agent/conversations/$conversationId' })
  const conversationId = useAgentConversationStore((state) => state.conversationId)
  const title = useAgentConversationStore((state) => state.title)
  const historyRailCollapsed = useAgentConversationStore((state) => state.historyRailCollapsed)
  const setHistoryRailCollapsed = useAgentConversationStore((state) => state.setHistoryRailCollapsed)
  const selectConversation = useAgentConversationStore((state) => state.selectConversation)
  const startNewConversation = useAgentConversationStore((state) => state.startNewConversation)
  const exitGlobal = useAgentConversationStore((state) => state.exitGlobal)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)

  useEffect(() => {
    const next = nextAgentConversationRoute({
      routeId: params.conversationId,
      conversationId,
    })
    if (next.kind === 'keep') {
      return
    }
    if (next.kind === 'hydrate') {
      selectConversation({
        id: next.conversationId,
        title: title === NEW_CONVERSATION_TITLE ? NEW_CONVERSATION_TITLE : title,
      })
      return
    }
    void navigate({
      to: '/agent/conversations/$conversationId',
      params: { conversationId: next.conversationId },
      replace: true,
    })
  }, [conversationId, navigate, params.conversationId, selectConversation, title])

  const collapseLabel = historyRailCollapsed ? '展开历史导航' : '折叠历史导航'

  const returnToBusiness = () => {
    const restored = exitGlobal()
    setAssistPaneCollapsed(false)
    void navigate(toReturnNavigateOptions(restored))
  }

  return (
    <div
      className={styles.page}
      data-rail-collapsed={historyRailCollapsed ? '' : undefined}
      style={
        {
          '--agent-border': token.colorBorderSecondary,
          '--agent-bg': token.colorBgContainer,
          '--agent-layout': token.colorBgLayout,
          '--agent-text': token.colorText,
          '--agent-text-secondary': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <aside className={styles.rail} aria-label="会话历史导航">
        <div className={styles.railHeader}>
          <Typography.Text strong className={styles.railTitle}>
            会话
          </Typography.Text>
          <Tooltip title={collapseLabel} placement="bottom">
            <Button
              type="text"
              icon={historyRailCollapsed ? <MenuUnfoldOutlined aria-hidden /> : <MenuFoldOutlined aria-hidden />}
              aria-label={collapseLabel}
              onClick={() => setHistoryRailCollapsed(!historyRailCollapsed)}
            />
          </Tooltip>
        </div>
        {historyRailCollapsed ? (
          <div className={styles.collapsedActions}>
            <Tooltip title="新建会话" placement="right">
              <Button
                type="text"
                icon={<PlusOutlined aria-hidden />}
                aria-label="新建会话"
                onClick={startNewConversation}
              />
            </Tooltip>
          </div>
        ) : (
          <div className={styles.railBody}>
            <ConversationHistoryList fillHeight />
          </div>
        )}
      </aside>
      <section className={styles.chat} aria-label="当前会话">
        <header className={styles.chatHeader}>
          <Button
            className={styles.mobileHistory}
            type="text"
            icon={<HistoryOutlined aria-hidden />}
            aria-label="打开历史会话"
            onClick={() => setMobileHistoryOpen(true)}
          />
          <Typography.Text strong className={styles.chatTitle}>
            {title}
          </Typography.Text>
          <Tooltip title="返回业务页面" placement="bottom">
            <Button
              type="text"
              icon={<ShrinkOutlined aria-hidden />}
              aria-label="返回业务页面"
              onClick={returnToBusiness}
            />
          </Tooltip>
        </header>
        <div className={styles.chatBody}>
          <AgentConversationChat />
        </div>
      </section>
      <Drawer
        title="历史会话"
        placement="left"
        size="min(88vw, 360px)"
        open={mobileHistoryOpen}
        onClose={() => setMobileHistoryOpen(false)}
      >
        <ConversationHistoryList
          enabled={mobileHistoryOpen}
          onSelect={() => setMobileHistoryOpen(false)}
          onCreate={() => setMobileHistoryOpen(false)}
        />
      </Drawer>
    </div>
  )
}
