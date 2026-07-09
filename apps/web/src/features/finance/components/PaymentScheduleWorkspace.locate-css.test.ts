import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CSS Modules hashes local class names. Ant Design's `.ant-table-cell-fix`
 * must stay :global, or the locate flash animates fixed 操作 cells and briefly
 * reveals content underneath them when the table is horizontally scrolled.
 */
describe('PaymentScheduleWorkspace locate flash CSS', () => {
  it('scopes Ant fixed-cell selectors with :global', () => {
    const css = readFileSync(
      resolve(__dirname, './PaymentScheduleWorkspace.module.css'),
      'utf8',
    )

    expect(css).toContain('.locateFlash > td:not(:global(.ant-table-cell-fix))')
    expect(css).toContain('.locateFlash > td:global(.ant-table-cell-fix)')
    expect(css).not.toMatch(/td:not\(\.ant-table-cell-fix\)/)
    expect(css).not.toMatch(/td\.ant-table-cell-fix\s*\{/)
  })
})
