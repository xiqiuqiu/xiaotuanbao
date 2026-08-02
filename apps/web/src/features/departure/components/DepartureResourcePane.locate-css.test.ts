import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DepartureResourcePane locate flash CSS', () => {
  const css = readFileSync(resolve(__dirname, './DepartureResourcePane.module.css'), 'utf8')

  it('matches finance locate: 480ms ease-out-quint, body cells only', () => {
    expect(css).toContain(
      'animation: departure-resource-locate-flash 480ms',
    )
    expect(css).toContain('var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))')
    expect(css).toContain('.locateFlash > td:not(:global(.ant-table-cell-fix))')
    expect(css).toContain('.locateFlash > td:global(.ant-table-cell-fix)')
    expect(css).not.toMatch(
      /\.locateFlash > td:global\(\.ant-table-cell-fix\)\s*\{[^}]*animation:/,
    )
    expect(css).not.toContain('2.4s')
  })

  it('keeps static highlight under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
