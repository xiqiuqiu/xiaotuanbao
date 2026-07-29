import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { Alert, App, Button, Card, Segmented, Space, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DepartureProgress, DepartureStatus, DepartureType, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { DepartureSummary } from '@/types/api'
import { listDepartures, purgeDeparture } from '@/services/departure.service'
import { listEmployeeOptions } from '@/services/employee.service'
import { listPartners } from '@/services/partner.service'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditDeparture } from '../utils/departure-permission'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { PageHeader } from '@/layouts/PageHeader'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { DepartureFilters } from '../components/DepartureFilters'
import { RouteLedgerViewPanel } from '../components/RouteLedgerViewPanel'
import { buildDepartureColumns, DEPARTURE_LIST_TABLE_SCROLL_X } from './departure-columns'
import {
  resolveWorkbenchDepartureFilterBanner,
  serializeDepartureListSearch,
  type DepartureListSearch,
  type DepartureManagementView,
} from '../utils/departure-list-search'

type DeparturesPageState = {
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

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10

const initialDeparturesPageState: DeparturesPageState = {
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

function createInitialState(search: DepartureListSearch): DeparturesPageState {
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

type DeparturesPageAction =
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

function departuresPageReducer(
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

function toSerializableSearch(state: DeparturesPageState): DepartureListSearch {
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

export function DeparturesPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as DepartureListSearch
  const canEdit = canEditDeparture(useAuthStore((s) => s.actionKeys))
  const [state, dispatch] = useReducer(departuresPageReducer, search, createInitialState)
  const isListView = state.view === 'departure-list'
  const lastSyncedSearchRef = useRef<string | null>(null)

  const startDateFrom = state.startDateRange?.[0]
  const startDateTo = state.startDateRange?.[1]
  const workbenchFilterBanner = resolveWorkbenchDepartureFilterBanner(search)
  const debouncedRouteName = useDebouncedValue(state.routeName)
  const listReturnSearch = useMemo(() => toSerializableSearch(state), [state])

  useEffect(() => {
    const searchKey = JSON.stringify(search)
    const stateKey = JSON.stringify(listReturnSearch)
    const lastSynced = lastSyncedSearchRef.current ?? searchKey

    if (searchKey === stateKey) {
      lastSyncedSearchRef.current = searchKey
      return
    }

    // Inbound URL change (browser back/forward or workbench deep link).
    if (searchKey !== lastSynced) {
      dispatch({ type: 'HYDRATE_FROM_SEARCH', search })
      lastSyncedSearchRef.current = searchKey
      return
    }

    void navigate({
      to: '/departure',
      search: listReturnSearch,
      replace: true,
    })
    lastSyncedSearchRef.current = stateKey
  }, [listReturnSearch, navigate, search])

  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'departure-filters'],
    queryFn: () => listEmployeeOptions(),
    enabled: isListView,
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'departure-filters'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
    enabled: isListView,
  })

  const listFilterKey = [
    state.keyword,
    debouncedRouteName,
    state.departureType,
    state.departureProgress,
    state.statusFilter,
    state.ownerUserId,
    state.partnerId,
    startDateFrom,
    startDateTo,
    state.operationalWindow,
    state.departureDataGap,
    state.settlementReadiness,
    state.accountGenerationGap,
    state.excludeClosed,
  ].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: departuresResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: [
      'departures',
      state.keyword,
      debouncedRouteName,
      state.departureType,
      state.departureProgress,
      state.statusFilter,
      state.ownerUserId,
      state.partnerId,
      startDateFrom,
      startDateTo,
      state.operationalWindow,
      state.departureDataGap,
      state.settlementReadiness,
      state.accountGenerationGap,
      state.excludeClosed,
      state.page,
      state.pageSize,
    ],
    queryFn: ({ signal }) =>
      listDepartures(
        {
          keyword: state.keyword || undefined,
          routeName: debouncedRouteName,
          departureType: state.departureType,
          departureProgress: state.departureProgress,
          status: state.statusFilter,
          ownerUserId: state.ownerUserId,
          partnerId: state.partnerId,
          startDateFrom,
          startDateTo,
          operationalWindow: state.operationalWindow,
          departureDataGap: state.departureDataGap,
          settlementReadiness: state.settlementReadiness,
          accountGenerationGap: state.accountGenerationGap,
          excludeClosed: state.excludeClosed,
          page: state.page,
          pageSize: state.pageSize,
        },
        signal,
      ),
    placeholderData,
    enabled: isListView,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(isSuccess, isPlaceholderData)
  }, [commitListFilterKey, isSuccess, isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
  })

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' })
  }, [])

  const handleCopy = useCallback(
    (departureId: string) => {
      void navigate({ to: '/departure/new', search: { copyFrom: departureId } })
    },
    [navigate],
  )

  const purgeMutation = useMutation({
    mutationFn: (departure: DepartureSummary) => purgeDeparture(departure.id),
    onSuccess: () => {
      message.success('发团已删除')
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除发团失败')
    },
  })

  const handlePurge = useCallback(
    (departure: DepartureSummary) => {
      purgeMutation.mutate(departure)
    },
    [purgeMutation],
  )

  const columns = useMemo(
    () =>
      buildDepartureColumns(
        {
          onCopy: handleCopy,
          onPurge: handlePurge,
          purgePendingId: purgeMutation.isPending ? purgeMutation.variables?.id : null,
        },
        canEdit,
        listReturnSearch,
      ),
    [
      canEdit,
      handleCopy,
      handlePurge,
      listReturnSearch,
      purgeMutation.isPending,
      purgeMutation.variables?.id,
    ],
  )

  const ownerOptions =
    employeeOptionsResult?.map((employee) => ({
      value: employee.id,
      label: employee.name,
    })) ?? []

  const partnerOptions =
    partnersResult?.items.map((partner) => ({
      value: partner.id,
      label: partner.name,
    })) ?? []

  return (
    <div>
      <PageHeader
        title="发团管理"
        action={
          canEdit ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => void navigate({ to: '/departure/new' })}
            >
              新建发团
            </Button>
          ) : undefined
        }
      />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Segmented<DepartureManagementView>
          value={state.view}
          options={[
            { label: '发团视图', value: 'departure-list' },
            { label: '线路视图', value: 'route-ledger' },
          ]}
          onChange={(value) => dispatch({ type: 'SET_VIEW', value })}
        />

        {isListView ? (
          <>
            {workbenchFilterBanner ? (
              <Alert
                type="info"
                showIcon
                title={workbenchFilterBanner.title}
                action={
                  <Button
                    size="small"
                    onClick={() => {
                      dispatch({ type: 'RESET_FILTERS' })
                    }}
                  >
                    清除工作台筛选
                  </Button>
                }
              />
            ) : null}

            <DepartureFilters
              key={state.filtersKey}
              statusFilter={state.statusFilter}
              routeNameFilter={state.routeName}
              departureTypeFilter={state.departureType}
              departureProgressFilter={state.departureProgress}
              ownerUserIdFilter={state.ownerUserId}
              partnerIdFilter={state.partnerId}
              startDateRange={state.startDateRange}
              ownerOptions={ownerOptions}
              partnerOptions={partnerOptions}
              onSearch={(value) => dispatch({ type: 'SET_KEYWORD', value })}
              onRouteNameChange={(value) => dispatch({ type: 'SET_ROUTE_NAME', value })}
              onDepartureTypeChange={(value) => dispatch({ type: 'SET_DEPARTURE_TYPE', value })}
              onDepartureProgressChange={(value) =>
                dispatch({ type: 'SET_DEPARTURE_PROGRESS', value })
              }
              onStatusChange={(value) => dispatch({ type: 'SET_STATUS', value })}
              onOwnerChange={(value) => dispatch({ type: 'SET_OWNER', value })}
              onPartnerChange={(value) => dispatch({ type: 'SET_PARTNER', value })}
              onStartDateRangeChange={(value) => dispatch({ type: 'SET_START_DATE_RANGE', value })}
              onReset={resetFilters}
            />

            <StaleDataAlert
              isFetching={isFetching}
              isError={isError}
              hasData={Boolean(departuresResult)}
              onRefresh={() => {
                void refetch()
              }}
            />

            <Card>
              <Table
                rowKey="id"
                loading={hardLoading}
                columns={columns}
                dataSource={departuresResult?.items ?? []}
                scroll={{ x: DEPARTURE_LIST_TABLE_SCROLL_X }}
                className={listSoftFetchingClassName(softFetching)}
                pagination={{
                  current: state.page,
                  pageSize: state.pageSize,
                  total: departuresResult?.total ?? 0,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (nextPage, nextPageSize) => {
                    dispatch({ type: 'SET_PAGE', page: nextPage, pageSize: nextPageSize })
                  },
                }}
              />
            </Card>
          </>
        ) : (
          <RouteLedgerViewPanel
            routeName={state.routeName}
            startDateRange={state.startDateRange}
            onRouteNameChange={(value) =>
              dispatch({ type: 'SET_ROUTE_NAME', value })
            }
            onStartDateRangeChange={(value) =>
              dispatch({ type: 'SET_START_DATE_RANGE', value })
            }
            onSwitchToDepartureList={() =>
              dispatch({ type: 'SET_VIEW', value: 'departure-list' })
            }
            listReturnSearch={listReturnSearch}
          />
        )}
      </Space>
    </div>
  )
}
