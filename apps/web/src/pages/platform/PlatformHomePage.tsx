import { Typography } from 'antd'
import { useAuthStore } from '@/app/store/auth.store'

export function PlatformHomePage() {
  const user = useAuthStore((state) => state.user)

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        平台工作台
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {user?.name ? `${user.name}，欢迎进入平台运营区。` : '欢迎进入平台运营区。'}
        客户 Organization 名录维护将在后续交付。
      </Typography.Paragraph>
    </div>
  )
}
