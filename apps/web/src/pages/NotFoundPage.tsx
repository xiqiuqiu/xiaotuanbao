import { Button, Result } from 'antd'
import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在。"
      extra={
        <Link to="/">
          <Button type="primary">返回工作台</Button>
        </Link>
      }
    />
  )
}
