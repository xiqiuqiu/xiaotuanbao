import {
  DepartureProgress,
  DepartureStatus,
  DepartureType,
} from '@xiaotuanbao/shared'

export type DepartureManagementView = 'departure-list' | 'route-ledger'

export interface DepartureListSearch {
  keyword?: string
  routeName?: string
  departureType?: DepartureType
  departureProgress?: DepartureProgress
  status?: DepartureStatus
  ownerUserId?: string
  partnerId?: string
  page?: number
  pageSize?: number
  view?: DepartureManagementView
  operationalWindow?: 'in_progress' | 'next_7_days' | 'current_and_next_7_days'
  departureDataGap?: 'any'
  settlementReadiness?: 'ready'
  accountGenerationGap?: 'any' | 'payable' | 'receivable'
  startDateFrom?: string
  startDateTo?: string
  excludeClosed?: '1'
}

/** Router location.state written when opening detail from the departure list. */
export type DepartureListReturnState = {
  listSearch: DepartureListSearch
}

/** TanStack HistoryState is closed; cast at the Link/navigate boundary. */
export function toDepartureListReturnState(
  listSearch: DepartureListSearch,
): DepartureListReturnState {
  return { listSearch }
}

export type DepartureListSerializableState = {
  keyword?: string
  routeName?: string
  departureType?: DepartureType
  departureProgress?: DepartureProgress
  status?: DepartureStatus
  ownerUserId?: string
  partnerId?: string
  startDateFrom?: string
  startDateTo?: string
  page?: number
  pageSize?: number
  view?: DepartureManagementView
  operationalWindow?: DepartureListSearch['operationalWindow']
  departureDataGap?: DepartureListSearch['departureDataGap']
  settlementReadiness?: DepartureListSearch['settlementReadiness']
  accountGenerationGap?: DepartureListSearch['accountGenerationGap']
  excludeClosed?: DepartureListSearch['excludeClosed']
}

const OPERATIONAL_WINDOWS = new Set([
  'in_progress',
  'next_7_days',
  'current_and_next_7_days',
])
const ACCOUNT_GENERATION_GAPS = new Set(['any', 'payable', 'receivable'])
const DEPARTURE_PROGRESS_VALUES = new Set(Object.values(DepartureProgress))
const DEPARTURE_STATUS_VALUES = new Set(Object.values(DepartureStatus))
const DEPARTURE_TYPE_VALUES = new Set(Object.values(DepartureType))
const MANAGEMENT_VIEWS = new Set<DepartureManagementView>([
  'departure-list',
  'route-ledger',
])
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const DEFAULT_VIEW: DepartureManagementView = 'departure-list'

function parseDateOnly(value: unknown): string | undefined {
  return typeof value === 'string' && DATE_ONLY.test(value) ? value : undefined
}

function parseTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

