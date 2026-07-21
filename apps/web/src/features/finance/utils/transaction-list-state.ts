import {
  type TransactionDirection,
  type TransactionWriteoffStatus,
} from '@xiaotuanbao/shared'
import {
  getDefaultTransactionDateRange,
  type TransactionDateRange,
} from './date-ranges'

export type TransactionListState = {
  dateRange: TransactionDateRange
  direction?: TransactionDirection
  partnerKeyword: string
  writeoffStatus?: TransactionWriteoffStatus
  /** 工作台待核销流水下钻：服务端 none∪partial。 */
  pendingSettlement?: '1'
  transactionNo: string
  departureFilter?: string
  statusFilter?: 'normal' | 'voided'
  page: number
  pageSize: number
}

export type TransactionListAction =
  | { type: 'setDateRange'; value: TransactionDateRange }
  | { type: 'setDirection'; value?: TransactionDirection }
  | { type: 'setPartnerKeyword'; value: string }
  | { type: 'setWriteoffStatus'; value?: TransactionWriteoffStatus }
  | { type: 'setTransactionNo'; value: string }
  | { type: 'setDepartureFilter'; value?: string }
  | { type: 'setStatusFilter'; value?: 'normal' | 'voided' }
  | { type: 'setPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'resetFilters' }
  | { type: 'applyDeepLink'; value: TransactionListState }

/** Departure scope has no default date window. */
export function createInitialTransactionListState(options: {
  scope: 'global' | 'departure'
  direction?: TransactionDirection
}): TransactionListState {
  const isDepartureScope = options.scope === 'departure'
  const [start, end] = getDefaultTransactionDateRange()
  return {
    dateRange: isDepartureScope ? null : [start, end],
    direction: options.direction,
    partnerKeyword: '',
    writeoffStatus: undefined,
    pendingSettlement: undefined,
    transactionNo: '',
    departureFilter: undefined,
    statusFilter: undefined,
    page: 1,
    pageSize: 10,
  }
}

export function createTransactionListReducer(scope: 'global' | 'departure') {
  return function transactionListReducer(
    state: TransactionListState,
    action: TransactionListAction,
  ): TransactionListState {
    switch (action.type) {
      case 'setDateRange':
        return { ...state, dateRange: action.value, page: 1 }
      case 'setDirection':
        return { ...state, direction: action.value, page: 1 }
      case 'setPartnerKeyword':
        return { ...state, partnerKeyword: action.value, page: 1 }
      case 'setWriteoffStatus':
        return { ...state, writeoffStatus: action.value, page: 1 }
      case 'setTransactionNo':
        return { ...state, transactionNo: action.value, page: 1 }
      case 'setDepartureFilter':
        return { ...state, departureFilter: action.value, page: 1 }
      case 'setStatusFilter':
        return { ...state, statusFilter: action.value, page: 1 }
      case 'setPage':
        return { ...state, page: action.value }
      case 'setPageSize':
        return { ...state, pageSize: action.value }
      case 'resetFilters':
        return createInitialTransactionListState({ scope })
      case 'applyDeepLink':
        return { ...state, ...action.value }
      default:
        return state
    }
  }
}
