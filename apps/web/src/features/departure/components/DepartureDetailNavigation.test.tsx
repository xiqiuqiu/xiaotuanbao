import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEPARTURE_DETAIL_TABS } from '../catalog'
import { DepartureDetailNavigation } from './DepartureDetailNavigation'

describe('DepartureDetailNavigation', () => {
  afterEach(() => {
    cleanup()
  })

  it('按业务执行与财务处理分组展示可见功能，并从侧栏切换', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DepartureDetailNavigation
        activeTab="execution"
        tabs={DEPARTURE_DETAIL_TABS}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('业务执行')).toBeInTheDocument()
    expect(screen.getByText('财务处理')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '执行安排' })).toHaveClass(
      'ant-menu-item-selected',
    )

    await user.click(screen.getByRole('menuitem', { name: '应付管理' }))

    expect(onChange).toHaveBeenCalledWith('payables')
  })

  it('窄屏功能选择器与侧栏共享同一可见项和当前状态', () => {
    const visibleTabs = DEPARTURE_DETAIL_TABS.filter(
      (tab) => tab.key !== 'transactions' && tab.key !== 'verifications',
    )

    render(
      <DepartureDetailNavigation
        activeTab="execution"
        tabs={visibleTabs}
        onChange={vi.fn()}
      />,
    )

    const selector = screen.getByRole('combobox', { name: '切换发团详情功能' })
    expect(selector.closest('.ant-select')).toHaveTextContent('执行安排')
    expect(screen.queryByRole('menuitem', { name: '收支流水' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '核销记录' })).not.toBeInTheDocument()
  })
})
