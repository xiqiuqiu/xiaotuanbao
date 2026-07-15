import { useState } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  Col,
  DatePicker,
  Empty,
  Flex,
  Row,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PartnerKind } from '@xiaotuanbao/shared'
import type { PartnerSourceOrderItem, PartnerSummary } from '@/types/api'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listPartnerSourceOrders } from '@/services/source-order.service'
import { formatCents } from '@/features/departure/catalog'
import { buildDepartureDateRangePresets } from '@/utils/dateRangePresets'
import { PartnerReconciliationStatementDrawer } from './PartnerReconciliationStatementDrawer'

type DepartureDateRange = [string | undefined, string | undefined] | null

const COLUMNS: ColumnsType<PartnerSourceOrderItem> = [
  { title: '出团日期', dataIndex: 'departureStartDate', width: 110 },
  {
    title: '发团',
    key: 'departure',
    width: 220,
    render: (_: unknown, record) => (
      <Link
        to="/departure/$departureId"
        params={{ departureId: record.departureId }}
        search={{ tab: 'overview' }}
      >
        <Space orientation="vertical" size={0}>
          <span>{record.departureNo}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.routeName}
          </Typography.Text>
        </Space>
      </Link>
    ),
  },
  { title: '客源单', dataIndex: 'displayName', width: 200, ellipsis: true },
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
    ellipsis: true,
    render: (value: string | null) => value ?? '-',
  },
]

interface PartnerSourceOrdersTabProps {
  partner: PartnerSummary
}

export function PartnerSourceOrdersTab({ partner }: PartnerSourceOrdersTabProps) {
  const [dateRange, setDateRange] = useState<DepartureDateRange>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statementOpen, setStatementOpen] = useState(false)

  const isPeerOnly = partner.partnerKind === PartnerKind.PEER

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['partner-source-orders', partner.id, dateRange, page, pageSize],
    queryFn: () =>
      listPartnerSourceOrders(partner.id, {
        departureDateFrom: dateRange?.[0],
        departureDateTo: dateRange?.[1],
        page,
        pageSize,
      }),
    enabled: !isPeerOnly,
    ...operationalQueryOptions(),
  })

  if (isPeerOnly) {
    return (
      <Empty
        description="该合作伙伴为纯承接方，暂无合作团单"
        style={{ padding: '48px 0' }}
      />
    )
  }

  const hasDateFilter = Boolean(dateRange?.[0] || dateRange?.[1])
  const summary = listResult?.summary

  if (listResult && listResult.total === 0 && !hasDateFilter) {
    return (
      <Empty description="该合作伙伴暂无客源团单" style={{ padding: '48px 0' }} />
    )
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <DatePicker.RangePicker
          allowClear
          allowEmpty={[true, true]}
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
        <Button icon={<ExportOutlined />} onClick={() => setStatementOpen(true)}>
          导出确认单
        </Button>
      </Flex>

      <Row gutter={[16, 16]} role="group" aria-label="合作团单汇总">
        <Col xs={12} sm={8} xl={4}>
          <Statistic title="客源单数" value={summary?.orderCount ?? 0} loading={isLoading} />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic title="总人数" value={summary?.totalGuests ?? 0} loading={isLoading} />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="原始团款合计"
            value={formatCents(summary?.totalGrossReceivableCents ?? 0)}
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="优惠合计"
            value={formatCents(summary?.totalDiscountCents ?? 0)}
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="结算金额合计"
            value={formatCents(summary?.totalNetReceivableCents ?? 0)}
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={8} xl={4}>
          <Statistic
            title="游客代收合计"
            value={formatCents(summary?.totalGuestCollectCents ?? 0)}
            loading={isLoading}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={COLUMNS}
        dataSource={listResult?.items ?? []}
        scroll={{ x: 1400 }}
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
