/**
 * 执行安排密度原型已收口为正式互斥布局：详情 search 不透传 layout variant。
 */
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('departure detail prototype removal (execution-density folded)', () => {
  it('does not register a separate sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain(
      '/prototype/execution-density',
    )
  })

  it('strips layout variant from departure detail search validation', () => {
    const validated = router.routesByPath['/departure/$departureId']!.options.validateSearch!({
      tab: 'execution',
      segmentId: 'seg-1',
      variant: 'C',
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
