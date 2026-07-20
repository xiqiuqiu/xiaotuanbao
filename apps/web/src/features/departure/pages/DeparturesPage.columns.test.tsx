import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DepartureSummary } from '@/types/api'
import { buildDepartureColumns } from './departure-columns'

describe('发团列表操作列', () => {
  it('复制按钮是单一交互控件并传出正确发团 ID', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn()
    const actionColumn = buildDepartureColumns(onCopy, true).find(
      (column) => 'key' in column && column.key === 'actions',
    )
    const renderAction = actionColumn?.render
    expect(renderAction).toBeTypeOf('function')

    const record = { id: 'departure-1' } as DepartureSummary
    const { container } = render(<>{renderAction?.(undefined, record, 0)}</>)

    expect(container.querySelector('a button')).toBeNull()
    await user.click(screen.getByRole('button', { name: /复制/ }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(onCopy).toHaveBeenCalledWith('departure-1')
  })

  it('财务（无 departure:write）不显示复制操作列', () => {
    // 复制会 POST /departures/:id/copy（要 departure:write），财务点击必 403；故整列隐藏。
    const actionColumn = buildDepartureColumns(vi.fn(), false).find(
      (column) => 'key' in column && column.key === 'actions',
    )
    expect(actionColumn).toBeUndefined()
  })
})
