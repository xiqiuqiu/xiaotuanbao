import { describe, expect, it } from 'vitest'
import { formatBusinessDateTime } from './formatBusinessDateTime'

describe('formatBusinessDateTime', () => {
  it('始终按中国标准时间显示到分钟', () => {
    expect(formatBusinessDateTime('2026-07-14T00:05:59.000Z')).toBe('2026-07-14 08:05')
  })

  it.each([null, undefined, '', 'not-a-date'])('空值或非法时间 %s 显示占位符', (value) => {
    expect(formatBusinessDateTime(value)).toBe('-')
  })
})
