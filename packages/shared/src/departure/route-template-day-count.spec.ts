import {
  ROUTE_TEMPLATE_DAY_COUNT_MISMATCH,
  assertRouteTemplateMatchesTourPeriod,
  formatRouteTemplateDayCountMismatch,
} from './route-template-day-count'

describe('route-template-day-count', () => {
  it('accepts a route template whose default days equal the tour period', () => {
    expect(() =>
      assertRouteTemplateMatchesTourPeriod({
        templateDayCount: 6,
        tourDayCount: 6,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    ).not.toThrow()
  })

  it('rejects when the route template has more days than the tour period', () => {
    expect(() =>
      assertRouteTemplateMatchesTourPeriod({
        templateDayCount: 10,
        tourDayCount: 6,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    ).toThrow(
      expect.objectContaining({
        code: ROUTE_TEMPLATE_DAY_COUNT_MISMATCH,
        templateDayCount: 10,
        tourDayCount: 6,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    )
  })

  it('rejects when the route template has fewer days than the tour period', () => {
    expect(() =>
      assertRouteTemplateMatchesTourPeriod({
        templateDayCount: 6,
        tourDayCount: 10,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      }),
    ).toThrow(
      expect.objectContaining({
        code: ROUTE_TEMPLATE_DAY_COUNT_MISMATCH,
        templateDayCount: 6,
        tourDayCount: 10,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
      }),
    )
  })

  it('formats a reason that names both day counts and does not rewrite the end date', () => {
    expect(
      formatRouteTemplateDayCountMismatch({
        code: ROUTE_TEMPLATE_DAY_COUNT_MISMATCH,
        templateDayCount: 10,
        tourDayCount: 6,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    ).toBe(
      '常用路线为 10 天，与所选团期 6 天（2026-08-01～2026-08-06）不一致。请调整常用路线或团期后再创建，系统不会自动改结束日。',
    )
  })
})
