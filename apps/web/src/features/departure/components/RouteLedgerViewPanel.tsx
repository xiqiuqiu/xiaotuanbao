import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Alert,
  DatePicker,
  Empty,
  Select,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import type {
  RouteLedgerOutsourceSummary,
  RouteLedgerSourceOrderRow,
  RouteLedgerTotals,
} from '@/types/api'
import {
  getDepartureRouteLedger,
  listDepartureRouteNames,
} from '@/services/departure.service'
import { formatCents } from '../catalog'
import { formatRouteLedgerInboundPriceFormula } from '../utils/route-ledger-inbound-price-formula'

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

/** 日/发团标题上的拼出汇总：单行写清承接方与金额；多拼出以列表呈现。 */
function OutsourceSummaryHint({ outsource }: { outsource: RouteLedgerOutsourceSummary }) {
  if (outsource.items.length === 0) {
    return null
  }

  if (outsource.items.length === 1) {
    const item = outsource.items[0]
    return (
      <Typography.Text type="secondary">
        拼出 · {item.supplierName} {formatCents(item.amountCents)}
      </Typography.Text>
    )
  }

  return (
    <Space orientation="vertical" size={0}>
      <Typography.Text type="secondary">
        拼出 {outsource.items.length} 项 · 合计 {formatCents(outsource.totalAmountCents)}
      </Typography.Text>
      {outsource.items.map((item) => (
        <Typography.Text key={item.id} type="secondary">
          · {item.supplierName} {formatCents(item.amountCents)}
        </Typography.Text>
      ))}
    </Space>
  )
}

function MoneyColumnTitle({ label, habitAlias }: { label: string; habitAlias: string }) {
  return (
    <Tooltip title={`习惯称：${habitAlias}`}>
      <span>{label}</span>
    </Tooltip>
  )
}

function formatGuestRepresentative(row: RouteLedgerSourceOrderRow): string {
  const name = row.guestRepresentativeName?.trim() || ''
  const phone = row.guestRepresentativePhone?.trim() || ''
  if (!name && !phone) {
    return ''
  }
  if (!name) {
    return phone
  }
  return phone ? `${name} ${phone}` : name
}

function formatGuestCount(row: RouteLedgerSourceOrderRow): string {
  if (row.childGuestCount > 0) {
    return `${row.guestCount}（${row.adultGuestCount}大${row.childGuestCount}小）`
  }
  return String(row.guestCount)
}

const LEDGER_COLUMNS: ColumnsType<RouteLedgerSourceOrderRow> = [
  {
    title: '发客客户',
    dataIndex: 'partnerName',
    width: 140,
  },
  {
    title: '游客代表',
    key: 'guestRepresentative',
    width: 160,
    render: (_value, row) => formatGuestRepresentative(row),
  },
  {
    title: '人数',
    key: 'guestCount',
    width: 110,
    align: 'right',
    render: (_value, row) => formatGuestCount(row),
  },
  {
    title: (
      <Tooltip title="单价×人数，只读展示；金额以原始团款为准">
        <span>拼入价</span>
      </Tooltip>
    ),
    key: 'inboundPriceFormula',
    width: 140,
    render: (_value, row) => formatRouteLedgerInboundPriceFormula(row),
  },
  {
    title: <MoneyColumnTitle label="原始团款" habitAlias="拼入合计" />,
    dataIndex: 'grossReceivableCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: <MoneyColumnTitle label="结算金额" habitAlias="实际应收" />,
    dataIndex: 'netReceivableCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: <MoneyColumnTitle label="客户已收" habitAlias="客户已收押金" />,
    dataIndex: 'partnerCollectedCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: <MoneyColumnTitle label="我方代收" habitAlias="游客代收" />,
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
 * 线路视图（#182 壳 + #183 账本主干 + #184 拼出汇总 + #185 扫读抛光）：
 * - 须先精确选定一条发团 `routeName`；
 * - 选定后按出团日 → 发团 → 客源只读表渲染；可选出团日区间；
 * - 拼出成本挂在日/发团标题，不进客源列；
 * - 客源行含游客代表、只读拼入价算式；金额列规范名 + tooltip 习惯称；
 * - 点击团号/客源行跳转既有发团详情与客源管理路径，视图内不可改价改人数。
 */
export function RouteLedgerViewPanel({ onSwitchToDepartureList }: RouteLedgerViewPanelProps) {
  const navigate = useNavigate()
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
                <div>
                  <OutsourceSummaryHint outsource={block.outsource} />
                </div>
              </div>
              {block.departures.map((group) => (
                <Space
                  key={group.departureId}
                  orientation="vertical"
                  size={8}
                  style={{ width: '100%' }}
                >
                  <div>
                    <Space size={4} wrap>
                      <Link
                        className={nameLinkStyles.nameLink}
                        to="/departure/$departureId"
                        params={{ departureId: group.departureId }}
                        search={{ tab: 'overview' }}
                      >
                        {group.departureNo}
                      </Link>
                      {group.departureName ? (
                        <Typography.Text strong>· {group.departureName}</Typography.Text>
                      ) : null}
                    </Space>
                    <br />
                    <Typography.Text type="secondary">
                      {formatTotalsHint('发团合计', group.totals)}
                    </Typography.Text>
                    <div>
                      <OutsourceSummaryHint outsource={group.outsource} />
                    </div>
                  </div>
                  <Table<RouteLedgerSourceOrderRow>
                    size="small"
                    rowKey="id"
                    pagination={false}
                    columns={LEDGER_COLUMNS}
                    dataSource={group.sourceOrders}
                    locale={{ emptyText: '该发团暂无客源单' }}
                    scroll={{ x: 1200 }}
                    onRow={(record) => ({
                      style: { cursor: 'pointer' },
                      onClick: () => {
                        void navigate({
                          to: '/departure/$departureId',
                          params: { departureId: record.departureId },
                          search: { tab: 'sourceOrders' },
                        })
                      },
                    })}
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
