import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 工作台自定义 hover 仅在精细指针下生效；focus-visible outline 始终可用。
 * （050 — gate-workbench-hover-fine-pointer）
 */
describe('工作台 hover 精细指针门控与 focus outline', () => {
  const homeCss = readFileSync(resolve(__dirname, './HomePage.module.css'), 'utf8')

  it('hover 规则包在 fine-pointer media 内', () => {
    expect(homeCss).toContain('@media (hover: hover) and (pointer: fine)')
    const hoverMedia = homeCss.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/,
    )
    expect(hoverMedia?.[1]).toContain('.queueItem:hover')
    expect(hoverMedia?.[1]).toContain('.metricButton:not(:disabled):hover')
    expect(hoverMedia?.[1]).toContain('.agingShareRow:hover')
    expect(hoverMedia?.[1]).toContain('.trendDayButton:hover')
  })

  it('focus-visible outline 在 media 外仍可用', () => {
    expect(homeCss).toMatch(
      /\.metricButton:not\(:disabled\):focus-visible[\s\S]*?outline:\s*2px\s+solid[\s\S]*?outline-offset:\s*2px/,
    )
    expect(homeCss).toMatch(
      /\.agingShareRow:focus-visible[\s\S]*?outline:\s*2px\s+solid[\s\S]*?outline-offset:\s*2px/,
    )
    expect(homeCss).toMatch(
      /\.trendDayButton:focus-visible[\s\S]*?outline:\s*2px\s+solid[\s\S]*?outline-offset:\s*2px/,
    )
  })

  it('指标卡 hover 仍使用向外 outline（精细指针下）', () => {
    expect(homeCss).toMatch(
      /\.metricButton:not\(:disabled\):hover[\s\S]*?outline:\s*2px\s+solid[\s\S]*?outline-offset:\s*2px/,
    )
  })
})
