import { describe, expect, it } from 'vitest'
import { parseDepartureListSearch } from './departure-list-search'

describe('parseDepartureListSearch', () => {
  it('keeps stable workbench drill-down filters and rejects unknown values', () => {
    expect(parseDepartureListSearch({
      operationalWindow: 'current_and_next_7_days',
      departureDataGap: 'any',
      departureProgress: 'in_progress',
      settlementReadiness: 'ready',
    })).toEqual({
      operationalWindow: 'current_and_next_7_days',
      departureDataGap: 'any',
      departureProgress: 'in_progress',
      settlementReadiness: 'ready',
    })

    expect(parseDepartureListSearch({
      operationalWindow: 'all-time',
      departureDataGap: 'risk',
      departureProgress: 'preparing',
      settlementReadiness: 'pending',
    })).toEqual({})
  })
})
