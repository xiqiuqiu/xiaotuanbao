/**
 * 概览原型挂载中：详情 search 透传 ?variant=；不注册独立 sandbox。
 * 非概览 Tab 仍不挂 PrototypeSwitcher（DepartureOverview 被 mock 时）。
 */
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('departure detail overview prototype search', () => {
  it('does not register a separate sandbox route', () => {
    expect(Object.keys(router.routesByPath)).not.toContain('/prototype/departure-overview')
  })

  it('preserves overview variant on departure detail search validation', () => {
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
      variant: 'B',
    })
  })
})
