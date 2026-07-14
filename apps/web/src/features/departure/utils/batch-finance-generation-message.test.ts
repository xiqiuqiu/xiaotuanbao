import { describe, expect, it } from 'vitest'
import type { BatchFinanceGenerationResult } from '@xiaotuanbao/shared'
import {
  formatBatchFinanceGenerationConfirmContent,
  formatBatchFinanceGenerationMessage,
} from './batch-finance-generation-message'

describe('formatBatchFinanceGenerationConfirmContent', () => {
  it('summarizes receivable candidate count', () => {
    expect(formatBatchFinanceGenerationConfirmContent(3, '应收')).toBe(
      '确认后将生成 3 条应收记录',
    )
  })

  it('summarizes payable candidate count and clamps invalid counts', () => {
    expect(formatBatchFinanceGenerationConfirmContent(-2.7, '应付')).toBe(
      '确认后将生成 0 条应付记录',
    )
  })
})

describe('formatBatchFinanceGenerationMessage', () => {
  it('reports empty candidate set', () => {
    const result: BatchFinanceGenerationResult = {
      attempted: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      items: [],
    }
    expect(formatBatchFinanceGenerationMessage(result, '应收')).toBe(
      '没有可生成的未生成应收',
    )
  })

  it('summarizes mixed outcomes and samples failures', () => {
    const result: BatchFinanceGenerationResult = {
      attempted: 3,
      succeeded: 1,
      skipped: 1,
      failed: 1,
      items: [
        { sourceId: '1', sourceLabel: '甲', outcome: 'succeeded' },
        {
          sourceId: '2',
          sourceLabel: '乙',
          outcome: 'skipped',
          reason: '无可生成金额',
        },
        {
          sourceId: '3',
          sourceLabel: '丙',
          outcome: 'failed',
          reason: '网络错误',
        },
      ],
    }
    expect(formatBatchFinanceGenerationMessage(result, '应付')).toBe(
      '应付批量生成完成：成功 1 · 跳过 1 · 失败 1。丙：网络错误',
    )
  })
})
