import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEPARTURE_DETAIL_TABS } from '../catalog'
import { DepartureDetailNavigation } from './DepartureDetailNavigation'

describe('DepartureDetailNavigation', () => {
  afterEach(() => {
    cleanup()
  })

  it('以顶栏 Tabs 展示可见功能，业务与财务仅细分隔、无分组标题，并支持切换', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DepartureDetailNavigation
        activeTab="execution"
        tabs={DEPARTURE_DETAIL_TABS}
        onChange={onChange}
      />,
    )

    const nav = screen.getByRole('navigation', { name: '发团详情功能导航' })
    expect(nav).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText('业务执行')).not.toBeInTheDocument()
    expect(screen.queryByText('财务处理')).not.toBeInTheDocument()

    expect(nav.querySelector('[aria-hidden="true"]')).not.toBeNull()

    const executionTab = screen.getByRole('tab', { name: '执行安排' })
    expect(executionTab).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: '应付管理' }))

    expect(onChange).toHaveBeenCalledWith('payables')
  })

  it('仅渲染可见 Tabs，且权限过滤后的项仍可点击切换', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const visibleTabs = DEPARTURE_DETAIL_TABS.filter(
      (tab) => tab.key !== 'transactions' && tab.key !== 'verifications',
    )

    render(
      <DepartureDetailNavigation
        activeTab="execution"
        tabs={visibleTabs}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('tab', { name: '执行安排' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '应付管理' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '收支流水' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '核销记录' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '客源管理' }))
    expect(onChange).toHaveBeenCalledWith('sourceOrders')
  })

  it('只有一组可见时不渲染业务财务分隔', () => {
    render(
      <DepartureDetailNavigation
        activeTab="overview"
        tabs={DEPARTURE_DETAIL_TABS.filter((tab) => tab.group === 'operations')}
        onChange={vi.fn()}
      />,
    )

    const nav = screen.getByRole('navigation', { name: '发团详情功能导航' })
    expect(within(nav).getByRole('tab', { name: '概览' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '应收管理' })).not.toBeInTheDocument()
    expect(nav.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
