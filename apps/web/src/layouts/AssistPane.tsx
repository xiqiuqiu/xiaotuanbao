import { CloseOutlined, ExpandOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Tooltip, theme } from 'antd'
import type { CSSProperties } from 'react'
import { AgentConversationChat } from '@/features/agent-conversation/AgentConversationChat'
import { ConversationHistoryTrigger } from '@/features/agent-conversation/ConversationHistoryTrigger'
import { useExpandAgentConversation } from '@/features/agent-conversation/use-expand-agent-conversation'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useUiStore } from '@/app/store/ui.store'
import { useAssistPaneSlot } from './assist-pane-slot'
import styles from './AssistPane.module.css'

export function AssistPane() {
  const { token } = theme.useToken()
  const collapsed = useUiStore((state) => state.assistPaneCollapsed)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const startNewConversation = useAgentConversationStore((state) => state.startNewConversation)
  const expandToGlobal = useExpandAgentConversation()
  const conversationView = useAgentConversationStore((state) => state.view)
  const { content, headerExtra } = useAssistPaneSlot()
  const showHistoryProjection = conversationView !== 'page' || !content
  return (
    <aside
      className={styles.slot}
      aria-label="电子化助理"
      aria-hidden={collapsed}
      inert={collapsed || undefined}
      data-open={collapsed ? undefined : ''}
      data-motion=""
      style={
        {
          '--assist-border': token.colorBorderSecondary,
          '--assist-bg': token.colorBgContainer,
          '--assist-text': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <div className={styles.pane}>
        <div className={styles.paneHeader}>
          <ConversationHistoryTrigger />
          <div className={styles.headerActions}>
            <Button
              className={styles.iconButton}
              type="text"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => startNewConversation()}
              aria-label="新建会话"
            />
            {headerExtra}
            <Tooltip title="进入全局模式" placement="bottom">
              <Button
                className={`${styles.iconButton} ${styles.expand}`}
                type="text"
                icon={<ExpandOutlined aria-hidden />}
                aria-label="进入全局模式"
                onClick={expandToGlobal}
              />
            </Tooltip>
            <Button
              className={styles.close}
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setAssistPaneCollapsed(true)}
              aria-label="收起电子化助理"
            />
          </div>
        </div>
        <div className={styles.body}>
          {showHistoryProjection ? <AgentConversationChat /> : content}
        </div>
      </div>
    </aside>
  )
}
