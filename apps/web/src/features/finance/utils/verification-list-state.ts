import {
  getDefaultVerificationDateRange,
  type VerificationDateRange,
} from './date-ranges'
import {
  applyVerificationDeepLink,
  resolveVerificationDeepLinkSearch,
  type VerificationDeepLinkLock,
  type VerificationDeepLinkSearch,
} from './verification-list-deep-link'

export type VerificationListState = {
  page: number
  pageSize: number
  dateRange: VerificationDateRange
  direction?: string
  status?: string
  transactionNo: string
  scheduleNo: string
  departureKeyword: string
  lock: VerificationDeepLinkLock
}

export type VerificationListAction =
  | { type: 'setDateRange'; value: VerificationDateRange }
  | { type: 'setDirection'; value?: string }
  | { type: 'setStatus'; value?: string }
  | { type: 'setTransactionNo'; value: string }
  | { type: 'setScheduleNo'; value: string }
  | { type: 'setDepartureKeyword'; value: string }
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'resetFilters' }
  | { type: 'applyDeepLink'; search: VerificationDeepLinkSearch }

/** Departure scope has no default date window. */
export function createDefaultVerificationListState(
  scope: 'global' | 'departure' = 'global',
): VerificationListState {
  return {
    page: 1,
    pageSize: 10,
    dateRange: scope === 'departure' ? null : getDefaultVerificationDateRange(),
    direction: undefined,
    status: undefined,
    transactionNo: '',
    scheduleNo: '',
    departureKeyword: '',
    lock: null,
  }
}

export function createInitialVerificationListState(
  search: VerificationDeepLinkSearch | undefined,
  scope: 'global' | 'departure',
): VerificationListState {
  const resolved = resolveVerificationDeepLinkSearch(search ?? {})
  if (!resolved.transactionNo && !resolved.scheduleNo) {
    return createDefaultVerificationListState(scope)
  }

  const deepLink = applyVerificationDeepLink(resolved)
  return {
    page: 1,
    pageSize: 10,
    ...deepLink,
  }
}

export function createVerificationListReducer(scope: 'global' | 'departure') {
  return function verificationListReducer(
    state: VerificationListState,
    action: VerificationListAction,
  ): VerificationListState {
    switch (action.type) {
      case 'setDateRange':
        return { ...state, dateRange: action.value, page: 1 }
      case 'setDirection':
        return { ...state, direction: action.value, page: 1 }
      case 'setStatus':
        return { ...state, status: action.value, page: 1 }
      case 'setTransactionNo':
        return { ...state, transactionNo: action.value, page: 1, lock: null }
      case 'setScheduleNo':
        return { ...state, scheduleNo: action.value, page: 1, lock: null }
      case 'setDepartureKeyword':
        return { ...state, departureKeyword: action.value, page: 1 }
      case 'setPage':
        return { ...state, page: action.value }
      case 'setPageSize':
        return { ...state, pageSize: action.value }
      case 'resetFilters':
        return createDefaultVerificationListState(scope)
      case 'applyDeepLink':
        return createInitialVerificationListState(action.search, scope)
      default:
        return state
    }
  }
}
