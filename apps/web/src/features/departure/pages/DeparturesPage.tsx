import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
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
  hasWorkbenchDepartureListSearch,
  resolveWorkbenchDepartureFilterBanner,
  type DepartureListSearch,
} from '../utils/departure-list-search'

type DepartureManagementView = 'departure-list' | 'route-ledger'

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
  operationalWindow?: DepartureListSearch['operationalWindow']
  departureDataGap?: DepartureListSearch['departureDataGap']
  settlementReadiness?: DepartureListSearch['settlementReadiness']
  accountGenerationGap?: DepartureListSearch['accountGenerationGap']
  excludeClosed?: DepartureListSearch['excludeClosed']
}

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
  page: 1,
  pageSize: 10,
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
    departureProgress: search.departureProgress,
    operationalWindow: search.operationalWindow,
    departureDataGap: search.departureDataGap,
    settlementReadiness: search.settlementReadiness,
    accountGenerationGap: search.accountGenerationGap,
    excludeClosed: search.excludeClosed,
    startDateRange,
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
  | { type: 'RESET_FILTERS' }

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
    case 'RESET_FILTERS':
      return {
        ...initialDeparturesPageState,
        filtersKey: state.filtersKey + 1,
      }
  }
}

export function DeparturesPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as DepartureListSearch
  const canEdit = canEditDeparture(useAuthStore((s) => s.actionKeys))
  const [view, setView] = useState<DepartureManagementView>('departure-list')
  const [state, dispatch] = useReducer(departuresPageReducer, search, createInitialState)
  const isListView = view === 'departure-list'

  const startDateFrom = state.startDateRange?.[0]
  const startDateTo = state.startDateRange?.[1]
  const workbenchFilterBanner = resolveWorkbenchDepartureFilterBanner(search)
  const debouncedRouteName = useDebouncedValue(state.routeName)

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
    // 本地筛选不写 URL；若仍带着工作台深链，重置时一并清掉，避免提示残留。
    if (hasWorkbenchDepartureListSearch(search)) {
      void navigate({ to: '/departure', search: {} })
    }
  }, [navigate, search])

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
      ),
    [canEdit, handleCopy, handlePurge, purgeMutation.isPending, purgeMutation.variables?.id],
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
          value={view}
          options={[
            { label: '发团视图', value: 'departure-list' },
            { label: '线路视图', value: 'route-ledger' },
          ]}
          onChange={setView}
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
                      void navigate({ to: '/departure', search: {} })
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
          <RouteLedgerViewPanel onSwitchToDepartureList={() => setView('departure-list')} />
        )}
      </Space>
    </div>
  )
}
