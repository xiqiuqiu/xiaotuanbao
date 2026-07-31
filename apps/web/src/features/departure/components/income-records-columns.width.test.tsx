import { describe, expect, it, vi } from 'vitest'
import {
  buildIncomeRecordsColumns,
  INCOME_RECORDS_TABLE_SCROLL_X,
} from './income-records-columns'

/**
 * 项目名称无 width 时，容器宽于 scroll.x 的剩余空间会全灌进该列，
 * 短项目名后出现大片空白（与客源「备注」列同类问题）。
 */
describe('income records column widths', () => {
  it('每列都有明确宽度，且列宽之和不超过 Table scroll.x', () => {
    const columns = buildIncomeRecordsColumns({
      mutationLocked: false,
      markPending: false,
      onEdit: vi.fn(),
      onMarkCollected: vi.fn(),
      onMarkPaid: vi.fn(),
      onDelete: vi.fn(),
    })

    const projectName = columns.find((column) => column.dataIndex === 'projectName')
    expect(projectName).toBeDefined()
    expect(typeof projectName?.width).toBe('number')
    expect(projectName?.width).toBeGreaterThanOrEqual(120)

    for (const column of columns) {
      expect(typeof column.width, `column ${String(column.title)} missing width`).toBe(
        'number',
      )
    }

    const totalWidth = columns.reduce((sum, column) => {
      const width = typeof column.width === 'number' ? column.width : 0
      return sum + width
    }, 0)

    expect(totalWidth).toBeLessThanOrEqual(INCOME_RECORDS_TABLE_SCROLL_X)
  })
})