export function parseDepartureListSearch(search: Record<string, unknown>): DepartureListSearch {
  const keyword = parseTrimmedString(search.keyword)
  const routeName = parseTrimmedString(search.routeName)
  const departureType = typeof search.departureType === 'string'
    && DEPARTURE_TYPE_VALUES.has(search.departureType as DepartureType)
    ? search.departureType as DepartureType
    : undefined
  const departureProgress = typeof search.departureProgress === 'string'
    && DEPARTURE_PROGRESS_VALUES.has(search.departureProgress as DepartureProgress)
    ? search.departureProgress as DepartureProgress
    : undefined
  const status = typeof search.status === 'string'
    && DEPARTURE_STATUS_VALUES.has(search.status as DepartureStatus)
    ? search.status as DepartureStatus
    : undefined
  const ownerUserId = parseTrimmedString(search.ownerUserId)
  const partnerId = parseTrimmedString(search.partnerId)
  const page = parsePositiveInt(search.page)
  const pageSize = parsePositiveInt(search.pageSize)
  const view = typeof search.view === 'string'
    && MANAGEMENT_VIEWS.has(search.view as DepartureManagementView)
    ? search.view as DepartureManagementView
    : undefined
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
  const startDateFrom = parseDateOnly(search.startDateFrom)
  const startDateTo = parseDateOnly(search.startDateTo)
  const excludeClosed = search.excludeClosed === '1' ? '1' : undefined

  return {
    ...(keyword ? { keyword } : {}),
    ...(routeName ? { routeName } : {}),
    ...(departureType ? { departureType } : {}),
    ...(departureProgress ? { departureProgress } : {}),
    ...(status ? { status } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(partnerId ? { partnerId } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(view ? { view } : {}),
    ...(operationalWindow ? { operationalWindow } : {}),
    ...(departureDataGap ? { departureDataGap } : {}),
    ...(settlementReadiness ? { settlementReadiness } : {}),
    ...(accountGenerationGap ? { accountGenerationGap } : {}),
    ...(startDateFrom ? { startDateFrom } : {}),
    ...(startDateTo ? { startDateTo } : {}),
    ...(excludeClosed ? { excludeClosed } : {}),
  }
}

/** Drop defaults so shareable URLs stay compact and stable. */
export function serializeDepartureListSearch(
  state: DepartureListSerializableState,
): DepartureListSearch {
  const keyword = state.keyword?.trim() || undefined
  const routeName = state.routeName?.trim() || undefined
  const page = state.page && state.page !== DEFAULT_PAGE ? state.page : undefined
  const pageSize =
    state.pageSize && state.pageSize !== DEFAULT_PAGE_SIZE ? state.pageSize : undefined
  const view = state.view && state.view !== DEFAULT_VIEW ? state.view : undefined

  return parseDepartureListSearch({
    ...(keyword ? { keyword } : {}),
    ...(routeName ? { routeName } : {}),
    ...(state.departureType ? { departureType: state.departureType } : {}),
    ...(state.departureProgress ? { departureProgress: state.departureProgress } : {}),
    ...(state.status ? { status: state.status } : {}),
    ...(state.ownerUserId ? { ownerUserId: state.ownerUserId } : {}),
    ...(state.partnerId ? { partnerId: state.partnerId } : {}),
    ...(state.startDateFrom ? { startDateFrom: state.startDateFrom } : {}),
    ...(state.startDateTo ? { startDateTo: state.startDateTo } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(view ? { view } : {}),
    ...(state.operationalWindow ? { operationalWindow: state.operationalWindow } : {}),
    ...(state.departureDataGap ? { departureDataGap: state.departureDataGap } : {}),
    ...(state.settlementReadiness ? { settlementReadiness: state.settlementReadiness } : {}),
    ...(state.accountGenerationGap
      ? { accountGenerationGap: state.accountGenerationGap }
      : {}),
    ...(state.excludeClosed ? { excludeClosed: state.excludeClosed } : {}),
  })
}

export function encodeDepartureListReturn(search: DepartureListSearch): string {
  const serialized = serializeDepartureListSearch(search)
  const entries = Object.entries(serialized).map(([key, value]) => [key, String(value)])
  if (entries.length === 0) {
    return '1'
  }
  return new URLSearchParams(entries).toString()
}

/** `undefined` means the detail was not opened from the departure list. */
export function decodeDepartureListReturn(value: unknown): DepartureListSearch | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined
  }
  if (value === '1') {
    return {}
  }
  return parseDepartureListSearch(Object.fromEntries(new URLSearchParams(value)))
}

/**
 * Prefer durable `listReturn` search param (survives refresh); fall back to
 * router location.state from an in-session list → detail navigation.
 */
export function resolveDepartureListReturnSearch(
  locationState: unknown,
  listReturnParam?: unknown,
): DepartureListSearch {
  const fromUrl = decodeDepartureListReturn(listReturnParam)
  if (fromUrl !== undefined) {
    return fromUrl
  }

  if (!locationState || typeof locationState !== 'object') {
    return {}
  }

  const listSearch = (locationState as { listSearch?: unknown }).listSearch
  if (!listSearch || typeof listSearch !== 'object') {
    return {}
  }

  return parseDepartureListSearch(listSearch as Record<string, unknown>)
}

/**
 * Explicit workbench drill-down markers only.
 * Local date filters also live in the URL and must not look like a workbench handoff.
 */
export function hasWorkbenchDepartureListSearch(search: DepartureListSearch): boolean {
  return Boolean(
    search.operationalWindow
    || search.departureDataGap
    || search.settlementReadiness
    || search.accountGenerationGap
    || search.excludeClosed,
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
