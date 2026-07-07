import { Layout, Menu, Breadcrumb, Button, Dropdown, theme, Typography } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { useMemo } from 'react'
import { env } from '@/config/env'
import { mainMenuItems, routeTitles } from '@/constants/menus'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { filterMenuItems } from '@/utils/menu-permission'

const { Header, Sider } = Layout

export function MainLayout({ children }: PropsWithChildren) {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const user = useAuthStore((state) => state.user)
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const logout = useAuthStore((state) => state.logout)
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  const visibleMenuItems = useMemo(
    () => filterMenuItems(mainMenuItems, menuKeys),
    [menuKeys],
  )

  const menuSelectedKey = pathname.startsWith('/supplier/') ? '/supplier' : pathname
  const selectedKeys = [menuSelectedKey]
  const openKeys = pathname.startsWith('/finance')
    ? ['finance']
    : pathname.startsWith('/system')
      ? ['system']
      : []

  const breadcrumbItems = [
    { title: <Link to="/">{routeTitles['/']}</Link> },
    ...(pathname.startsWith('/supplier/')
      ? [
          { title: <Link to="/supplier">供应商管理</Link> },
          { title: '详情' },
        ]
      : pathname !== '/'
        ? [{ title: routeTitles[pathname] ?? '页面' }]
        : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={sidebarCollapsed}
        trigger={null}
        width={220}
        theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: sidebarCollapsed ? 14 : 18,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {sidebarCollapsed ? '团' : env.appName}
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={visibleMenuItems}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              navigate({ to: key })
            }
          }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
            />
            <Breadcrumb items={breadcrumbItems} />
          </div>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: () => {
                    logout()
                    navigate({ to: '/login' })
                  },
                },
              ],
            }}
          >
            <Button type="text" icon={<UserOutlined />}>
              {user?.name ?? '用户'}
            </Button>
          </Dropdown>
        </Header>

        {children}
      </Layout>
    </Layout>
  )
}

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Content
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 100%)',
        }}
      >
        <div style={{ width: 400, maxWidth: '90vw' }}>
          <Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 32 }}>
            {env.appName}
          </Typography.Title>
          {children}
        </div>
      </Layout.Content>
    </Layout>
  )
}
