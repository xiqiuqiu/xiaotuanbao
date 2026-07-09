import { DepartureType } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildCreateDeparturePayload,
  buildDefaultDepartureName,
  buildInitialInfoValues,
  computeDayCount,
  computeEndDateFromDefaultDays,
  formatChineseMonthDay,
  isEndDateBeforeStartDate,
} from './departure-wizard-form'

describe('departure-wizard-form', () => {
  it('formats Chinese month-day from ISO date', () => {
    expect(formatChineseMonthDay('2026-08-01')).toBe('8月1日')
    expect(formatChineseMonthDay('2026-12-25')).toBe('12月25日')
  })

  it('builds default departure name', () => {
    expect(buildDefaultDepartureName('喀纳斯阿勒泰10日线', '2026-08-01')).toBe(
      '喀纳斯阿勒泰10日线 8月1日团',
    )
  })

  it('computes end date from default day count', () => {
    expect(computeEndDateFromDefaultDays('2026-08-01', 10)).toBe('2026-08-10')
    expect(addDays('2026-08-01', 9)).toBe('2026-08-10')
  })

  it('computes day count between dates', () => {
    expect(computeDayCount('2026-08-01', '2026-08-10')).toBe(10)
    expect(computeDayCount('2026-08-01', '2026-08-01')).toBe(1)
  })

  it('detects invalid date range', () => {
    expect(isEndDateBeforeStartDate('2026-08-10', '2026-08-01')).toBe(true)
    expect(isEndDateBeforeStartDate('2026-08-01', '2026-08-10')).toBe(false)
  })

  it('builds initial info values with default day count', () => {
    const values = buildInitialInfoValues(
      { mode: 'manual', routeName: '喀纳斯阿勒泰10日线', defaultDayCount: 10 },
      'user-1',
      '2026-08-01',
    )

    expect(values).toMatchObject({
      name: '喀纳斯阿勒泰10日线 8月1日团',
      departureType: DepartureType.COMBINED,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId: 'user-1',
    })
  })

  it('builds create payload from route and info values', () => {
    const payload = buildCreateDeparturePayload(
      { mode: 'manual', routeName: '喀纳斯阿勒泰10日线', defaultDayCount: 10 },
      {
        name: '喀纳斯阿勒泰10日线 8月1日团',
        departureNo: 'DT202608010001',
        departureType: DepartureType.COMBINED,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId: 'user-1',
        notes: '备注',
      },
    )

    expect(payload).toEqual({
      name: '喀纳斯阿勒泰10日线 8月1日团',
      routeName: '喀纳斯阿勒泰10日线',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId: 'user-1',
      departureType: DepartureType.COMBINED,
      notes: '备注',
    })
  })

  it('includes templateId without copy flags in create payload', () => {
    const payload = buildCreateDeparturePayload(
      {
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        templateId: 'template-1',
        copySegments: true,
        copyResources: false,
        copyReferencePrices: true,
      },
      {
        name: '西安-青海湖-茶卡6日游 8月1日团',
        departureNo: 'DT202608010001',
        departureType: DepartureType.COMBINED,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        ownerUserId: 'user-1',
      },
    )

    expect(payload).toEqual({
      name: '西安-青海湖-茶卡6日游 8月1日团',
      routeName: '西安-青海湖-茶卡6日游',
      startDate: '2026-08-01',
      endDate: '2026-08-06',
      ownerUserId: 'user-1',
      departureType: DepartureType.COMBINED,
      notes: undefined,
      templateId: 'template-1',
    })
    expect(payload).not.toHaveProperty('copySegments')
    expect(payload).not.toHaveProperty('copyResources')
    expect(payload).not.toHaveProperty('copyReferencePrices')
  })
})
