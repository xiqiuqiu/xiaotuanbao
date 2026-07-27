import { Layout, Menu, Breadcrumb, Button, Dropdown, Tooltip, message, theme } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import type { CSSProperties, PropsWithChildren } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { env } from '@/config/env'
import { mainMenuItems, routeTitles } from '@/constants/menus'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { filterMenuItems, findMenuKeyForPathname } from '@/utils/menu-permission'
import { logout as logoutSession } from '@/services/auth.service'
import { queryClient } from '@/lib/query/client'
import styles from './MainLayout.module.css'

const { Header, Sider } = Layout

export function MainLayout({ children }: PropsWithChildren) {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const user = useAuthStore((state) => state.user)
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const clearSession = useAuthStore((state) => state.clearSession)
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const logoutPendingRef = useRef(false)

  const visibleMenuItems = useMemo(
    () => filterMenuItems(mainMenuItems, menuKeys),
    [menuKeys],
  )

  const menuSelectedKey = findMenuKeyForPathname(pathname, menuKeys) ?? pathname
  const selectedKeys = [menuSelectedKey]
  const sidebarToggleLabel = sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    if (pathname.startsWith('/finance')) return ['finance']
    if (pathname.startsWith('/system')) return ['system']
    return []
  })

  // defaultOpenKeys 仅在首次挂载生效；从工作台跳入二级菜单时需受控同步展开父级。
  useEffect(() => {
    const routeOpenKeys = pathname.startsWith('/finance')
      ? ['finance']
      : pathname.startsWith('/system')
        ? ['system']
        : []
    if (routeOpenKeys.length === 0) {
      return
    }
    setOpenKeys((prev) => {
      const openKeySet = new Set(prev)
      if (routeOpenKeys.every((key) => openKeySet.has(key))) {
        return prev
      }
      return Array.from(new Set([...prev, ...routeOpenKeys]))
    })
  }, [pathname])

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
          aria-label={env.appName}
        >
          <img
            className={styles.brandLockup}
            src="/xiaotuanbao-brand-lockup-transparent-v2.png"
            alt=""
            aria-hidden="true"
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={visibleMenuItems}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              navigate({ to: key })
            }
          }}
        />
      </Sider>

      <Layout className={styles.main}>
        <Header
          className={styles.header}
        >
          <div className={styles.headerLeading}>
            <Tooltip title={sidebarToggleLabel} placement="bottom">
              <Button
                className={styles.collapseButton}
                type="text"
                icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={toggleSidebar}
                aria-label={sidebarToggleLabel}
              />
            </Tooltip>
            <Breadcrumb className={styles.breadcrumb} items={breadcrumbItems} />
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
                      // Abort in-flight queries before clearing the cookie so
                      // Jwt-guarded responses cannot toast "Unauthorized" on /login.
                      await queryClient.cancelQueries()
                      clearSession()
                      await logoutSession()
                    } catch {
                      message.warning('服务器会话可能未清除，请勿在公共设备上继续使用')
                    } finally {
                      queryClient.clear()
                      navigate({ to: '/login' })
                      logoutPendingRef.current = false
                    }
                  },
                },
              ],
            }}
          >
            {/* 用原生 title 展示截断全名：antd Tooltip 会在点击打开下拉时盖住「退出登录」。 */}
            <Button
              className={styles.userButton}
              type="text"
              icon={<UserOutlined />}
              title={user?.name ?? '用户'}
            >
              <span className={styles.userName}>{user?.name ?? '用户'}</span>
            </Button>
          </Dropdown>
        </Header>

        {children}
      </Layout>
    </Layout>
  )
}
