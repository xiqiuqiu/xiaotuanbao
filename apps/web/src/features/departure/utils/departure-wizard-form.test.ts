import { DepartureType } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  applyDraftSnapshotToRoute,
  applySelectedRouteTemplate,
  buildCreateDeparturePayload,
  buildDefaultDepartureName,
  buildDepartureCreationDraftSnapshot,
  buildRouteSummary,
  canPersistDepartureCreationDraft,
  buildInitialInfoValues,
  createInitialRouteStepValues,
  hasUsableRouteSource,
  computeDayCount,
  computeEndDateFromDefaultDays,
  formatChineseMonthDay,
  isEndDateBeforeStartDate,
  resolveEndDateAfterStartChange,
  resolveEndDateAfterTemplateSelect,
  switchRouteSourceToManual,
} from './departure-wizard-form'

describe('departure-wizard-form', () => {
  it('formats Chinese month-day from ISO date', () => {
    expect(formatChineseMonthDay('2026-08-01')).toBe('8月1日')
    expect(formatChineseMonthDay('2026-12-25')).toBe('12月25日')
  })

  it('builds default departure name without date when startDate omitted', () => {
    expect(buildDefaultDepartureName('南疆6日游')).toBe('南疆6日游')
    expect(buildDefaultDepartureName('  南疆6日游  ')).toBe('南疆6日游')
  })

  it('builds default departure name with date prepended when startDate provided', () => {
    expect(buildDefaultDepartureName('喀纳斯阿勒泰10日线', '2026-08-01')).toBe(
      '2026年8月1日 喀纳斯阿勒泰10日线',
    )
    expect(buildDefaultDepartureName('南疆6日游', '2026-07-22')).toBe('2026年7月22日 南疆6日游')
    expect(buildDefaultDepartureName('喀纳斯5日', '2026-07-30')).toBe('2026年7月30日 喀纳斯5日')
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

  it('builds initial info values with date-prefixed name when startDate provided', () => {
    const values = buildInitialInfoValues(
      { mode: 'manual', routeName: '喀纳斯阿勒泰10日线', defaultDayCount: 10 },
      'user-1',
      '2026-08-01',
    )

    expect(values).toMatchObject({
      name: '2026年8月1日 喀纳斯阿勒泰10日线',
      departureType: DepartureType.COMBINED,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId: 'user-1',
    })
  })

  it('defaults a blank form to filling the route name by hand', () => {
    expect(createInitialRouteStepValues()).toEqual({ mode: 'manual', routeName: '' })
    expect(hasUsableRouteSource(createInitialRouteStepValues())).toBe(false)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot(createInitialRouteStepValues(), {}),
      ),
    ).toBe(false)
  })

  it('allows creating from a filled manual route name without a templateId', () => {
    expect(
      hasUsableRouteSource({
        mode: 'manual',
        routeName: '喀纳斯阿勒泰10日线',
      }),
    ).toBe(true)
    expect(
      hasUsableRouteSource({
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
      }),
    ).toBe(false)
    expect(
      hasUsableRouteSource({
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
        templateId: 'template-1',
      }),
    ).toBe(true)
  })

  it('writes template draft fields on select and clears them when switching back to manual', () => {
    const selected = applySelectedRouteTemplate(
      { mode: 'manual', routeName: '临时线' },
      {
        id: 'template-1',
        name: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        segmentCount: 2,
        resourceCount: 5,
      },
    )

    expect(selected).toMatchObject({
      mode: 'template',
      templateId: 'template-1',
      routeName: '西安-青海湖-茶卡6日游',
      defaultDayCount: 6,
      previewSegmentCount: 2,
      previewResourceCount: 5,
    })
    expect(buildRouteSummary(selected)).toBe('将复制 2 段行程、5 项资源草稿')

    const manual = switchRouteSourceToManual(selected)
    expect(manual).toMatchObject({
      mode: 'manual',
      routeName: '西安-青海湖-茶卡6日游',
    })
    expect(manual.templateId).toBeUndefined()
    expect(manual.defaultDayCount).toBeUndefined()
    expect(manual.previewSegmentCount).toBeUndefined()
    expect(manual.previewResourceCount).toBeUndefined()
    expect(buildRouteSummary(manual)).toBe('填写路线名称，不带出执行安排')
  })

  it('backfills end date from template days only when it is empty or still equal to start date', () => {
    expect(resolveEndDateAfterTemplateSelect('2026-08-01', undefined, 6)).toBe('2026-08-06')
    expect(resolveEndDateAfterTemplateSelect('2026-08-01', '2026-08-01', 6)).toBe('2026-08-06')
    expect(resolveEndDateAfterTemplateSelect('2026-08-01', '2026-08-10', 6)).toBe('2026-08-10')
  })

  it('recomputes a generated end date when start date changes, but keeps a user-edited end date', () => {
    expect(resolveEndDateAfterStartChange('2026-08-01', '2026-08-10', '2026-08-06', 6)).toBe(
      '2026-08-15',
    )
    expect(resolveEndDateAfterStartChange('2026-08-01', '2026-08-10', '2026-08-12', 6)).toBe(
      '2026-08-12',
    )
    expect(resolveEndDateAfterStartChange('2026-08-01', '2026-08-10', '2026-08-01', undefined)).toBe(
      '2026-08-10',
    )
  })

  it('builds create payload from route and info values including crew fields', () => {
    const payload = buildCreateDeparturePayload(
      { mode: 'manual', routeName: '喀纳斯阿勒泰10日线', defaultDayCount: 10 },
      {
        name: '2026年8月1日 喀纳斯阿勒泰10日线',
        departureNo: 'DT202608010001',
        departureType: DepartureType.COMBINED,
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        ownerUserId: 'user-1',
        notes: '备注',
        driverSupplierId: 'driver-1',
        guideSupplierId: 'guide-1',
        vehiclePlate: '新A·20601',
        contactPhone: '13800138000',
      },
    )

    expect(payload).toEqual({
      name: '2026年8月1日 喀纳斯阿勒泰10日线',
      routeName: '喀纳斯阿勒泰10日线',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      ownerUserId: 'user-1',
      departureType: DepartureType.COMBINED,
      notes: '备注',
      driverSupplierId: 'driver-1',
      guideSupplierId: 'guide-1',
      vehiclePlate: '新A·20601',
      contactPhone: '13800138000',
    })
  })

  it('includes templateId without copy flags in create payload', () => {
    const payload = buildCreateDeparturePayload(
      {
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        templateId: 'template-1',
      },
      {
        name: '2026年8月1日 西安-青海湖-茶卡6日游',
        departureNo: 'DT202608010001',
        departureType: DepartureType.COMBINED,
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        ownerUserId: 'user-1',
      },
    )

    expect(payload).toEqual({
      name: '2026年8月1日 西安-青海湖-茶卡6日游',
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

  it('persists and restores template defaultDayCount on the draft snapshot', () => {
    const snapshot = buildDepartureCreationDraftSnapshot(
      {
        mode: 'template',
        routeName: '西安-青海湖-茶卡6日游',
        defaultDayCount: 6,
        templateId: 'template-1',
      },
      {
        name: '2026年8月1日 西安-青海湖-茶卡6日游',
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        ownerUserId: 'user-1',
      },
    )

    expect(snapshot.defaultDayCount).toBe(6)
    expect(applyDraftSnapshotToRoute(snapshot)).toMatchObject({
      mode: 'template',
      templateId: 'template-1',
      defaultDayCount: 6,
      startDate: '2026-08-01',
    })
  })

  it('does not persist empty template or copy drafts that the API would reject', () => {
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot({ mode: 'template', routeName: '' }, {}),
      ),
    ).toBe(false)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot(
          { mode: 'template', routeName: '西安线', templateId: 'template-1' },
          {},
        ),
      ),
    ).toBe(true)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot({ mode: 'copy', routeName: '' }, {}),
      ),
    ).toBe(false)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot(
          { mode: 'copy', routeName: '旧团', copyFromDepartureId: 'dep-1' },
          {},
        ),
      ),
    ).toBe(true)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot({ mode: 'manual', routeName: '' }, { startDate: '2026-08-01' }),
      ),
    ).toBe(false)
    expect(
      canPersistDepartureCreationDraft(
        buildDepartureCreationDraftSnapshot({ mode: 'manual', routeName: '喀纳斯线' }, {}),
      ),
    ).toBe(true)
  })
})
