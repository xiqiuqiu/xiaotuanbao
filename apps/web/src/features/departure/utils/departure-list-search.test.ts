import { describe, expect, it } from 'vitest'
import {
  encodeDepartureListReturn,
  parseDepartureListSearch,
  resolveDepartureListReturnSearch,
  resolveWorkbenchDepartureFilterBanner,
  serializeDepartureListSearch,
} from './departure-list-search'

describe('parseDepartureListSearch', () => {
  it('keeps stable workbench drill-down filters and rejects unknown values', () => {
    expect(parseDepartureListSearch({
      operationalWindow: 'current_and_next_7_days',
      departureDataGap: 'any',
      departureProgress: 'in_progress',
      settlementReadiness: 'ready',
      accountGenerationGap: 'payable',
      startDateFrom: '2026-07-22',
      startDateTo: '2026-07-22',
      excludeClosed: '1',
    })).toEqual({
      operationalWindow: 'current_and_next_7_days',
      departureDataGap: 'any',
      departureProgress: 'in_progress',
      settlementReadiness: 'ready',
      accountGenerationGap: 'payable',
      startDateFrom: '2026-07-22',
      startDateTo: '2026-07-22',
      excludeClosed: '1',
    })

    expect(parseDepartureListSearch({
      operationalWindow: 'all-time',
      departureDataGap: 'risk',
      departureProgress: 'preparing',
      settlementReadiness: 'pending',
      accountGenerationGap: 'missing',
      startDateFrom: '22/07/2026',
      excludeClosed: 'true',
    })).toEqual({})
  })

  it('parses list UI filters, pagination and view; rejects invalid values', () => {
    expect(parseDepartureListSearch({
      keyword: ' 北疆 ',
      routeName: '伊犁环线',
      departureType: 'independent',
      status: 'editing',
      ownerUserId: 'user-1',
      partnerId: 'partner-1',
      page: '2',
      pageSize: '20',
      view: 'route-ledger',
    })).toEqual({
      keyword: '北疆',
      routeName: '伊犁环线',
      departureType: 'independent',
      status: 'editing',
      ownerUserId: 'user-1',
      partnerId: 'partner-1',
      page: 2,
      pageSize: 20,
      view: 'route-ledger',
    })

    expect(parseDepartureListSearch({
      keyword: '   ',
      departureType: 'charter',
      status: 'draft',
      page: 0,
      pageSize: -1,
      view: 'kanban',
    })).toEqual({})
  })
})

describe('serializeDepartureListSearch', () => {
  it('omits defaults and empty values for a stable shareable URL', () => {
    expect(serializeDepartureListSearch({
      keyword: '',
      routeName: undefined,
      departureType: undefined,
      departureProgress: undefined,
      status: undefined,
      ownerUserId: undefined,
      partnerId: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      page: 1,
      pageSize: 10,
      view: 'departure-list',
      operationalWindow: undefined,
      departureDataGap: undefined,
      settlementReadiness: undefined,
      accountGenerationGap: undefined,
      excludeClosed: undefined,
    })).toEqual({})

    expect(serializeDepartureListSearch({
      keyword: '北疆',
      routeName: '伊犁环线',
      departureType: 'combined',
      departureProgress: 'in_progress',
      status: 'pending_settlement',
      ownerUserId: 'user-1',
      partnerId: 'partner-1',
      startDateFrom: '2026-07-01',
      startDateTo: '2026-07-31',
      page: 3,
      pageSize: 20,
      view: 'route-ledger',
      excludeClosed: '1',
    })).toEqual({
      keyword: '北疆',
      routeName: '伊犁环线',
      departureType: 'combined',
      departureProgress: 'in_progress',
      status: 'pending_settlement',
      ownerUserId: 'user-1',
      partnerId: 'partner-1',
      startDateFrom: '2026-07-01',
      startDateTo: '2026-07-31',
      page: 3,
      pageSize: 20,
      view: 'route-ledger',
      excludeClosed: '1',
    })
  })

  it('round-trips through parseDepartureListSearch', () => {
    const serialized = serializeDepartureListSearch({
      keyword: '测试',
      status: 'settled',
      page: 2,
      pageSize: 50,
      view: 'route-ledger',
      startDateFrom: '2026-07-10',
      operationalWindow: 'in_progress',
    })

    expect(parseDepartureListSearch(serialized)).toEqual(serialized)
  })
})

describe('resolveDepartureListReturnSearch', () => {
  it('restores list search only when detail was opened from the departure list', () => {
    expect(resolveDepartureListReturnSearch({
      listSearch: {
        keyword: '北疆',
        page: 2,
        status: 'editing',
      },
    })).toEqual({
      keyword: '北疆',
      page: 2,
      status: 'editing',
    })

    expect(resolveDepartureListReturnSearch(undefined)).toEqual({})
    expect(resolveDepartureListReturnSearch(null)).toEqual({})
    expect(resolveDepartureListReturnSearch({ listSearch: { status: 'draft' } })).toEqual({})
    expect(resolveDepartureListReturnSearch({ somethingElse: true })).toEqual({})
  })

  it('prefers durable listReturn search param over location state', () => {
    const encoded = encodeDepartureListReturn({
      keyword: '北疆',
      page: 2,
      status: 'editing',
    })

    expect(resolveDepartureListReturnSearch(
      { listSearch: { keyword: '旧筛选' } },
      encoded,
    )).toEqual({
      keyword: '北疆',
      page: 2,
      status: 'editing',
    })

    expect(encodeDepartureListReturn({})).toBe('1')
    expect(resolveDepartureListReturnSearch(undefined, '1')).toEqual({})
  })
})

describe('resolveWorkbenchDepartureFilterBanner', () => {
  it('returns null when URL has no workbench drill-down markers', () => {
    expect(resolveWorkbenchDepartureFilterBanner({})).toBeNull()
  })

  it('does not treat local date filters alone as a workbench handoff', () => {
    expect(resolveWorkbenchDepartureFilterBanner({
      startDateFrom: '2026-07-23',
      startDateTo: '2026-07-26',
    })).toBeNull()
  })

  it('prefers settlement / account-gap / data-gap copy over bare date range', () => {
    expect(resolveWorkbenchDepartureFilterBanner({
      settlementReadiness: 'ready',
      startDateFrom: '2026-07-23',
    })).toEqual({ title: '已筛选：可确认结清发团' })

    expect(resolveWorkbenchDepartureFilterBanner({
      accountGenerationGap: 'any',
      startDateFrom: '2026-07-23',
    })).toEqual({ title: '已筛选：待提交账款发团' })

    expect(resolveWorkbenchDepartureFilterBanner({
      accountGenerationGap: 'payable',
    })).toEqual({ title: '已筛选：待提交应付发团' })

    expect(resolveWorkbenchDepartureFilterBanner({
      departureDataGap: 'any',
      startDateFrom: '2026-07-23',
    })).toEqual({ title: '已筛选：近期资料待补充发团' })
  })

  it('describes workbench date deep links and operational windows', () => {
    expect(resolveWorkbenchDepartureFilterBanner({
      startDateFrom: '2026-07-23',
      startDateTo: '2026-07-26',
      excludeClosed: '1',
    })).toEqual({ title: '已筛选：出团日 2026-07-23 至 2026-07-26' })

    expect(resolveWorkbenchDepartureFilterBanner({
      operationalWindow: 'current_and_next_7_days',
    })).toEqual({ title: '已按工作台范围筛选发团' })
  })
})
