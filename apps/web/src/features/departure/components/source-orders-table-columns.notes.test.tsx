import { describe, expect, it, vi } from 'vitest'
import type { UseMutationResult } from '@tanstack/react-query'
import { buildSourceOrdersColumns } from './source-orders-table-columns'

const noop = vi.fn()

function stubMutation(): UseMutationResult<unknown, Error, string, unknown> {
  return {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as unknown as UseMutationResult<unknown, Error, string, unknown>
}

/** 与 SourceOrdersTab Table scroll.x 对齐；备注列无 width 时剩余空间会挤扁表头「备注」。 */
const SOURCE_ORDERS_TABLE_SCROLL_X = 1760

describe('source orders notes column', () => {
  it('备注列有明确宽度，且全部列宽之和不超过表格横向滚动宽度', () => {
    const columns = buildSourceOrdersColumns({
      canEdit: true,
      canGenerate: true,
      deleteMutation: stubMutation(),
      generateMutation: stubMutation(),
      onView: noop,
      onEdit: noop,
      onOpenGuests: noop,
      onViewReceivables: noop,
    })

    const notesColumn = columns.find((column) => column.title === '备注')
    expect(notesColumn).toBeDefined()
    expect(notesColumn?.width).toBeGreaterThanOrEqual(120)

    const totalWidth = columns.reduce((sum, column) => {
      const width = typeof column.width === 'number' ? column.width : 0
      return sum + width
    }, 0)

    expect(totalWidth).toBeLessThanOrEqual(SOURCE_ORDERS_TABLE_SCROLL_X)
  })
})
