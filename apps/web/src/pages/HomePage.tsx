import { Button, Result } from 'antd'
import { useNavigate } from '@tanstack/react-router'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <Result
      status="info"
      title="工作台开发中"
      subTitle="工作台概览功能正在建设中，暂未开放业务数据。您可以先从发团管理开始使用。"
      extra={
        <Button type="primary" onClick={() => void navigate({ to: '/departure' })}>
          前往发团管理
        </Button>
      }
    />
  )
}
