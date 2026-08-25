import {
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Tooltip, Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { AgentConversationChat } from './AgentConversationChat'
import { ConversationHistoryList } from './ConversationHistoryList'
import { useAgentConversationStore } from './agent-conversation.store'
import styles from './AgentConversationPage.module.css'

export function AgentConversationPage({
  onExit,
  className,
}: {
  onExit?: () => void
  className?: string
}) {
  const { token } = theme.useToken()
  const title = useAgentConversationStore((state) => state.title)
  const historyRailCollapsed = useAgentConversationStore((state) => state.historyRailCollapsed)
  const setHistoryRailCollapsed = useAgentConversationStore((state) => state.setHistoryRailCollapsed)
  const startNewConversation = useAgentConversationStore((state) => state.startNewConversation)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)

  const collapseLabel = historyRailCollapsed ? '展开历史导航' : '折叠历史导航'

  return (
    <div
      className={[styles.page, className].filter(Boolean).join(' ')}
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
                onClick={() => startNewConversation()}
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
              onClick={onExit}
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
