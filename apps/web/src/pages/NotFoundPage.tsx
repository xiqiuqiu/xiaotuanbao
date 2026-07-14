import { Button, Result } from 'antd'
import { useNavigate } from '@tanstack/react-router'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在。"
      extra={
        <Button type="primary" onClick={() => void navigate({ to: '/departure' })}>
          前往发团管理
        </Button>
      }
    />
  )
}
