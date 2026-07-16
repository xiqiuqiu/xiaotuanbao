import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DepartureOverviewStatsCards motion CSS', () => {
  const css = readFileSync(
    resolve(__dirname, './DepartureOverviewStatsCards.module.css'),
    'utf8',
  )

  it('gates card enter on .metricCardEnter and staggers that class', () => {
    expect(css).toMatch(/\.metricCardEnter\s*\{[^}]*metric-card-enter/)
    expect(css).toContain('.metricCardEnter')
    expect(css).toContain('.firstRow > :global(.ant-col):nth-child(2) .metricCardEnter')
    expect(css).not.toMatch(/\.metricCard\s*\{[^}]*animation:\s*metric-card-enter/)
  })

  it('reveals progress with transform scaleX, not clip-path', () => {
    expect(css).toContain('transform-origin: left center')
    expect(css).toMatch(/@keyframes progress-load\s*\{[^}]*transform:\s*scaleX\(0\)/)
    expect(css).toMatch(/@keyframes progress-load[\s\S]*transform:\s*scaleX\(1\)/)
    expect(css).not.toContain('clip-path')
  })
})
