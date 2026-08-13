import { App, ConfigProvider } from 'antd'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    pathname = '/'
    useAuthStore.setState({
      user: { id: 'user-1', name: '张三' },
      menuKeys: ['/', '/departure'],
      sessionStatus: 'authenticated',
    })
    useUiStore.setState({ sidebarCollapsed: false })
  })

  afterEach(() => {
    cleanup()
  })

  it('进入发团管理一览时不自动收起侧栏', async () => {
    const { rerender } = render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeInTheDocument()

    pathname = '/departure'
    rerender(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    await waitFor(() => {
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
    expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeInTheDocument()
  })

  it('进入发团管理详情时不自动收起侧栏', async () => {
    const { rerender } = render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeInTheDocument()

    pathname = '/departure/departure-1'
    rerender(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    await waitFor(() => {
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
    expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeInTheDocument()
  })

  it('从发团一览进入详情时保持侧栏展开', async () => {
    pathname = '/departure'
    const { rerender } = render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    expect(useUiStore.getState().sidebarCollapsed).toBe(false)

    pathname = '/departure/departure-1'
    rerender(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    await waitFor(() => {
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
  })

  it('窄屏侧栏展开时点击遮罩可关闭', async () => {
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    useUiStore.setState({ sidebarCollapsed: false })
    const user = userEvent.setup()
    try {
      render(
        <ConfigProvider>
          <MainLayout>
            <main>内容</main>
          </MainLayout>
        </ConfigProvider>,
      )

      expect(screen.getByRole('button', { name: '关闭侧边栏' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '关闭侧边栏' }))
      expect(useUiStore.getState().sidebarCollapsed).toBe(true)
      expect(screen.queryByRole('button', { name: '关闭侧边栏' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      })
    }
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

    // Local session clears before the logout HTTP call resolves, so in-flight
    // 401s after cookie clear do not toast "Unauthorized" on the login page.
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated()).toBe(false))
    expect(logout).toHaveBeenCalledTimes(1)
    resolveLogout()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }))
  })

  it('服务端退出失败仍清空本地会话并提示风险', async () => {
    vi.mocked(logout).mockRejectedValue(new Error('network error'))
    const warning = vi.fn()
    const useApp = vi.spyOn(App, 'useApp').mockReturnValue({
      message: { warning },
    } as never)
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
    useApp.mockRestore()
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
    ['/departure/departure-1', '发团详情'],
    ['/departure/new', '新建发团'],
  ])('发团子页面 %s 展示明确层级', (currentPathname, currentLabel) => {
    pathname = currentPathname

    render(
      <ConfigProvider>
        <MainLayout><main>内容</main></MainLayout>
      </ConfigProvider>,
    )

    const breadcrumb = screen.getByRole('navigation')
    expect(within(breadcrumb).getByRole('link', { name: '发团管理' })).toHaveAttribute(
      'href',
      '/departure',
    )
    expect(within(breadcrumb).getByText(currentLabel)).toBeInTheDocument()
    expect(within(breadcrumb).queryByText('页面')).not.toBeInTheDocument()
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

  it('默认两列；从中间顶栏展开后右栏与顶栏同高且主内容仍可访问', async () => {
    const user = userEvent.setup()
    render(
      <ConfigProvider>
        <MainLayout>
          <main>内容</main>
        </MainLayout>
      </ConfigProvider>,
    )

    expect(screen.getByRole('menuitem', { name: /工作台$/ })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    expect(screen.getByText('内容')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '展开电子化助理' }))
    const pane = screen.getByRole('complementary', { name: '电子化助理' })
    const mainColumn = pane.previousElementSibling as HTMLElement
    expect(within(mainColumn).getByRole('banner')).toBeInTheDocument()
    expect(within(mainColumn).getByText('内容')).toBeVisible()
    expect(screen.queryByRole('button', { name: '关闭侧边栏' })).not.toBeInTheDocument()
  })

  it('persist 默认收起电子化助理', () => {
    expect(useUiStore.getInitialState().assistPaneCollapsed).toBe(true)
    const partialize = useUiStore.persist.getOptions().partialize
    expect(partialize?.(useUiStore.getInitialState())).toEqual(
      expect.objectContaining({ assistPaneCollapsed: true }),
    )
  })
})

