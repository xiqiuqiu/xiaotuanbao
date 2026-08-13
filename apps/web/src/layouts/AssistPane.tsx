import { CloseOutlined } from '@ant-design/icons'
import { Button, Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import { useUiStore } from '@/app/store/ui.store'
import { useAssistPaneSlot } from './assist-pane-slot'
import styles from './AssistPane.module.css'

export function AssistPane() {
  const { token } = theme.useToken()
  const collapsed = useUiStore((state) => state.assistPaneCollapsed)
  const setAssistPaneCollapsed = useUiStore((state) => state.setAssistPaneCollapsed)
  const { content } = useAssistPaneSlot()

  if (collapsed) {
    return null
  }

  return (
    <aside
      className={styles.pane}
      aria-label="电子化助理"
      style={
        {
          '--assist-border': token.colorBorderSecondary,
          '--assist-bg': token.colorBgContainer,
          '--assist-text': token.colorTextSecondary,
        } as CSSProperties
      }
    >
      <div className={styles.paneHeader}>
        <Typography.Text className={styles.paneTitle}>电子化助理</Typography.Text>
        <Button
          className={styles.close}
          type="text"
          icon={<CloseOutlined />}
          onClick={() => setAssistPaneCollapsed(true)}
          aria-label="收起电子化助理"
        />
      </div>
      <div className={styles.body}>
        {content ?? <p className={styles.placeholder}>当前页尚未接入业务辅助</p>}
      </div>
    </aside>
  )
}
