import type { Dispatch, ReactNode } from 'react'
import { Alert, Button, Card, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { DepartureSummary } from '@/types/api'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { listSoftFetchingClassName } from '@/lib/query/list-query-ux'
import { DepartureFilters } from './DepartureFilters'
import { DEPARTURE_LIST_TABLE_SCROLL_X } from '../pages/departure-columns'
import type {
  DeparturesPageAction,
  DeparturesPageState,
} from '../pages/departures-page-state'

type FilterOption = {
  value: string
  label: string
}

type WorkbenchFilterBanner = {
  title: string
} | null

type DeparturesListPanelProps = {
  viewNavigation?: ReactNode
  state: DeparturesPageState
  dispatch: Dispatch<DeparturesPageAction>
  workbenchFilterBanner: WorkbenchFilterBanner
  ownerOptions: FilterOption[]
  partnerOptions: FilterOption[]
  columns: ColumnsType<DepartureSummary>
  hardLoading: boolean
  softFetching: boolean
  isFetching: boolean
  isError: boolean
  departuresResult?: {
    items: DepartureSummary[]
    total: number
  }
  onResetFilters: () => void
  onRefresh: () => void
}

export function DeparturesListPanel({
  viewNavigation,
  state,
  dispatch,
  workbenchFilterBanner,
  ownerOptions,
  partnerOptions,
  columns,
  hardLoading,
  softFetching,
  isFetching,
  isError,
  departuresResult,
  onResetFilters,
  onRefresh,
}: DeparturesListPanelProps) {
  return (
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
        viewNavigation={viewNavigation}
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
        onReset={onResetFilters}
      />

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(departuresResult)}
        onRefresh={onRefresh}
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
  )
}
