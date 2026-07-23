import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureSummary } from '@/types/api'
import { buildDepartureColumns } from './departure-columns'

afterEach(() => {
  cleanup()
})

function renderActions(record: Partial<DepartureSummary>, canEdit = true) {
  const onCopy = vi.fn()
  const onPurge = vi.fn()
  const actionColumn = buildDepartureColumns({ onCopy, onPurge }, canEdit).find(
    (column) => 'key' in column && column.key === 'actions',
  )
  const renderAction = actionColumn?.render
  expect(renderAction).toBeTypeOf('function')

  const fullRecord = {
    id: 'departure-1',
    departureNo: 'XTB2026070001',
    name: '测试团',
    canPurge: true,
    ...record,
  } as DepartureSummary
  const { container } = render(<>{renderAction?.(undefined, fullRecord, 0)}</>)
  return { onCopy, onPurge, container, fullRecord }
}

describe('发团列表操作列', () => {
  it('复制按钮是单一交互控件并传出正确发团 ID', async () => {
    const user = userEvent.setup()
    const { onCopy, container } = renderActions({ canPurge: false })

    expect(container.querySelector('a button')).toBeNull()
    await user.click(screen.getByRole('button', { name: /复制/ }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(onCopy).toHaveBeenCalledWith('departure-1')
  })

  it('canPurge 时显示删除并在确认后回调', async () => {
    const user = userEvent.setup()
    const { onPurge } = renderActions({ canPurge: true })

    await user.click(screen.getByRole('button', { name: /删除/ }))
    const popover = document.querySelector('.ant-popconfirm')
    expect(popover).toBeTruthy()
    await user.click(within(popover as HTMLElement).getByRole('button', { name: /删\s*除/ }))
    expect(onPurge).toHaveBeenCalledOnce()
    expect(onPurge.mock.calls[0]?.[0]).toMatchObject({ id: 'departure-1' })
  })

  it('不可 purge 时不显示删除', () => {
    renderActions({ canPurge: false })
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull()
  })

  it('财务（无 departure:write）不显示复制/删除操作列', () => {
    // 复制/删除均要 departure:write；财务点击必 403；故整列隐藏。
    const actionColumn = buildDepartureColumns(
      { onCopy: vi.fn(), onPurge: vi.fn() },
      false,
    ).find((column) => 'key' in column && column.key === 'actions')
    expect(actionColumn).toBeUndefined()
  })
})
