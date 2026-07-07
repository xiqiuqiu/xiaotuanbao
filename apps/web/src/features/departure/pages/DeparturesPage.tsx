import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Space, Table, Tag, Typography } from 'antd'
import { CopyOutlined, PlusOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { DepartureSummary } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import { DepartureFilters, type DateRangeStrings } from '../components/DepartureFilters'
import {
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  catalogLabel,
} from '../catalog'

function buildColumns(): ColumnsType<DepartureSummary> {
  return [
    {
      title: '团号',
      dataIndex: 'departureNo',
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
      title: '出团日期',
      dataIndex: 'startDate',
      render: (value: string, record) => `${value} ~ ${record.endDate}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: DepartureStatus) => (
        <Tag color={DEPARTURE_STATUS_COLORS[status] ?? 'default'}>
          {catalogLabel(DEPARTURE_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
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
  const [statusFilter, setStatusFilter] = useState<DepartureStatus | undefined>()
  const [startDateRange, setStartDateRange] = useState<DateRangeStrings>(null)
  const [filtersKey, setFiltersKey] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]

  const { data: departuresResult, isLoading } = useQuery({
    queryKey: ['departures', keyword, statusFilter, startDateFrom, startDateTo, page, pageSize],
    queryFn: () =>
      listDepartures({
        keyword: keyword || undefined,
        status: statusFilter,
        startDateFrom,
        startDateTo,
        page,
        pageSize,
      }),
  })

  const resetFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter(undefined)
    setStartDateRange(null)
    setPage(1)
    setFiltersKey((key) => key + 1)
  }, [])

  const columns = useMemo(() => buildColumns(), [])

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
        onSearch={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
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
