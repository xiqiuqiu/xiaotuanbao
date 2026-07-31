import { describe, expect, it } from 'vitest'
import { isCompletionTagIncomplete } from './departure-transition'

describe('isCompletionTagIncomplete', () => {
  it('marks 应收/应付未提交 as incomplete (warning color gate)', () => {
    expect(isCompletionTagIncomplete('应收未提交')).toBe(true)
    expect(isCompletionTagIncomplete('应付未提交')).toBe(true)
  })

  it('does not mark 应收/应付已提交 as incomplete', () => {
    expect(isCompletionTagIncomplete('应收已提交')).toBe(false)
    expect(isCompletionTagIncomplete('应付已提交')).toBe(false)
  })

  it('keeps other incomplete markers', () => {
    expect(isCompletionTagIncomplete('客源未录入')).toBe(true)
    expect(isCompletionTagIncomplete('资源未安排')).toBe(true)
  })
})
