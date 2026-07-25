import { DepartureProgress } from '@xiaotuanbao/shared'

export interface DepartureListSearch {
  operationalWindow?: 'in_progress' | 'next_7_days' | 'current_and_next_7_days'
  departureDataGap?: 'any'
  settlementReadiness?: 'ready'
  accountGenerationGap?: 'any' | 'payable' | 'receivable'
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
const ACCOUNT_GENERATION_GAPS = new Set(['any', 'payable', 'receivable'])
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
  const accountGenerationGap = typeof search.accountGenerationGap === 'string'
    && ACCOUNT_GENERATION_GAPS.has(search.accountGenerationGap)
    ? search.accountGenerationGap as DepartureListSearch['accountGenerationGap']
    : undefined
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
    ...(accountGenerationGap ? { accountGenerationGap } : {}),
    ...(departureProgress ? { departureProgress } : {}),
    ...(startDateFrom ? { startDateFrom } : {}),
    ...(startDateTo ? { startDateTo } : {}),
    ...(excludeClosed ? { excludeClosed } : {}),
  }
}

/** URL deep-link markers from the workbench (not local list-filter UI state). */
export function hasWorkbenchDepartureListSearch(search: DepartureListSearch): boolean {
  return Boolean(
    search.operationalWindow
    || search.departureDataGap
    || search.settlementReadiness
    || search.accountGenerationGap
    || search.excludeClosed
    || search.startDateFrom
    || search.startDateTo,
  )
}

/**
 * Banner copy for workbench drill-down. Driven by URL search only so local
 * date/status filters on /departure do not look like a workbench handoff.
 */
export function resolveWorkbenchDepartureFilterBanner(
  search: DepartureListSearch,
): { title: string } | null {
  if (!hasWorkbenchDepartureListSearch(search)) {
    return null
  }

  if (search.settlementReadiness) {
    return { title: '已筛选：可确认结清发团' }
  }
  if (search.accountGenerationGap === 'payable') {
    return { title: '已筛选：待生成应付发团' }
  }
  if (search.accountGenerationGap === 'receivable') {
    return { title: '已筛选：待生成应收发团' }
  }
  if (search.accountGenerationGap === 'any') {
    return { title: '已筛选：待生成账款发团' }
  }
  if (search.departureDataGap) {
    return { title: '已筛选：近期资料待补充发团' }
  }
  if (search.startDateFrom || search.startDateTo) {
    return {
      title: `已筛选：出团日 ${search.startDateFrom ?? '…'} 至 ${search.startDateTo ?? '…'}`,
    }
  }
  return { title: '已按工作台范围筛选发团' }
}
