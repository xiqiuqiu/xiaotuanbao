import { DepartureProgress } from '@xiaotuanbao/shared'

export interface DepartureListSearch {
  operationalWindow?: 'in_progress' | 'next_7_days' | 'current_and_next_7_days'
  departureDataGap?: 'any'
  settlementReadiness?: 'ready'
  departureProgress?: DepartureProgress
  startDateFrom?: string
  startDateTo?: string
  excludeClosed?: '1'
}

const OPERATIONAL_WINDOWS = new Set([
  'in_progress',
  'next_7_days',
  'current_and_next_7_days',
])
const DEPARTURE_PROGRESS_VALUES = new Set(Object.values(DepartureProgress))
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parseDateOnly(value: unknown): string | undefined {
  return typeof value === 'string' && DATE_ONLY.test(value) ? value : undefined
}

export function parseDepartureListSearch(search: Record<string, unknown>): DepartureListSearch {
  const operationalWindow = typeof search.operationalWindow === 'string'
    && OPERATIONAL_WINDOWS.has(search.operationalWindow)
    ? search.operationalWindow as DepartureListSearch['operationalWindow']
    : undefined
  const departureDataGap = search.departureDataGap === 'any' ? 'any' : undefined
  const settlementReadiness = search.settlementReadiness === 'ready' ? 'ready' : undefined
  const departureProgress = typeof search.departureProgress === 'string'
    && DEPARTURE_PROGRESS_VALUES.has(search.departureProgress as DepartureProgress)
    ? search.departureProgress as DepartureProgress
    : undefined
  const startDateFrom = parseDateOnly(search.startDateFrom)
  const startDateTo = parseDateOnly(search.startDateTo)
  const excludeClosed = search.excludeClosed === '1' ? '1' : undefined

  return {
    ...(operationalWindow ? { operationalWindow } : {}),
    ...(departureDataGap ? { departureDataGap } : {}),
    ...(settlementReadiness ? { settlementReadiness } : {}),
    ...(departureProgress ? { departureProgress } : {}),
    ...(startDateFrom ? { startDateFrom } : {}),
    ...(startDateTo ? { startDateTo } : {}),
    ...(excludeClosed ? { excludeClosed } : {}),
  }
}
