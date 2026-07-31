/**
 * #252 护栏：客源管理一览主站不挂载 throwaway 原型沙盒；
 * 详情 search 不透传 list `variant`。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { router } from './index'

const repoRootPackageJson = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../package.json',
)

describe('source orders list prototype removal (#252)', () => {
  it('does not register the source-orders-list prototype sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain('/prototype/source-orders-list')
  })

  it('strips list variant from departure detail search when on sourceOrders tab', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'sourceOrders',
      variant: 'A',
      listReturn: '/departure',
    })

    expect(validated).toEqual({
      tab: 'sourceOrders',
      listReturn: '/departure',
    })
    expect(validated).not.toHaveProperty('variant')
  })

  it('does not expose prototype:source-orders-list in root package scripts', () => {
    const pkg = JSON.parse(readFileSync(repoRootPackageJson, 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['prototype:source-orders-list']).toBeUndefined()
    expect(Object.keys(pkg.scripts ?? {}).some((key) => key.includes('source-orders-list'))).toBe(
      false,
    )
  })
})
