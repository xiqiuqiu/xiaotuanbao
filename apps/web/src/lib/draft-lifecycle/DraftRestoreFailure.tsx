import { Button, Result } from 'antd'

export function DraftRestoreFailure(props: {
  title: string
  description?: string
  onRetry: () => void
  onStartFresh: () => void
  retrying?: boolean
}) {
  return (
    <Result
      status="error"
      title={props.title}
      subTitle={props.description ?? '请重试，或新建一份草稿继续。'}
      extra={[
        <Button
          key="retry"
          type="primary"
          loading={props.retrying}
          aria-label="重试"
          onClick={props.onRetry}
        >
          重试
        </Button>,
        <Button key="fresh" onClick={props.onStartFresh}>
          新建草稿
        </Button>,
      ]}
    />
  )
}
