import { useCallback, useMemo, useState } from 'react'
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
  const [keyword, setKeyword] = useState('')
  const [routeName, setRouteName] = useState<string>()
  const [departureType, setDepartureType] = useState<DepartureType>()
  const [departureProgress, setDepartureProgress] = useState<DepartureProgress>()
  const [statusFilter, setStatusFilter] = useState<DepartureStatus>()
  const [ownerUserId, setOwnerUserId] = useState<string>()
  const [partnerId, setPartnerId] = useState<string>()
  const [startDateRange, setStartDateRange] = useState<[string | undefined, string | undefined] | null>(null)
  const [filtersKey, setFiltersKey] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]

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
      keyword,
      routeName,
      departureType,
      departureProgress,
      statusFilter,
      ownerUserId,
      partnerId,
      startDateFrom,
      startDateTo,
      page,
      pageSize,
    ],
    queryFn: () =>
      listDepartures({
        keyword: keyword || undefined,
        routeName,
        departureType,
        departureProgress,
        status: statusFilter,
        ownerUserId,
        partnerId,
        startDateFrom,
        startDateTo,
        page,
        pageSize,
      }),
  })

  const resetFilters = useCallback(() => {
    setKeyword('')
    setRouteName(undefined)
    setDepartureType(undefined)
    setDepartureProgress(undefined)
    setStatusFilter(undefined)
    setOwnerUserId(undefined)
    setPartnerId(undefined)
    setStartDateRange(null)
    setPage(1)
    setFiltersKey((key) => key + 1)
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
        key={filtersKey}
        statusFilter={statusFilter}
        routeNameFilter={routeName}
        departureTypeFilter={departureType}
        departureProgressFilter={departureProgress}
        ownerUserIdFilter={ownerUserId}
        partnerIdFilter={partnerId}
        ownerOptions={ownerOptions}
        partnerOptions={partnerOptions}
        onSearch={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onRouteNameChange={(value) => {
          setRouteName(value)
          setPage(1)
        }}
        onDepartureTypeChange={(value) => {
          setDepartureType(value)
          setPage(1)
        }}
        onDepartureProgressChange={(value) => {
          setDepartureProgress(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onOwnerChange={(value) => {
          setOwnerUserId(value)
          setPage(1)
        }}
        onPartnerChange={(value) => {
          setPartnerId(value)
          setPage(1)
        }}
        onStartDateRangeChange={(value) => {
          setStartDateRange(value)
          setPage(1)
        }}
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
            current: page,
            pageSize,
            total: departuresResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>
    </div>
  )
}
