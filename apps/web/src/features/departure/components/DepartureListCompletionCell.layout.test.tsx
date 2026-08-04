import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import { DepartureListCompletionCell } from './DepartureListCompletionCell'

afterEach(() => {
  cleanup()
})

const tags: DepartureCompletionTags = {
  sourceOrders: '客源1单',
  segments: '行程3段',
  resources: '资源6项',
  receivables: '应收未提交',
  payables: '应付未提交',
}

describe('DepartureListCompletionCell 布局', () => {
  it('完成情况单元格用紧凑布局，避免四行纵向撑高表格行', () => {
    render(<DepartureListCompletionCell tags={tags} />)
    const root = screen.getByRole('list', { name: '完成情况' })
    expect(root.children).toHaveLength(4)

    // 症状：`.root { flex-direction: column }` + 四项 block 行 → 列表行高被该列独占撑开。
    // 紧凑布局：两列 grid，或可换行的横向排列（视觉行数 ≤ 2）。
    const css = readFileSync(resolve(__dirname, './DepartureListCompletionCell.module.css'), 'utf8')
    const rootBlock = css.match(/\.root\s*\{[^}]*\}/)?.[0] ?? ''
    const isExclusiveColumnStack =
      /flex-direction:\s*column/.test(rootBlock) && !/flex-wrap:\s*wrap/.test(rootBlock)
    const isTwoColGrid =
      /display:\s*grid/.test(rootBlock) &&
      (/grid-template-columns:\s*repeat\(\s*2/.test(rootBlock) ||
        /grid-template-columns:\s*[^;]*\b[\d.]*fr\b[^;]*\b[\d.]*fr\b/.test(rootBlock) ||
        /grid-template-columns:\s*[^;]*\bauto\b[^;]*\bminmax/.test(rootBlock))
    const isWrapRow = /display:\s*flex/.test(rootBlock) && /flex-wrap:\s*wrap/.test(rootBlock)

    expect(
      isTwoColGrid || isWrapRow,
      '完成情况须用两列/换行紧凑布局，不能单列堆四行撑高表格',
    ).toBe(true)
    expect(isExclusiveColumnStack).toBe(false)
  })
})
