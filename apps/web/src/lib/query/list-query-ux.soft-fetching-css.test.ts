import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('list-query-ux softFetching CSS', () => {
  const css = readFileSync(resolve(__dirname, './list-query-ux.module.css'), 'utf8')

  it('keeps softFetching opacity under prefers-reduced-motion', () => {
    const reduced = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/,
    )
    expect(reduced?.[1]).toBeTruthy()
    expect(reduced?.[1]).toContain('opacity: 0.65')
    expect(reduced?.[1]).toContain('transition: none')
    expect(reduced?.[1]).not.toMatch(/\.softFetching\s*\{[^}]*opacity:\s*1/)
  })
})
