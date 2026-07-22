import { ConfigProvider, message } from 'antd'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/app/store/auth.store'
import { useUiStore } from '@/app/store/ui.store'
import { logout } from '@/services/auth.service'
import { MainLayout } from './MainLayout'

const navigate = vi.fn()
let pathname = '/departure'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
  useRouterState: () => ({ location: { pathname } }),
}))

vi.mock('@/services/auth.service', () => ({
  logout: vi.fn(),
}))

describe('MainLayout 侧栏开关', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathname = '/departure'
    useAuthStore.setState({
      user: { id: 'user-1', name: '张三' },
      menuKeys: ['/departure'],
      sessionStatus: 'authenticated',
    })
    useUiStore.setState({ sidebarCollapsed: false })
  })

  afterEach(() => {
    cleanup()
  })

  it('Tooltip 与可访问名称随折叠状态同步', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    const collapseButton = screen.getByRole('button', { name: '折叠侧边栏' })
    await user.hover(collapseButton)
    expect(await screen.findByRole('tooltip', { name: '折叠侧边栏' })).toBeInTheDocument()

    await user.unhover(collapseButton)
    await user.click(collapseButton)

    const expandButton = await screen.findByRole('button', { name: '展开侧边栏' })
    await user.hover(expandButton)
    expect(await screen.findByRole('tooltip', { name: '展开侧边栏' })).toBeInTheDocument()
  })

  it('打开用户菜单后，用户名浮层不得遮挡退出登录', async () => {
    vi.mocked(logout).mockResolvedValue(undefined)
    const fullName = '诸葛明远·企业管理员（边界显示）'
    useAuthStore.setState({
      user: { id: 'user-1', name: fullName },
      menuKeys: ['/departure'],
      sessionStatus: 'authenticated',
    })
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    const userButton = screen.getByRole('button', { name: /诸葛明远/ })
    // 截断全名仍可观测（原生 title），且不得再挂 antd Tooltip 浮层。
    expect(userButton).toHaveAttribute('title', fullName)

    await user.click(userButton)
    expect(await screen.findByText('退出登录')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip', { name: fullName })).not.toBeInTheDocument()

    await user.click(screen.getByText('退出登录'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }))
  })

  it('快速重复退出只请求一次并清空本地会话', async () => {
    let resolveLogout!: () => void
    vi.mocked(logout).mockReturnValue(new Promise<void>((resolve) => {
      resolveLogout = resolve
    }))
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: /张三/ }))
    const logoutItem = await screen.findByText('退出登录')
    fireEvent.click(logoutItem)
    fireEvent.click(logoutItem)

    expect(logout).toHaveBeenCalledTimes(1)
    resolveLogout()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }))
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
  })

  it('服务端退出失败仍清空本地会话并提示风险', async () => {
    vi.mocked(logout).mockRejectedValue(new Error('network error'))
    const warning = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: /张三/ }))
    await user.click(await screen.findByText('退出登录'))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }))
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    expect(warning).toHaveBeenCalledWith('服务器会话可能未清除，请勿在公共设备上继续使用')
  })

  it.each([
    ['/departure/departure-1', '/departure', '发团管理'],
    ['/departure/new', '/departure', '发团管理'],
    ['/partner/partner-1', '/partner', '合作伙伴'],
    ['/supplier/supplier-1', '/supplier', '供应商管理'],
    ['/product/product-1', '/product', '产品中心'],
  ])('子页面 %s 保持父级菜单 %s 选中', (currentPathname, menuKey, menuLabel) => {
    pathname = currentPathname
    useAuthStore.setState({
      menuKeys: ['/departure', '/partner', '/supplier', '/product'],
    })

    render(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    const menuItem = screen.getByRole('menuitem', { name: new RegExp(`${menuLabel}$`) })
    expect(menuItem).toHaveAttribute('data-menu-id', expect.stringContaining(menuKey))
    expect(menuItem).toHaveClass('ant-menu-item-selected')
  })

  it.each([
    ['/finance/receivable', '应收管理'],
    ['/finance/payable', '应付管理'],
    ['/system/users', '员工管理'],
  ])('从工作台跳到二级菜单 %s 时自动展开父级', async (targetPathname, childLabel) => {
    pathname = '/'
    useAuthStore.setState({
      menuKeys: [
        '/',
        '/finance/receivable',
        '/finance/payable',
        '/finance/transactions',
        '/finance/verification',
        '/system/organization',
        '/system/users',
      ],
    })

    const { rerender } = render(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    expect(screen.queryByRole('menuitem', { name: childLabel })).not.toBeInTheDocument()

    pathname = targetPathname
    rerender(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    const childItem = await screen.findByRole('menuitem', { name: childLabel })
    expect(childItem).toHaveClass('ant-menu-item-selected')
  })
})
