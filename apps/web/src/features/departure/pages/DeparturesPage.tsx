import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import { App, Button, Space, Tabs } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { DepartureSummary } from '@/types/api'
import {
  listDepartureRouteNames,
  listDepartures,
  purgeDeparture,
} from '@/services/departure.service'
import { listEmployeeOptions } from '@/services/employee.service'
import { listPartners } from '@/services/partner.service'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditDeparture } from '../utils/departure-permission'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { PageHeader } from '@/layouts/PageHeader'
import {
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { DeparturesListPanel } from '../components/DeparturesListPanel'
import { RouteLedgerViewPanel } from '../components/RouteLedgerViewPanel'
import { buildDepartureColumns } from './departure-columns'
import {
  createInitialState,
  departuresPageReducer,
  toSerializableSearch,
} from './departures-page-state'
import {
  resolveWorkbenchDepartureFilterBanner,
  type DepartureListSearch,
  type DepartureManagementView,
} from '../utils/departure-list-search'

function useRouteLedgerRouteNames({
  enabled,
}: {
  enabled: boolean
}) {
  return useQuery({
    queryKey: ['departures', 'route-names'],
    queryFn: ({ signal }) => listDepartureRouteNames(signal),
    enabled,
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

  const { data: routeNamesData, isLoading: routeNamesLoading } =
    useRouteLedgerRouteNames({ enabled: true })
  const routeLedgerRouteName =
    state.routeName ??
    (startDateFrom || startDateTo
      ? undefined
      : routeNamesData?.items.find((name) => name.trim().length > 0)?.trim())

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

  const viewNavigation = (
    <Tabs
      activeKey={state.view}
      items={[
        { key: 'departure-list', label: '发团视图' },
        { key: 'route-ledger', label: '线路视图' },
      ]}
      styles={{
        header: { margin: 0, paddingInline: 16 },
        body: { display: 'none' },
      }}
      onChange={(value) =>
        dispatch({ type: 'SET_VIEW', value: value as DepartureManagementView })
      }
    />
  )

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
        {isListView ? (
          <DeparturesListPanel
            viewNavigation={viewNavigation}
            state={state}
            dispatch={dispatch}
            workbenchFilterBanner={workbenchFilterBanner}
            ownerOptions={ownerOptions}
            partnerOptions={partnerOptions}
            columns={columns}
            hardLoading={hardLoading}
            softFetching={softFetching}
            isFetching={isFetching}
            isError={isError}
            departuresResult={departuresResult}
            onResetFilters={resetFilters}
            onRefresh={() => {
              void refetch()
            }}
          />
        ) : (
          <RouteLedgerViewPanel
            viewNavigation={viewNavigation}
            routeNames={routeNamesData?.items ?? []}
            routeNamesLoading={routeNamesLoading}
            routeName={routeLedgerRouteName}
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
