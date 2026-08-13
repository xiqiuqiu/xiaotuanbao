import { Alert, Button, Drawer, Space, Spin, Typography } from 'antd'
import type { AiCollaborationErrorJson, AssistStreamEvent } from '@xiaotuanbao/ai-contracts'

export interface AiCreateAssistDrawerProps {
  open: boolean
  loading?: boolean
  events: AssistStreamEvent[]
  error: AiCollaborationErrorJson | null
  onClose: () => void
  onRetry: () => void
}

export function AiCreateAssistDrawer({
  open,
  loading = false,
  events,
  error,
  onClose,
  onRetry,
}: AiCreateAssistDrawerProps) {
  const deltas = events
    .filter((event): event is Extract<AssistStreamEvent, { type: 'message.delta' }> => event.type === 'message.delta')
    .map((event) => event.text)
    .join('')

  return (
    <Drawer
      title="AI 辅助建团"
      open={open}
      onClose={onClose}
      size={480}
      mask={false}
      destroyOnHidden={false}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          只读理解当前发团创建草稿，不会改写已保存内容。
        </Typography.Text>
        {loading ? <Spin description="正在读取当前草稿…" /> : null}
        {deltas ? <Typography.Paragraph style={{ marginBottom: 0 }}>{deltas}</Typography.Paragraph> : null}
        {error ? (
          <Alert
            type="error"
            showIcon
            title={error.message}
            action={
              error.retryable ? (
                <Button size="small" aria-label="重试" onClick={onRetry}>
                  重试
                </Button>
              ) : null
            }
          />
        ) : null}
      </Space>
    </Drawer>
  )
}
