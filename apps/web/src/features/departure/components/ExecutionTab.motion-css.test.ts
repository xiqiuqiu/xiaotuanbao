import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ExecutionTab resource pane motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './ExecutionTab.module.css'), 'utf8')

  it('fades resource pane on segment swap with opacity only under 100ms ease-out-quint', () => {
    expect(css).toContain('.resourcePaneEnter')
    expect(css).toContain('resource-pane-fade 100ms')
    expect(css).toContain('var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))')
    expect(css).toMatch(/@keyframes resource-pane-fade[\s\S]*opacity:\s*0/)
    expect(css).toMatch(/@keyframes resource-pane-fade[\s\S]*opacity:\s*1/)
  })

  it('keeps opacity fade under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.resourcePaneEnter\s*\{[\s\S]*resource-pane-fade 100ms/,
    )
    expect(css).not.toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.resourcePaneEnter\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
