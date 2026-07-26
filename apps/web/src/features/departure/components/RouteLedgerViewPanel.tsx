import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, DatePicker, Empty, Select, Skeleton, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import type { RouteLedgerSourceOrderRow, RouteLedgerTotals } from '@/types/api'
import {
  getDepartureRouteLedger,
  listDepartureRouteNames,
} from '@/services/departure.service'
import { formatCents } from '../catalog'

type RouteLedgerViewPanelProps = {
  onSwitchToDepartureList: () => void
}

function formatTotalsHint(label: string, totals: RouteLedgerTotals): string {
  return [
    label,
    `${totals.orderCount} 单`,
    `${totals.guestCount} 人`,
    `原始团款 ${formatCents(totals.grossReceivableCents)}`,
    `结算金额 ${formatCents(totals.netReceivableCents)}`,
    `客户已收 ${formatCents(totals.partnerCollectedCents)}`,
    `我方代收 ${formatCents(totals.guestCollectCents)}`,
  ].join(' · ')
}

const LEDGER_COLUMNS: ColumnsType<RouteLedgerSourceOrderRow> = [
  {
    title: '发客客户',
    dataIndex: 'partnerName',
    width: 160,
  },
  {
    title: '人数',
    dataIndex: 'guestCount',
    width: 72,
    align: 'right',
  },
  {
    title: '原始团款',
    dataIndex: 'grossReceivableCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '结算金额',
    dataIndex: 'netReceivableCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '客户已收',
    dataIndex: 'partnerCollectedCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '我方代收',
    dataIndex: 'guestCollectCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '备注',
    dataIndex: 'notes',
    ellipsis: { showTitle: false },
    render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
  },
]

/**
 * 线路视图（#182 壳 + #183 账本主干）：
 * - 须先精确选定一条发团 `routeName`；
 * - 选定后按出团日 → 发团 → 客源只读表渲染；可选出团日区间。
 */
export function RouteLedgerViewPanel({ onSwitchToDepartureList }: RouteLedgerViewPanelProps) {
  const [routeName, setRouteName] = useState<string | undefined>()
  const [startDateRange, setStartDateRange] = useState<
    [string | undefined, string | undefined] | null
  >(null)

  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]

  const { data: routeNamesData, isLoading: routeNamesLoading } = useQuery({
    queryKey: ['departures', 'route-names'],
    queryFn: ({ signal }) => listDepartureRouteNames(signal),
  })

  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ['departures', 'route-ledger', routeName, startDateFrom, startDateTo],
    queryFn: ({ signal }) =>
      getDepartureRouteLedger(
        {
          routeName: routeName!,
          startDateFrom,
          startDateTo,
        },
        signal,
      ),
    enabled: Boolean(routeName),
  })

  const options = useMemo(
    () =>
      routeNamesData?.items.map((name) => ({
        value: name,
        label: name,
      })) ?? [],
    [routeNamesData?.items],
  )

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap>
        <Select
          showSearch
          allowClear
          virtual={false}
          placeholder="选择路线名称"
          aria-label="路线名称"
          style={{ width: 320 }}
          loading={routeNamesLoading}
          options={options}
          value={routeName}
          optionFilterProp="label"
          onChange={(value) => setRouteName(value)}
        />
        <DatePicker.RangePicker
          allowClear
          aria-label="出团日期"
          value={
            startDateRange
              ? [
                  startDateRange[0] ? dayjs(startDateRange[0]) : null,
                  startDateRange[1] ? dayjs(startDateRange[1]) : null,
                ]
              : null
          }
          onChange={(dates: [Dayjs | null, Dayjs | null] | null) => {
            if (!dates?.[0] && !dates?.[1]) {
              setStartDateRange(null)
              return
            }
            setStartDateRange([
              dates?.[0]?.format('YYYY-MM-DD'),
              dates?.[1]?.format('YYYY-MM-DD'),
            ])
          }}
        />
      </Space>

      {!routeName ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={4}>
              <Typography.Text>请先选择路线名称</Typography.Text>
              <Typography.Text type="secondary">
                线路视图需先选定一条路线，再按出团日查看该线下客源流水
              </Typography.Text>
            </Space>
          }
          style={{ padding: '48px 0' }}
        />
      ) : ledgerLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} style={{ padding: '24px 0' }} />
      ) : ledgerError ? (
        <Alert
          type="error"
          showIcon
          message="线路视图加载失败"
          action={
            <Typography.Link onClick={() => void refetchLedger()}>重试</Typography.Link>
          }
        />
      ) : !ledger?.dateBlocks.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space orientation="vertical" size={4}>
              <Typography.Text>「{routeName}」暂无匹配发团</Typography.Text>
              <Typography.Text type="secondary">
                可调整出团日期区间，或
                <Typography.Link onClick={onSwitchToDepartureList}>返回发团视图</Typography.Link>
              </Typography.Text>
            </Space>
          }
          style={{ padding: '48px 0' }}
        />
      ) : (
        <Space orientation="vertical" size={24} style={{ width: '100%' }}>
          {ledger.dateBlocks.map((block) => (
            <Space key={block.startDate} orientation="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {block.startDate}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {formatTotalsHint('日合计', block.totals)}
                </Typography.Text>
              </div>
              {block.departures.map((group) => (
                <Space
                  key={group.departureId}
                  orientation="vertical"
                  size={8}
                  style={{ width: '100%' }}
                >
                  <div>
                    <Typography.Text strong>
                      {group.departureNo}
                      {group.departureName ? ` · ${group.departureName}` : ''}
                    </Typography.Text>
                    <br />
                    <Typography.Text type="secondary">
                      {formatTotalsHint('发团合计', group.totals)}
                    </Typography.Text>
                  </div>
                  <Table<RouteLedgerSourceOrderRow>
                    size="small"
                    rowKey="id"
                    pagination={false}
                    columns={LEDGER_COLUMNS}
                    dataSource={group.sourceOrders}
                    locale={{ emptyText: '该发团暂无客源单' }}
                    scroll={{ x: 900 }}
                  />
                </Space>
              ))}
            </Space>
          ))}
        </Space>
      )}
    </Space>
  )
}
