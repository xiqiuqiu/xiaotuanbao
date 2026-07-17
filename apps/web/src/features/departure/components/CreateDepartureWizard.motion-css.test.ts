import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CreateDepartureWizard step enter motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './CreateDepartureWizard.module.css'), 'utf8')

  it('fades step content with opacity only under 120ms', () => {
    expect(css).toMatch(/\.stepEnter\s*\{[^}]*animation:\s*wizard-step-fade 120ms ease both/)
    expect(css).toMatch(/@keyframes wizard-step-fade\s*\{[^}]*opacity:\s*0/)
    expect(css).not.toContain('translate')
    expect(css).not.toContain('scale')
  })

  it('disables step enter fade under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.stepEnter\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
