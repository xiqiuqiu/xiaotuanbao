import { Button, Typography } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'

export function PlatformHomePage() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        平台工作台
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {user?.name ? `${user.name}，欢迎进入平台运营区。` : '欢迎进入平台运营区。'}
      </Typography.Paragraph>
      <Button type="primary" onClick={() => void navigate({ to: '/platform/organizations' })}>
        客户 Organization 名录
      </Button>
    </div>
  )
}
