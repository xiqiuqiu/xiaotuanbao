import { useCallback, useMemo, useReducer } from 'react'
import { Button, Card, Table } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { DepartureProgress, DepartureStatus, DepartureType, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
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
import { buildDepartureColumns } from './departure-columns'

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
  const navigate = useNavigate()
  const canEdit = canEditDeparture(useAuthStore((s) => s.actionKeys))
  const [state, dispatch] = useReducer(departuresPageReducer, initialDeparturesPageState)

  const startDateFrom = state.startDateRange?.[0]
  const startDateTo = state.startDateRange?.[1]
  const debouncedRouteName = useDebouncedValue(state.routeName)

  const { data: employeeOptionsResult } = useQuery({
    queryKey: ['employees', 'options', 'departure-filters'],
    queryFn: () => listEmployeeOptions(),
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'departure-filters'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
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
  ].join('\0')
  const placeholderData = useListPlaceholderData(listFilterKey)

  const {
    data: departuresResult,
    isLoading,
    isFetching,
    isError,
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
      state.page,
      state.pageSize,
    ],
    queryFn: () =>
      listDepartures({
        keyword: state.keyword || undefined,
        routeName: debouncedRouteName,
        departureType: state.departureType,
        departureProgress: state.departureProgress,
        status: state.statusFilter,
        ownerUserId: state.ownerUserId,
        partnerId: state.partnerId,
        startDateFrom,
        startDateTo,
        page: state.page,
        pageSize: state.pageSize,
      }),
    placeholderData,
    ...operationalQueryOptions(),
  })

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

  const columns = useMemo(() => buildDepartureColumns(handleCopy, canEdit), [handleCopy, canEdit])

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

      <DepartureFilters
        key={state.filtersKey}
        statusFilter={state.statusFilter}
        routeNameFilter={state.routeName}
        departureTypeFilter={state.departureType}
        departureProgressFilter={state.departureProgress}
        ownerUserIdFilter={state.ownerUserId}
        partnerIdFilter={state.partnerId}
        ownerOptions={ownerOptions}
        partnerOptions={partnerOptions}
        onSearch={(value) => dispatch({ type: 'SET_KEYWORD', value })}
        onRouteNameChange={(value) => dispatch({ type: 'SET_ROUTE_NAME', value })}
        onDepartureTypeChange={(value) => dispatch({ type: 'SET_DEPARTURE_TYPE', value })}
        onDepartureProgressChange={(value) => dispatch({ type: 'SET_DEPARTURE_PROGRESS', value })}
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
          scroll={{ x: 2100 }}
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
    </div>
  )
}
