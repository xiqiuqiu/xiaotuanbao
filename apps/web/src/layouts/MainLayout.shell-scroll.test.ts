import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 壳层滚动契约：左侧菜单固定在视口内，滚动只发生在右侧内容区。
 * jsdom 不计算 CSS 布局，因此以源码契约断言真实症状（整页随内容撑开滚动）。
 */
const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), './MainLayout.module.css')

function blockFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) {
    throw new Error(`missing CSS block for ${selector}`)
  }
  return match[1]
}

describe('MainLayout 壳层滚动契约', () => {
  const css = readFileSync(cssPath, 'utf8')

  it('壳层锁定视口高度并禁止整页溢出滚动', () => {
    const shell = blockFor(css, '.shell')
    // 必须是 height，不能是 min-height（后者仍会随内容撑开整页滚动）
    expect(shell).toMatch(/(?<!min-)height:\s*100(dvh|vh)/)
    expect(shell).toMatch(/overflow:\s*hidden/)
  })

  it('右侧主列裁剪高度，内容区独立滚动', () => {
    const main = blockFor(css, '.main')
    expect(main).toMatch(/overflow:\s*hidden/)
    expect(main).toMatch(/min-height:\s*0/)

    const content = blockFor(css, '.main :global(.app-content)')
    expect(content).toMatch(/overflow(?:-y)?:\s*(auto|scroll)/)
    expect(content).toMatch(/min-height:\s*0/)
  })

  it('pads the global overlay and uses the mask token so the business page shows through', () => {
    const overlay = blockFor(css, '.agentOverlay')
    expect(overlay).toMatch(/padding:\s*var\(--shell-overlay-pad\)/)
    expect(overlay).toMatch(/background:\s*var\(--shell-mask\)/)
    expect(overlay).not.toMatch(/padding:\s*0/)
  })
})
