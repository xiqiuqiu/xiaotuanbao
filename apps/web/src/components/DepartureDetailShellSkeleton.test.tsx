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
  it('加载时保持分组工作区骨架，不回退到旧横向页签', () => {
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
    expect(
      screen.getByRole('complementary', { name: '发团详情功能导航加载中' }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('发团详情紧凑导航加载中'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('业务执行')).toBeInTheDocument()
    expect(screen.getByText('财务处理')).toBeInTheDocument()
  })

  it('按当前权限隐藏不可见的导航分组', () => {
    render(
      <DepartureDetailShellSkeleton
        tabs={DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'operations')}
      />,
    )

    expect(screen.getByText('业务执行')).toBeInTheDocument()
    expect(screen.queryByText('财务处理')).not.toBeInTheDocument()
  })

  it('没有业务执行权限时不渲染空分组', () => {
    render(
      <DepartureDetailShellSkeleton
        tabs={DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'finance')}
      />,
    )

    expect(screen.queryByText('业务执行')).not.toBeInTheDocument()
    expect(screen.getByText('财务处理')).toBeInTheDocument()
  })
})
