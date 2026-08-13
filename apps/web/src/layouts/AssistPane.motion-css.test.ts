import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AssistPane motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './AssistPane.module.css'), 'utf8')
  const mobileIndex = css.indexOf('@media (max-width: 767px)')
  const desktopCss = mobileIndex === -1 ? css : css.slice(0, mobileIndex)
  const mobileCss = mobileIndex === -1 ? '' : css.slice(mobileIndex)

  it('slides the desktop slot with 400ms ease-out-quint on width only', () => {
    expect(css).toContain('var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))')
    expect(css).toContain('0.4s')
    expect(css).not.toContain('0.3s')
    expect(css).not.toContain('transition: all')
    expect(css).not.toContain('ease-in')
    expect(css).not.toContain('scale(')
    expect(desktopCss).toContain('width')
    expect(desktopCss).not.toContain('translateX')
  })

  it('slides the mobile overlay with translateX and snaps under reduced motion', () => {
    expect(mobileCss).toContain('@media (max-width: 767px)')
    expect(mobileCss).toContain('translateX(100%)')
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.slot\[data-motion\]\s*\{[\s\S]*transition:\s*none/,
    )
  })
})
