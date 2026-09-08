import { ConversationMaterialsTrigger } from '@/features/agent-conversation/conversation-materials'
import { useNavigate } from '@tanstack/react-router'
import { DepartureCollaborationWorkspace } from '@/features/agent-conversation/DepartureCollaborationWorkspace'
import { useBusinessDepartureId } from '@/features/agent-conversation/use-business-departure-id'
import { toReturnNavigateOptions } from '@/features/agent-conversation/agent-conversation-location'
import { CloseOutlined, ExpandOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Tooltip, theme } from 'antd'
import type { CSSProperties } from 'react'
import { AgentConversationChat } from '@/features/agent-conversation/AgentConversationChat'
import { ConversationHistoryTrigger } from '@/features/agent-conversation/ConversationHistoryTrigger'
import { useExpandAgentConversation } from '@/features/agent-conversation/use-expand-agent-conversation'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useUiStore } from '@/app/store/ui.store'
import styles from './AssistPane.module.css'

export function AssistPane() {
  const { token } = theme.useToken()
  const departureId = useBusinessDepartureId()
  const navigate = useNavigate()
  const expanded = useAgentConversationStore((state) => state.globalOpen)
  const collapsed = useUiStore((state) => state.assistPaneCollapsed)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const startNewConversation = useAgentConversationStore((state) => state.startNewConversation)
  const expandToGlobal = useExpandAgentConversation()
  const header = (
<div className={styles.paneHeader}>
          <ConversationHistoryTrigger />
          <div className={styles.headerActions}>
            <ConversationMaterialsTrigger />
            <Button
              className={styles.iconButton}
              type="text"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => startNewConversation()}
              aria-label="新建会话"
            />
            <Tooltip title="展开协作工作区" placement="bottom">
              <Button
                className={`${styles.iconButton} ${styles.expand}`}
                type="text"
                icon={<ExpandOutlined aria-hidden />}
                aria-label="展开协作工作区"
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
  )
  if (departureId) {
    return <DepartureCollaborationWorkspace departureId={departureId} expanded={expanded} collapsed={collapsed} header={header}
      onExpand={expandToGlobal} onExit={() => {
        const restored = useAgentConversationStore.getState().exitGlobal()
        setAssistPaneCollapsed(false)
        void navigate(toReturnNavigateOptions(restored))
      }} />
  }
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
        {header}
        <div className={styles.body}>
          <AgentConversationChat />
        </div>
      </div>
    </aside>
  )
}
