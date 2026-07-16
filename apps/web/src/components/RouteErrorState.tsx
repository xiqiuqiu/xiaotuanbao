import { Button, Result, Typography } from 'antd'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'

/**
 * 路由渲染期抛错的兜底 UI，替代整站白屏。
 * reset 重挂当前路由子树；「前往发团管理」用于错误无法就地恢复时。
 */
export function RouteErrorState({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const err = error instanceof Error ? error : null
  const description = err?.message || '页面出现异常，请重试。'

  return (
    <Result
      status="error"
      title="页面加载失败"
      subTitle={description}
      extra={[
        <Button
          key="retry"
          type="primary"
          onClick={() => {
            reset()
            void router.invalidate()
          }}
        >
          重试
        </Button>,
        <Button key="home" onClick={() => void router.navigate({ to: '/departure' })}>
          前往发团管理
        </Button>,
      ]}
    >
      {import.meta.env.DEV && err?.stack ? (
        <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
          {err.stack}
        </Typography.Paragraph>
      ) : null}
    </Result>
  )
}
