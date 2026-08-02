import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('发团详情响应式工作区', () => {
  const pageCss = readFileSync(
    resolve(__dirname, './DepartureDetailPage.module.css'),
    'utf8',
  )
  const executionCss = readFileSync(
    resolve(__dirname, '../components/ExecutionTab.module.css'),
    'utf8',
  )

  it('详情工作区以页面级原生 Tabs 编排，窄屏触控达标', () => {
    expect(pageCss).toMatch(/\.detailWorkspace\s*\{/)
    expect(pageCss).toMatch(/\.detailTabs\s*\{/)
    expect(pageCss).toMatch(
      /@media\s*\(max-width:\s*767px\)[\s\S]*:global\(\.ant-tabs-tab\)\s*\{[^}]*min-height:\s*44px/,
    )
    expect(pageCss).not.toMatch(/\.taskRail\s*\{/)
    expect(pageCss).not.toMatch(/tabBarStyle/)
  })

  it('小于 1024px 时执行工作区取消固定高度，便于纵向堆叠滚动', () => {
    expect(executionCss).toMatch(
      /@media\s*\(max-width:\s*1023px\)[\s\S]*\.workspace\s*\{[^}]*height:\s*auto/,
    )
    expect(executionCss).toMatch(/\.stackLayout\s*\{[^}]*flex-direction:\s*column/)
  })
})
