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

  it('详情工作区为顶栏 Tabs 纵向编排，导航可换行且窄屏触控达标', () => {
    expect(pageCss).toMatch(/\.detailWorkspace\s*\{[^}]*flex-direction:\s*column/)
    expect(pageCss).toMatch(/\.detailWorkspace\s*\{[^}]*overflow:\s*visible/)
    expect(navigationCss).toMatch(/\.topTabBar\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(navigationCss).toMatch(/\.topTabList\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(navigationCss).toMatch(/\.topTab\s*\{[^}]*font-size:\s*15px/)
    expect(navigationCss).not.toMatch(/\.topTabDivider\s*\{/)
    expect(navigationCss).toMatch(
      /@media\s*\(max-width:\s*767px\)[\s\S]*\.topTab\s*\{[^}]*min-height:\s*44px/,
    )
    expect(navigationCss).not.toMatch(/\.taskRail\s*\{/)
  })

  it('小于 1024px 时执行工作区取消固定高度，便于纵向堆叠滚动', () => {
    expect(executionCss).toMatch(
      /@media\s*\(max-width:\s*1023px\)[\s\S]*\.workspace\s*\{[^}]*height:\s*auto/,
    )
    expect(executionCss).toMatch(/\.stackLayout\s*\{[^}]*flex-direction:\s*column/)
  })
})
