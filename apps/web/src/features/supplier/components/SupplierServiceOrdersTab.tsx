import { useState } from 'react'
import dayjs from 'dayjs'
import { Card, Col, DatePicker, Empty, Row, Space, Statistic, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { RESOURCE_KIND_LABELS, type ResourceKind } from '@xiaotuanbao/shared'
import type { SupplierServiceOrderItem } from '@/types/api'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import { FinanceDepartureLink } from '@/features/finance/components/FinanceDepartureLink'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listSupplierServiceOrders } from '@/services/supplier.service'
import { formatCents } from '@/features/departure/catalog'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'

type DepartureDateRange = [string | undefined, string | undefined] | null

const COLUMNS: ColumnsType<SupplierServiceOrderItem> = [
  { title: '出团日期', dataIndex: 'departureStartDate', width: 110 },
  {
    title: '关联发团',
    key: 'departure',
    width: 220,
    render: (_: unknown, record) => (
      <Tooltip title={record.departureNo}>
        <FinanceDepartureLink departureId={record.departureId}>
          {record.departureName || record.departureNo}
        </FinanceDepartureLink>
      </Tooltip>
    ),
  },
  {
    title: '行程段',
    dataIndex: 'segmentName',
    width: 160,
    ellipsis: { showTitle: false },
    render: (value: string) => <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>,
  },
  {
    title: '资源种类',
    dataIndex: 'resourceKind',
    width: 100,
    render: (value: string) => RESOURCE_KIND_LABELS[value as ResourceKind] ?? value,
  },
  {
    title: '资源名称',
    dataIndex: 'title',
    width: 200,
    ellipsis: { showTitle: false },
    render: (value: string) => <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>,
  },
  {
    title: '约定金额',
    dataIndex: 'amountCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '备注',
    dataIndex: 'notes',
    width: 180,
    ellipsis: { showTitle: false },
    render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
  },
]

interface SupplierServiceOrdersTabProps {
  supplierId: string
}

export function SupplierServiceOrdersTab({ supplierId }: SupplierServiceOrdersTabProps) {
  const [dateRange, setDateRange] = useState<DepartureDateRange>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['supplier-service-orders', supplierId, dateRange, page, pageSize],
    queryFn: () =>
      listSupplierServiceOrders(supplierId, {
        departureDateFrom: dateRange?.[0],
        departureDateTo: dateRange?.[1],
        page,
        pageSize,
      }),
    ...operationalQueryOptions(),
  })

  const hasDateFilter = Boolean(dateRange?.[0] || dateRange?.[1])
  const summary = listResult?.summary

  if (listResult && listResult.total === 0 && !hasDateFilter) {
    return <Empty description="该供应商暂无服务团单资源" style={{ padding: '48px 0' }} />
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card style={{ marginBottom: 0 }}>
        <DatePicker.RangePicker
          allowClear
          allowEmpty={[true, true]}
          aria-label="出团日期"
          placeholder={['出团日期起', '出团日期止']}
          presets={buildDepartureDateRangePresets()}
          value={
            dateRange
              ? [
                  dateRange[0] ? dayjs(dateRange[0]) : null,
                  dateRange[1] ? dayjs(dateRange[1]) : null,
                ]
              : null
          }
          onChange={(values) => {
            setDateRange(
              values
                ? [values[0]?.format('YYYY-MM-DD'), values[1]?.format('YYYY-MM-DD')]
                : null,
            )
            setPage(1)
          }}
        />
      </Card>

      <Row gutter={[16, 16]} role="group" aria-label="服务团单汇总">
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="资源行数"
            value={summary?.resourceRowCount ?? 0}
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="关联发团数"
            value={summary?.departureCount ?? 0}
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="约定金额合计"
            value={formatCents(summary?.totalAmountCents ?? 0)}
            loading={isLoading}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={COLUMNS}
        dataSource={listResult?.items ?? []}
        scroll={{ x: 1090 }}
        pagination={{
          current: page,
          pageSize,
          total: listResult?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPageSize !== pageSize ? 1 : nextPage)
            setPageSize(nextPageSize)
          },
        }}
      />
    </Space>
  )
}
