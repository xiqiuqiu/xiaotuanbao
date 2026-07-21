import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const EASE_OUT =
  'var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))'

const motionCssFiles = [
  '../styles/global.css',
  '../pages/LoginPage.module.css',
  '../pages/HomePage.module.css',
  '../features/departure/components/DepartureOverviewStatsCards.module.css',
  '../features/finance/components/PaymentScheduleWorkspace.module.css',
  '../features/departure/components/ExecutionTab.module.css',
] as const

describe('motion cohesion CSS', () => {
  it('uses ant motionEaseOutQuint CSS var (with fallback) for custom ease-out', () => {
    for (const relative of motionCssFiles) {
      const css = readFileSync(resolve(__dirname, relative), 'utf8')
      const bare = css.match(/cubic-bezier\(0\.23, 1, 0\.32, 1\)/g) ?? []
      for (const _ of bare) {
        expect(css).toContain(EASE_OUT)
      }
      // Every bare bezier must appear only inside the var() fallback.
      const withoutVarFallback = css.replaceAll(EASE_OUT, '')
      expect(withoutVarFallback).not.toContain('cubic-bezier(0.23, 1, 0.32, 1)')
    }
  })

  it('unifies press feedback to 100ms scale(0.97)', () => {
    const globalCss = readFileSync(resolve(__dirname, '../styles/global.css'), 'utf8')
    const executionCss = readFileSync(
      resolve(__dirname, '../features/departure/components/ExecutionTab.module.css'),
      'utf8',
    )
    const loginCss = readFileSync(resolve(__dirname, '../pages/LoginPage.module.css'), 'utf8')

    expect(globalCss).toMatch(
      /\.ant-btn\s*\{[^}]*transition:\s*transform 100ms var\(--ant-motion-ease-out-quint/,
    )
    expect(globalCss).toContain('transform: scale(0.97)')

    expect(executionCss).toContain('transform 100ms var(--ant-motion-ease-out-quint')
    expect(executionCss).toContain('transform: scale(0.97)')
    expect(executionCss).not.toContain('scale(0.98)')

    expect(loginCss).toMatch(
      /\.submit\s*\{[\s\S]*?transition:\s*transform 100ms var\(--ant-motion-ease-out-quint/,
    )
    expect(loginCss).toMatch(/\.submit\s*\{[\s\S]*?background-color 100ms ease/)
    expect(loginCss).not.toMatch(
      /\.submit\s*\{[\s\S]*?background-color [^;]*cubic-bezier\(0\.23, 1, 0\.32, 1\)/,
    )
  })
})
