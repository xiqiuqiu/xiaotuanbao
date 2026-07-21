import { DepartureProgress } from '@xiaotuanbao/shared'

export interface DepartureListSearch {
  operationalWindow?: 'in_progress' | 'next_7_days' | 'current_and_next_7_days'
  departureDataGap?: 'any'
  departureProgress?: DepartureProgress
}

const OPERATIONAL_WINDOWS = new Set([
  'in_progress',
  'next_7_days',
  'current_and_next_7_days',
])
const DEPARTURE_PROGRESS_VALUES = new Set(Object.values(DepartureProgress))

export function parseDepartureListSearch(search: Record<string, unknown>): DepartureListSearch {
  const operationalWindow = typeof search.operationalWindow === 'string'
    && OPERATIONAL_WINDOWS.has(search.operationalWindow)
    ? search.operationalWindow as DepartureListSearch['operationalWindow']
    : undefined
  const departureDataGap = search.departureDataGap === 'any' ? 'any' : undefined
  const departureProgress = typeof search.departureProgress === 'string'
    && DEPARTURE_PROGRESS_VALUES.has(search.departureProgress as DepartureProgress)
    ? search.departureProgress as DepartureProgress
    : undefined

  return {
    ...(operationalWindow ? { operationalWindow } : {}),
    ...(departureDataGap ? { departureDataGap } : {}),
    ...(departureProgress ? { departureProgress } : {}),
  }
}
