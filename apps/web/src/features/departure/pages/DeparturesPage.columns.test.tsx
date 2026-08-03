import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureSummary } from '@/types/api'
import { buildDepartureColumns, DEPARTURE_LIST_TABLE_SCROLL_X } from './departure-columns'

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueryClient: () => ({ prefetchQuery: vi.fn() }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <a href="/detail" className={className}>
      {children}
    </a>
  ),
}))

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

  it('含删除的操作列有足够宽度，且全部列宽之和不超过表格横向滚动宽度', () => {
    const columns = buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true)
    const actionColumn = columns.find((column) => 'key' in column && column.key === 'actions')
    expect(actionColumn?.width).toBeGreaterThanOrEqual(160)

    const totalWidth = columns.reduce((sum, column) => {
      const width = typeof column.width === 'number' ? column.width : 0
      return sum + width
    }, 0)

    expect(totalWidth).toBeLessThanOrEqual(DEPARTURE_LIST_TABLE_SCROLL_X)
  })

  it('完成情况：列表只铺待办缺口 warning Tag；全齐显示「无待办」', () => {
    const completionColumn = buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true).find(
      (column) => 'key' in column && column.key === 'completionTags',
    )
    expect(completionColumn?.render).toBeTypeOf('function')

    const incompleteRecord = {
      id: 'departure-1',
      completionTags: {
        sourceOrders: '客源未录入',
        segments: '行程5段',
        resources: '资源2项',
        receivables: '应收未提交',
        payables: '应付已提交',
      },
    } as DepartureSummary

    const { container, rerender } = render(
      <>{completionColumn!.render?.(undefined, incompleteRecord, 0)}</>,
    )
    const tags = Array.from(container.querySelectorAll('.ant-tag'))
    const texts = tags.map((el) => el.textContent)
    expect(texts).toEqual(['客源未录入', '应收未提交'])
    expect(tags.every((el) => /ant-tag-warning/.test(el.className))).toBe(true)
    expect(screen.queryByText('行程5段')).toBeNull()
    expect(screen.queryByText('应付已提交')).toBeNull()

    const completeRecord = {
      id: 'departure-2',
      completionTags: {
        sourceOrders: '客源3单',
        segments: '行程5段',
        resources: '资源2项',
        receivables: '应收已提交',
        payables: '应付已提交',
      },
    } as DepartureSummary
    rerender(<>{completionColumn!.render?.(undefined, completeRecord, 0)}</>)
    expect(screen.getByText('无待办')).toBeTruthy()
    expect(container.querySelectorAll('.ant-tag')).toHaveLength(0)
  })

  it('金额列标题与详情概览口径一致：结算应收 / 成本合计 / 当前毛利', () => {
    const titles = buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true).map((c) =>
      String(c.title),
    )
    expect(titles).toContain('结算应收')
    expect(titles).toContain('成本合计')
    expect(titles).toContain('当前毛利')
    expect(titles).not.toContain('实际应收')
    expect(titles).not.toContain('应付合计')
    expect(titles).not.toContain('预估毛利')
  })

  it('发团视图不单独展示路线名称列；悬停团名可见路线名称', async () => {
    const user = userEvent.setup()
    const columns = buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true)
    const titles = columns.map((c) => String(c.title))
    expect(titles).not.toContain('路线名称')
    expect(titles).toContain('团名')

    const nameColumn = columns.find((c) => c.title === '团名')
    expect(nameColumn?.render).toBeTypeOf('function')

    const record = {
      id: 'departure-1',
      name: '2026年8月1日 南疆5日游',
      routeName: '南疆5日游',
    } as DepartureSummary

    render(<>{nameColumn!.render?.(record.name, record, 0)}</>)
    await user.hover(screen.getByText('2026年8月1日 南疆5日游'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('路线名称：南疆5日游')
  })
})
