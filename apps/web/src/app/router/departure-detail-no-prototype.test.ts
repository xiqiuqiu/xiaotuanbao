/**
 * #243 护栏：发团详情主站不挂载布局原型沙盒；详情 search 不透传 layout variant。
 */
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('departure detail prototype removal (#243)', () => {
  it('does not register the layout prototype sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain(
      '/prototype/departure-detail-layout',
    )
  })

  it('strips layout variant from departure detail search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'execution',
      segmentId: 'seg-1',
      variant: 'A',
      listReturn: '/departure',
    })

    expect(validated).toEqual({
      tab: 'execution',
      segmentId: 'seg-1',
      listReturn: '/departure',
    })
    expect(validated).not.toHaveProperty('variant')
  })
})
