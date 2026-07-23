import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 回归：财务「待核销流水 / 待生成账款」须与图表模块同构 —
 * lazy + LazyChartModule（Suspense Skeleton），避免 chunk 到达前空白直出。
 */
describe('HomePage finance funds module lazy skeleton', () => {
  const home = readFileSync(resolve(__dirname, './HomePage.tsx'), 'utf8')

  it('lazy-loads FinanceFundsModule instead of eager import', () => {
    expect(home).not.toMatch(
      /import\s*\{\s*FinanceFundsModule\s*\}\s*from\s*['"]\.\/FinanceFundsModule['"]/,
    )
    expect(home).toMatch(
      /const\s+FinanceFundsModule\s*=\s*lazy\s*\(\s*\(\)\s*=>\s*[\s\S]*?FinanceFundsModule/,
    )
  })

  it('wraps FinanceFundsModule in LazyChartModule for Suspense skeleton', () => {
    expect(home).toMatch(
      /<LazyChartModule>\s*<FinanceFundsModule\s+module=\{fundsModule\}\s*\/>\s*<\/LazyChartModule>/,
    )
  })
})
