import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ExecutionTab resource pane motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './ExecutionTab.module.css'), 'utf8')

  it('fades resource pane on segment swap with opacity only under 100ms', () => {
    expect(css).toMatch(
      /\.resourcePaneEnter\s*\{[^}]*animation:\s*resource-pane-fade 100ms ease both/,
    )
    expect(css).toMatch(/@keyframes resource-pane-fade[\s\S]*opacity:\s*0/)
    expect(css).toMatch(/@keyframes resource-pane-fade[\s\S]*opacity:\s*1/)
  })

  it('disables resource pane fade under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.resourcePaneEnter\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
