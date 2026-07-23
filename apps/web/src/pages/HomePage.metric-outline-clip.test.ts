import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 工作台自定义 hover 仅在精细指针下生效；focus-visible outline 始终可用。
 * （050 — gate-workbench-hover-fine-pointer）
 *
 * 指标卡 hover 使用 outline + outline-offset（向外扩展）。
 * MainLayout 在 .app-content 上 overflow:auto 时，裁切发生在 padding edge：
 * 若 gutter 用 margin（在 clip 外），响应式贴边时 halo 上下/左右会被截断。
 * jsdom 不算布局，故以源码契约锁定「gutter 必须在 clip 内」。
 */
function blockFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) {
    throw new Error(`missing CSS block for ${selector}`)
  }
  return match[1]
}

describe('工作台 hover 精细指针门控与 focus outline', () => {
  const homeCss = readFileSync(resolve(__dirname, './HomePage.module.css'), 'utf8')

  it('hover 规则包在 fine-pointer media 内', () => {
    expect(homeCss).toContain('@media (hover: hover) and (pointer: fine)')
    const hoverMedia = homeCss.match(
      /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/,
    )
    expect(hoverMedia?.[1]).toContain('.settlementQueueItem:hover')
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

describe('工作台指标卡 hover outline 不被壳层滚动裁切', () => {
  const layoutCss = readFileSync(
    resolve(__dirname, '../layouts/MainLayout.module.css'),
    'utf8',
  )
  const globalCss = readFileSync(resolve(__dirname, '../styles/global.css'), 'utf8')

  it('内容区独立滚动时，gutter 使用 padding 而非 margin', () => {
    const content = blockFor(layoutCss, '.main :global(.app-content)')
    expect(content).toMatch(/overflow(?:-y)?:\s*(auto|scroll)/)

    const appContent = blockFor(globalCss, '.app-content')
    expect(appContent).toMatch(/padding:\s*16px/)
    expect(appContent).not.toMatch(/margin:\s*16px/)
    // explicit zero margin — must not put gutter outside clip
    expect(appContent).toMatch(/margin:\s*0/)

    expect(globalCss).toMatch(
      /@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.app-content\s*\{[^}]*padding:\s*12px/,
    )
  })
})
