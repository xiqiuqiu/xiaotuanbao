import { useState } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tooltip,
} from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { PartnerKind } from '@xiaotuanbao/shared'
import type {
  PartnerOutsourceOrderItem,
  PartnerSourceOrderItem,
  PartnerSummary,
} from '@/types/api'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import { FinanceDepartureLink } from '@/features/finance/components/FinanceDepartureLink'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPartnerOutsourceOrders } from '@/services/partner.service'
import { listPartnerSourceOrders } from '@/services/source-order.service'
import { formatCents } from '@/features/departure/catalog'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { PartnerReconciliationStatementDrawer } from './PartnerReconciliationStatementDrawer'

type DepartureDateRange = [string | undefined, string | undefined] | null
type CooperationSegment = 'source' | 'outsource'

const SOURCE_COLUMNS: ColumnsType<PartnerSourceOrderItem> = [
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
    title: '客源单',
    dataIndex: 'displayName',
    width: 200,
    ellipsis: { showTitle: false },
    render: (value: string) => <EllipsisTooltipText empty="">{value}</EllipsisTooltipText>,
  },
  {
    title: '成人/儿童',
    key: 'guests',
    width: 100,
    render: (_: unknown, record) => `${record.adultGuestCount}/${record.childGuestCount}`,
  },
  {
    title: '单价（成人/儿童）',
    key: 'unitPrices',
    width: 180,
    align: 'right',
    render: (_: unknown, record) =>
      `${formatCents(record.adultUnitPriceCents)} / ${
        record.childGuestCount > 0 ? formatCents(record.childUnitPriceCents) : '-'
      }`,
  },
  {
    title: '原始团款',
    dataIndex: 'grossReceivableCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '优惠',
    dataIndex: 'discountCents',
    width: 100,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '结算金额',
    dataIndex: 'netReceivableCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '客户已收',
    dataIndex: 'partnerCollectedCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '游客代收',
    dataIndex: 'guestCollectCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '备注',
    dataIndex: 'notes',
    width: 160,
    ellipsis: { showTitle: false },
    render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
  },
]

const OUTSOURCE_COLUMNS: ColumnsType<PartnerOutsourceOrderItem> = [
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

function defaultSegment(partnerKind: string): CooperationSegment {
  return partnerKind === PartnerKind.PEER ? 'outsource' : 'source'
}

interface PartnerSourceOrdersTabProps {
  partner: PartnerSummary
}

export function PartnerSourceOrdersTab({ partner }: PartnerSourceOrdersTabProps) {
  const [segment, setSegment] = useState<CooperationSegment>(() =>
    defaultSegment(partner.partnerKind),
  )
  const [dateRange, setDateRange] = useState<DepartureDateRange>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statementOpen, setStatementOpen] = useState(false)

  const hasDateFilter = Boolean(dateRange?.[0] || dateRange?.[1])
  const listParams = {
    departureDateFrom: dateRange?.[0],
    departureDateTo: dateRange?.[1],
    page,
    pageSize,
  }

  const { data: sourceResult, isLoading: sourceLoading } = useQuery({
    queryKey: ['partner-source-orders', partner.id, dateRange, page, pageSize],
    queryFn: () => listPartnerSourceOrders(partner.id, listParams),
    enabled: segment === 'source',
    ...operationalQueryOptions(),
  })

  const { data: outsourceResult, isLoading: outsourceLoading } = useQuery({
    queryKey: ['partner-outsource-orders', partner.id, dateRange, page, pageSize],
    queryFn: () => listPartnerOutsourceOrders(partner.id, listParams),
    enabled: segment === 'outsource',
    ...operationalQueryOptions(),
  })

  const isSource = segment === 'source'
  const isLoading = isSource ? sourceLoading : outsourceLoading
  const listTotal = isSource ? (sourceResult?.total ?? 0) : (outsourceResult?.total ?? 0)
  const listReady = isSource ? Boolean(sourceResult) : Boolean(outsourceResult)
  const emptyDescription = hasDateFilter
    ? isSource
      ? '当前筛选下暂无客源团单'
      : '当前筛选下暂无拼出资源'
    : isSource
      ? '该合作伙伴暂无客源团单'
      : '该合作伙伴暂无拼出资源'

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Segmented<CooperationSegment>
        value={segment}
        options={[
          { label: '客源', value: 'source' },
          { label: '拼出', value: 'outsource' },
        ]}
        onChange={(value) => {
          setSegment(value)
          setPage(1)
        }}
      />

      <Card style={{ marginBottom: 0 }}>
        <Flex justify="space-between" align="center" gap={12} wrap>
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
          {isSource ? (
            <Button icon={<ExportOutlined />} onClick={() => setStatementOpen(true)}>
              导出确认单
            </Button>
          ) : null}
        </Flex>
      </Card>

      {listReady && listTotal === 0 ? (
        <Empty description={emptyDescription} style={{ padding: '48px 0' }} />
      ) : isSource ? (
        <>
          <Row gutter={[16, 16]} role="group" aria-label="客源汇总">
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="客源单数"
                value={sourceResult?.summary.orderCount ?? 0}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="总人数"
                value={sourceResult?.summary.totalGuests ?? 0}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="原始团款合计"
                value={formatCents(sourceResult?.summary.totalGrossReceivableCents ?? 0)}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="优惠合计"
                value={formatCents(sourceResult?.summary.totalDiscountCents ?? 0)}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="结算金额合计"
                value={formatCents(sourceResult?.summary.totalNetReceivableCents ?? 0)}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="游客代收合计"
                value={formatCents(sourceResult?.summary.totalGuestCollectCents ?? 0)}
                loading={isLoading}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            loading={isLoading}
            columns={SOURCE_COLUMNS}
            dataSource={sourceResult?.items ?? []}
            scroll={{ x: 1600 }}
            pagination={{
              current: page,
              pageSize,
              total: sourceResult?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPageSize !== pageSize ? 1 : nextPage)
                setPageSize(nextPageSize)
              },
            }}
          />
        </>
      ) : (
        <>
          <Row gutter={[16, 16]} role="group" aria-label="拼出汇总">
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="资源行数"
                value={outsourceResult?.summary.resourceRowCount ?? 0}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="关联发团数"
                value={outsourceResult?.summary.departureCount ?? 0}
                loading={isLoading}
              />
            </Col>
            <Col xs={12} sm={8} xl={4}>
              <Statistic
                title="约定金额合计"
                value={formatCents(outsourceResult?.summary.totalAmountCents ?? 0)}
                loading={isLoading}
              />
            </Col>
          </Row>

          <Table
            rowKey="id"
            loading={isLoading}
            columns={OUTSOURCE_COLUMNS}
            dataSource={outsourceResult?.items ?? []}
            scroll={{ x: 990 }}
            pagination={{
              current: page,
              pageSize,
              total: outsourceResult?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPageSize !== pageSize ? 1 : nextPage)
                setPageSize(nextPageSize)
              },
            }}
          />
        </>
      )}

      <PartnerReconciliationStatementDrawer
        open={statementOpen}
        partner={partner}
        initialPeriod={
          dateRange?.[0] && dateRange?.[1] ? [dateRange[0], dateRange[1]] : null
        }
        onClose={() => setStatementOpen(false)}
      />
    </Space>
  )
}
