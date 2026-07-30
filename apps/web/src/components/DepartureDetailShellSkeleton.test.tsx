import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEPARTURE_DETAIL_TABS } from '@/features/departure/catalog'
import { DepartureDetailShellSkeleton } from './DepartureDetailShellSkeleton'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

afterEach(cleanup)

describe('DepartureDetailShellSkeleton', () => {
  it('加载时保持顶栏 Tabs 工作区骨架，无左侧任务轨与分组标题', () => {
    const visibleTabs = DEPARTURE_DETAIL_TABS.filter(
      (tab) => tab.key !== 'transactions' && tab.key !== 'verifications',
    )

    render(
      <DepartureDetailShellSkeleton
        activeTab="overview"
        tabs={visibleTabs}
      />,
    )

    const nav = screen.getByRole('navigation', { name: '发团详情功能导航加载中' })
    expect(screen.getByRole('status', { name: '发团详情加载中' })).toBeInTheDocument()
    expect(nav).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByText('业务执行')).not.toBeInTheDocument()
    expect(screen.queryByText('财务处理')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(nav.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('按当前权限隐藏不可见的财务导航区', () => {
    render(
      <DepartureDetailShellSkeleton
        tabs={DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'operations')}
      />,
    )

    const nav = screen.getByRole('navigation', { name: '发团详情功能导航加载中' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(nav.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('没有业务 Tabs 时不渲染空业务分隔', () => {
    render(
      <DepartureDetailShellSkeleton
        tabs={DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'finance')}
      />,
    )

    const nav = screen.getByRole('navigation', { name: '发团详情功能导航加载中' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(nav.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
