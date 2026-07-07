import { useCallback, useMemo, useReducer } from 'react'
import { Button, Card, Space, Table, Tag, Typography } from 'antd'
import { CopyOutlined, PlusOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { DepartureSummary } from '@/types/api'
import { DepartureProgress, DepartureStatus, DepartureType, DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import { listEmployees } from '@/services/employee.service'
import { listPartners } from '@/services/partner.service'
import { DepartureFilters } from '../components/DepartureFilters'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  DEPARTURE_TYPE_LABELS,
  catalogLabel,
  formatCents,
  renderCompletionTags,
} from '../catalog'

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

function buildColumns(): ColumnsType<DepartureSummary> {
  return [
    {
      title: '团号',
      dataIndex: 'departureNo',
      fixed: 'left',
      width: 140,
      render: (value: string, record) => (
        <Link
          to="/departure/$departureId"
          params={{ departureId: record.id }}
          search={{ tab: 'overview' }}
        >
          <Typography.Text strong>{value}</Typography.Text>
        </Link>
      ),
    },
    {
      title: '团名',
      dataIndex: 'name',
      width: 180,
      render: (name: string, record) => (
        <Link
          to="/departure/$departureId"
          params={{ departureId: record.id }}
          search={{ tab: 'overview' }}
        >
          {name}
        </Link>
      ),
    },
    {
      title: '路线名称',
      dataIndex: 'routeName',
      width: 160,
    },
    {
      title: '发团类型',
      dataIndex: 'departureType',
      width: 90,
      render: (value: string) => catalogLabel(DEPARTURE_TYPE_LABELS, value),
    },
    {
      title: '出团日期',
      dataIndex: 'startDate',
      width: 180,
      render: (value: string, record) => `${value} ~ ${record.endDate}`,
    },
    {
      title: '出团进度',
      dataIndex: 'departureProgress',
      width: 90,
      render: (value: string) => (
        <Tag color={DEPARTURE_PROGRESS_COLORS[value] ?? 'default'}>
          {catalogLabel(DEPARTURE_PROGRESS_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '发团状态',
      dataIndex: 'status',
      width: 90,
      render: (status: DepartureStatus) => (
        <Tag color={DEPARTURE_STATUS_COLORS[status] ?? 'default'}>
          {catalogLabel(DEPARTURE_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    {
      title: '总人数',
      dataIndex: 'totalGuests',
      width: 80,
      render: (value: number) => `${value}人`,
    },
    {
      title: '完成情况',
      key: 'completionTags',
      width: 320,
      render: (_value, record) => (
        <Space size={[0, 4]} wrap>
          {renderCompletionTags(record.completionTags).map((tag) => (
            <Tag key={tag.label}>{tag.label}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '实际应收',
      dataIndex: 'netReceivableCents',
      width: 110,
      render: (value: number) => formatCents(value),
    },
    {
      title: '应付合计',
      dataIndex: 'payableCents',
      width: 110,
      render: (value: number) => formatCents(value),
    },
    {
      title: '预估毛利',
      dataIndex: 'estimatedMarginCents',
      width: 110,
      render: (value: number) => formatCents(value),
    },
    {
      title: '负责人',
      dataIndex: 'ownerName',
      width: 100,
      render: (value: string | undefined, record) => value ?? record.ownerUserId,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_value, record) => (
        <Space size="small">
          <Link
            to="/departure/new"
            search={{ copyFrom: record.id }}
          >
            <Button type="link" size="small" icon={<CopyOutlined />}>
              复制
            </Button>
          </Link>
        </Space>
      ),
    },
  ]
}

export function DeparturesPage() {
  const [state, dispatch] = useReducer(departuresPageReducer, initialDeparturesPageState)

  const startDateFrom = state.startDateRange?.[0]
  const startDateTo = state.startDateRange?.[1]

  const { data: employeesResult } = useQuery({
    queryKey: ['employees', 'departure-filters'],
    queryFn: () => listEmployees({ pageSize: 100 }),
  })

  const { data: partnersResult } = useQuery({
    queryKey: ['partners', 'departure-filters'],
    queryFn: () =>
      listPartners({
        status: DirectoryProfileStatus.ACTIVE,
        pageSize: 100,
      }),
  })

  const { data: departuresResult, isLoading } = useQuery({
    queryKey: [
      'departures',
      state.keyword,
      state.routeName,
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
        routeName: state.routeName,
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
  })

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' })
  }, [])

  const columns = useMemo(() => buildColumns(), [])

  const ownerOptions =
    employeesResult?.items.map((employee) => ({
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            发团管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            查看与管理所有发团批次
          </Typography.Paragraph>
        </div>
        <Link to="/departure/new">
          <Button type="primary" icon={<PlusOutlined />}>
            新建发团
          </Button>
        </Link>
      </div>

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

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={departuresResult?.items ?? []}
          scroll={{ x: 1800 }}
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
