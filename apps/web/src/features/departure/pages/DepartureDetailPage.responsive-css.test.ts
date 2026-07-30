import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('发团详情响应式工作区', () => {
  const pageCss = readFileSync(
    resolve(__dirname, './DepartureDetailPage.module.css'),
    'utf8',
  )
  const navigationCss = readFileSync(
    resolve(__dirname, '../components/DepartureDetailNavigation.module.css'),
    'utf8',
  )
  const executionCss = readFileSync(
    resolve(__dirname, '../components/ExecutionTab.module.css'),
    'utf8',
  )

  it('桌面功能导航在长页面中保持可见', () => {
    expect(pageCss).toMatch(/\.detailWorkspace\s*\{[^}]*overflow:\s*visible/)
    expect(navigationCss).toMatch(
      /\.taskRail\s*\{[^}]*position:\s*sticky[^}]*top:\s*16px[^}]*max-height:\s*calc\(100dvh - 96px\)/,
    )
  })

  it('小于 1024px 时切换紧凑导航并堆叠执行工作区', () => {
    expect(navigationCss).toMatch(
      /@media\s*\(max-width:\s*1023px\)[\s\S]*\.taskRail\s*\{[^}]*display:\s*none/,
    )
    expect(pageCss).toMatch(
      /@media\s*\(max-width:\s*1023px\)[\s\S]*\.detailWorkspace\s*\{[^}]*flex-direction:\s*column/,
    )
    expect(executionCss).toMatch(
      /@media\s*\(max-width:\s*1023px\)[\s\S]*\.panes\s*\{[^}]*flex-direction:\s*column/,
    )
  })
})
