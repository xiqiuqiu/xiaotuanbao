import { DownOutlined } from '@ant-design/icons'
import { Button, Popover } from 'antd'
import { useRef, useState, type KeyboardEvent } from 'react'
import { useAgentConversationStore } from './agent-conversation.store'
import { ConversationHistoryList } from './ConversationHistoryList'
import styles from './ConversationHistoryPanel.module.css'

export function ConversationHistoryTrigger() {
  const title = useAgentConversationStore((state) => state.title)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const closeAndRestoreFocus = () => {
    setOpen(false)
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus()
    })
  }

  const panel = (
    <dialog
      open={open}
      className={styles.panel}
      aria-label="会话历史"
      onKeyDown={(event: KeyboardEvent<HTMLDialogElement>) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          closeAndRestoreFocus()
        }
      }}
    >
      <ConversationHistoryList
        enabled={open}
        onSelect={closeAndRestoreFocus}
        onCreate={closeAndRestoreFocus}
      />
    </dialog>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      destroyOnHidden
      content={panel}
    >
      <Button
        ref={triggerRef}
        className={styles.trigger}
        type="text"
        aria-label="打开会话历史"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.triggerLabel}>{title}</span>
        <DownOutlined aria-hidden />
      </Button>
    </Popover>
  )
}
