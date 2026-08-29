import type { CSSProperties } from 'react'
import { Alert, Button } from 'antd'

export function CriticalQueryErrorAlert(props: {
  title: string
  description?: string
  onRetry: () => void
  retrying?: boolean
  style?: CSSProperties
}) {
  return (
    <Alert
      type="error"
      showIcon
      title={props.title}
      description={props.description ?? '请检查网络后重试'}
      action={
        <Button
          size="small"
          loading={props.retrying}
          aria-label="重试"
          onClick={props.onRetry}
        >
          重试
        </Button>
      }
      style={{ marginBottom: 16, ...props.style }}
    />
  )
}
