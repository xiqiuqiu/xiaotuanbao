import { Button, Dropdown, Layout, message, theme } from 'antd'
import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Outlet, useNavigate } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { useRef } from 'react'
import { useAuthStore } from '@/app/store/auth.store'
import { env } from '@/config/env'
import { logout as logoutSession } from '@/services/auth.service'
import { queryClient } from '@/lib/query/client'
import styles from './PlatformLayout.module.css'

const { Header } = Layout

export function PlatformLayout() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const logoutPendingRef = useRef(false)

  return (
    <Layout
      className={styles.shell}
      style={
        {
          '--shell-border': token.colorBorderSecondary,
          '--shell-text': token.colorText,
          '--shell-text-tertiary': token.colorTextTertiary,
          '--shell-surface': token.colorBgContainer,
        } as CSSProperties
      }
    >
      <Header className={styles.header}>
        <div className={styles.brand} aria-label={`${env.appName} 平台区`}>
          <img
            className={styles.brandLogo}
            src="/xiaotuanbao-brand-mark-v2.png"
            alt=""
            aria-hidden="true"
          />
          <span className={styles.brandName}>{env.appName}</span>
          <span className={styles.brandMeta}>平台运营</span>
        </div>

        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: async () => {
                  if (logoutPendingRef.current) {
                    return
                  }
                  logoutPendingRef.current = true
                  try {
                    await logoutSession()
                  } catch {
                    message.warning('服务器会话可能未清除，请勿在公共设备上继续使用')
                  } finally {
                    clearSession()
                    queryClient.clear()
                    navigate({ to: '/login' })
                    logoutPendingRef.current = false
                  }
                },
              },
            ],
          }}
        >
          <Button className={styles.userButton} type="text" icon={<UserOutlined />}>
            <span className={styles.userName}>{user?.name ?? '平台管理员'}</span>
          </Button>
        </Dropdown>
      </Header>

      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
