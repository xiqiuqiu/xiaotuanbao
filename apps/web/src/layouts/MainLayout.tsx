import { Layout, Menu, Breadcrumb, Button, Dropdown, theme } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import type { CSSProperties, PropsWithChildren } from 'react'
import { useMemo } from 'react'
import { env } from '@/config/env'
import { mainMenuItems, routeTitles } from '@/constants/menus'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { filterMenuItems } from '@/utils/menu-permission'
import styles from './MainLayout.module.css'

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
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)

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
    <Layout
      className={styles.shell}
      style={{
        '--shell-border': token.colorBorderSecondary,
        '--shell-text': token.colorText,
        '--shell-overlay-shadow': token.boxShadowSecondary,
      } as CSSProperties}
    >
      <Sider
        className={styles.sider}
        collapsible
        collapsed={sidebarCollapsed}
        trigger={null}
        width={220}
        collapsedWidth={0}
        breakpoint="md"
        onBreakpoint={(broken) => {
          if (broken) {
            setSidebarCollapsed(true)
          }
        }}
        theme="light"
      >
        <div
          className={`${styles.brand} ${sidebarCollapsed ? styles.brandCollapsed : ''}`}
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
          className={styles.header}
        >
          <div className={styles.headerLeading}>
            <Button
              className={styles.collapseButton}
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            />
            <Breadcrumb className={styles.breadcrumb} items={breadcrumbItems} />
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
            <Button className={styles.userButton} type="text" icon={<UserOutlined />}>
              <span className={styles.userName}>{user?.name ?? '用户'}</span>
            </Button>
          </Dropdown>
        </Header>

        {children}
      </Layout>
    </Layout>
  )
}

/** 认证页全屏壳；具体布局由页面自行控制（如登录双栏）。 */
export function AuthLayout({ children }: PropsWithChildren) {
  return <>{children}</>
}
