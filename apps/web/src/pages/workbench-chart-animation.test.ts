import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('workbench chart enter animation disabled', () => {
  it('sets animate=false on Column and DualAxes marks', () => {
    const finance = readFileSync(
      resolve(__dirname, './FinanceReceivablesModule.tsx'),
      'utf8',
    )
    const coordinator = readFileSync(
      resolve(__dirname, './CoordinatorTrendModule.tsx'),
      'utf8',
    )
    const scale = readFileSync(
      resolve(__dirname, './OrganizationScaleModule.tsx'),
      'utf8',
    )

    expect(finance).toContain('animate={false}')
    expect(coordinator).toContain('animate: false')
    expect(scale).toContain('animate: false')

    expect(coordinator.match(/animate:\s*false/g)?.length).toBeGreaterThanOrEqual(2)
    expect(scale.match(/animate:\s*false/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
