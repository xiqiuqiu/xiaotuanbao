/**
 * 发团详情原型已收口：详情 search 不透传 ?variant=；不注册独立 sandbox。
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

describe('departure detail overview prototype removal', () => {
  it('does not register a separate sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain('/prototype/departure-overview')
  })

  it('strips overview variant from departure detail search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'overview',
      segmentId: 'seg-1',
      variant: 'B',
      listReturn: '/departure',
    })

    expect(validated).toEqual({
      tab: 'overview',
      segmentId: 'seg-1',
      listReturn: '/departure',
    })
    expect(validated).not.toHaveProperty('variant')
  })

  it('strips execution layer-switch prototype variant from search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'execution',
      segmentId: 'seg-1',
      variant: 'A',
    })

    expect(validated).toEqual({
      tab: 'execution',
      segmentId: 'seg-1',
    })
    expect(validated).not.toHaveProperty('variant')
  })

  it('does not expose prototype:departure-overview or execution-layer-switch scripts', () => {
    const pkg = JSON.parse(readFileSync(repoRootPackageJson, 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['prototype:departure-overview']).toBeUndefined()
    expect(pkg.scripts?.['prototype:execution-layer-switch']).toBeUndefined()
    expect(
      Object.keys(pkg.scripts ?? {}).some((key) => key.includes('departure-overview')),
    ).toBe(false)
    expect(
      Object.keys(pkg.scripts ?? {}).some((key) => key.includes('execution-layer-switch')),
    ).toBe(false)
  })
})
