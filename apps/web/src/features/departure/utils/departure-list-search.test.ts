import { describe, expect, it } from 'vitest'
import {
  parseDepartureListSearch,
  resolveWorkbenchDepartureFilterBanner,
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
})

describe('resolveWorkbenchDepartureFilterBanner', () => {
  it('returns null when URL has no workbench drill-down markers', () => {
    expect(resolveWorkbenchDepartureFilterBanner({})).toBeNull()
  })

  it('prefers settlement / account-gap / data-gap copy over bare date range', () => {
    expect(resolveWorkbenchDepartureFilterBanner({
      settlementReadiness: 'ready',
      startDateFrom: '2026-07-23',
    })).toEqual({ title: '已筛选：可确认结清发团' })

    expect(resolveWorkbenchDepartureFilterBanner({
      accountGenerationGap: 'any',
      startDateFrom: '2026-07-23',
    })).toEqual({ title: '已筛选：待生成账款发团' })

    expect(resolveWorkbenchDepartureFilterBanner({
      accountGenerationGap: 'payable',
    })).toEqual({ title: '已筛选：待生成应付发团' })

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
