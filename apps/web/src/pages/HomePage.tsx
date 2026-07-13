import { Button, Result } from 'antd'
import { Link } from '@tanstack/react-router'

export function HomePage() {
  return (
    <Result
      status="info"
      title="工作台开发中"
      subTitle="工作台概览功能正在建设中，暂未开放业务数据。您可以先从发团管理开始使用。"
      extra={
        <Link to="/departure">
          <Button type="primary">前往发团管理</Button>
        </Link>
      }
    />
  )
}
