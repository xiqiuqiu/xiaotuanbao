import { Button, Result } from 'antd'
import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在。"
      extra={
        <Link to="/departure">
          <Button type="primary">前往发团管理</Button>
        </Link>
      }
    />
  )
}
