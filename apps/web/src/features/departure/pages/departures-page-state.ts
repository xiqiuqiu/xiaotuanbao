import { DepartureProgress, DepartureStatus, DepartureType } from '@xiaotuanbao/shared'
import {
  serializeDepartureListSearch,
  type DepartureListSearch,
  type DepartureManagementView,
} from '../utils/departure-list-search'

export type DeparturesPageState = {
  keyword: string
  routeName?: string
  departureType?: DepartureType
  departureProgress?: DepartureProgress
  statusFilter?: DepartureStatus
  ownerUserId?: string
  partnerId?: string
  startDateRange: [string | undefined, string | undefined] | null
  filtersKey: number
  page: number
  pageSize: number
  view: DepartureManagementView
  operationalWindow?: DepartureListSearch['operationalWindow']
  departureDataGap?: DepartureListSearch['departureDataGap']
  settlementReadiness?: DepartureListSearch['settlementReadiness']
  accountGenerationGap?: DepartureListSearch['accountGenerationGap']
  excludeClosed?: DepartureListSearch['excludeClosed']
}

export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 10

export const initialDeparturesPageState: DeparturesPageState = {
  keyword: '',
  routeName: undefined,
  departureType: undefined,
  departureProgress: undefined,
  statusFilter: undefined,
  ownerUserId: undefined,
  partnerId: undefined,
  startDateRange: null,
  filtersKey: 0,
  page: DEFAULT_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  view: 'departure-list',
  operationalWindow: undefined,
  departureDataGap: undefined,
  settlementReadiness: undefined,
  accountGenerationGap: undefined,
  excludeClosed: undefined,
}

export function createInitialState(search: DepartureListSearch): DeparturesPageState {
  const startDateRange = search.startDateFrom || search.startDateTo
    ? [search.startDateFrom, search.startDateTo] as [string | undefined, string | undefined]
    : null
  return {
    ...initialDeparturesPageState,
    keyword: search.keyword ?? '',
    routeName: search.routeName,
    departureType: search.departureType,
    departureProgress: search.departureProgress,
    statusFilter: search.status,
    ownerUserId: search.ownerUserId,
    partnerId: search.partnerId,
    startDateRange,
    page: search.page ?? DEFAULT_PAGE,
    pageSize: search.pageSize ?? DEFAULT_PAGE_SIZE,
    view: search.view ?? 'departure-list',
    operationalWindow: search.operationalWindow,
    departureDataGap: search.departureDataGap,
    settlementReadiness: search.settlementReadiness,
    accountGenerationGap: search.accountGenerationGap,
    excludeClosed: search.excludeClosed,
  }
}

export type DeparturesPageAction =
  | { type: 'SET_KEYWORD'; value: string }
  | { type: 'SET_ROUTE_NAME'; value?: string }
  | { type: 'SET_DEPARTURE_TYPE'; value?: DepartureType }
  | { type: 'SET_DEPARTURE_PROGRESS'; value?: DepartureProgress }
  | { type: 'SET_STATUS'; value?: DepartureStatus }
  | { type: 'SET_OWNER'; value?: string }
  | { type: 'SET_PARTNER'; value?: string }
  | { type: 'SET_START_DATE_RANGE'; value: [string | undefined, string | undefined] | null }
  | { type: 'SET_PAGE'; page: number; pageSize?: number }
  | { type: 'SET_VIEW'; value: DepartureManagementView }
  | { type: 'RESET_FILTERS' }
  | { type: 'HYDRATE_FROM_SEARCH'; search: DepartureListSearch }

export function departuresPageReducer(
  state: DeparturesPageState,
  action: DeparturesPageAction,
): DeparturesPageState {
  switch (action.type) {
    case 'SET_KEYWORD':
      return { ...state, keyword: action.value, page: 1 }
    case 'SET_ROUTE_NAME':
      return { ...state, routeName: action.value, page: 1 }
    case 'SET_DEPARTURE_TYPE':
      return { ...state, departureType: action.value, page: 1 }
    case 'SET_DEPARTURE_PROGRESS':
      return { ...state, departureProgress: action.value, page: 1 }
    case 'SET_STATUS':
      return { ...state, statusFilter: action.value, page: 1 }
    case 'SET_OWNER':
      return { ...state, ownerUserId: action.value, page: 1 }
    case 'SET_PARTNER':
      return { ...state, partnerId: action.value, page: 1 }
    case 'SET_START_DATE_RANGE':
      return { ...state, startDateRange: action.value, page: 1 }
    case 'SET_PAGE':
      return {
        ...state,
        page: action.page,
        pageSize: action.pageSize ?? state.pageSize,
      }
    case 'SET_VIEW':
      return { ...state, view: action.value }
    case 'RESET_FILTERS':
      return {
        ...initialDeparturesPageState,
        view: state.view,
        filtersKey: state.filtersKey + 1,
      }
    case 'HYDRATE_FROM_SEARCH':
      return {
        ...createInitialState(action.search),
        filtersKey: state.filtersKey + 1,
      }
  }
}

export function toSerializableSearch(state: DeparturesPageState): DepartureListSearch {
  return serializeDepartureListSearch({
    keyword: state.keyword,
    routeName: state.routeName,
    departureType: state.departureType,
    departureProgress: state.departureProgress,
    status: state.statusFilter,
    ownerUserId: state.ownerUserId,
    partnerId: state.partnerId,
    startDateFrom: state.startDateRange?.[0],
    startDateTo: state.startDateRange?.[1],
    page: state.page,
    pageSize: state.pageSize,
    view: state.view,
    operationalWindow: state.operationalWindow,
    departureDataGap: state.departureDataGap,
    settlementReadiness: state.settlementReadiness,
    accountGenerationGap: state.accountGenerationGap,
    excludeClosed: state.excludeClosed,
  })
}
