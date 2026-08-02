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
  it('加载时保持 Tabs 工作区骨架，无左侧任务轨与分组标题', () => {
    const visibleTabs = DEPARTURE_DETAIL_TABS.filter(
      (tab) => tab.key !== 'transactions' && tab.key !== 'verifications',
    )

    render(
      <DepartureDetailShellSkeleton
        activeTab="overview"
        tabs={visibleTabs}
      />,
    )

    expect(screen.getByRole('status', { name: '发团详情加载中' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '发团详情内容加载中' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByText('业务执行')).not.toBeInTheDocument()
    expect(screen.queryByText('财务处理')).not.toBeInTheDocument()
  })

  it('按当前权限只渲染可见 Tab 占位', () => {
    const operations = DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'operations')
    const { container } = render(
      <DepartureDetailShellSkeleton tabs={operations} />,
    )

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(container.querySelectorAll('.ant-skeleton-button')).toHaveLength(operations.length)
  })

  it('没有业务 Tabs 时仍渲染财务 Tab 占位', () => {
    const finance = DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'finance')
    const { container } = render(
      <DepartureDetailShellSkeleton tabs={finance} />,
    )

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(container.querySelectorAll('.ant-skeleton-button')).toHaveLength(finance.length)
  })
})
