/**
 * 发团详情顶部卡片方案 B 已落地：不再透传 ?variant=，也不注册独立 sandbox 路由。
 */
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('departure detail header no-prototype guard', () => {
  it('does not register a separate sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain(
      '/prototype/departure-header-card',
    )
  })

  it('strips header variant from departure detail search validation', () => {
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
})
