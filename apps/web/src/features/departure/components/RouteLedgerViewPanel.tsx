import type { ReactNode } from 'react'
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
  RouteLedgerDateBlock,
  RouteLedgerDepartureGroup,
  RouteLedgerOutsourceSummary,
  RouteLedgerRouteGroup,
  RouteLedgerSourceOrderRow,
  RouteLedgerTotals,
} from '@/types/api'
import {
  getDepartureRouteLedger,
  listDepartureRouteNames,
} from '@/services/departure.service'
import { formatCents } from '../catalog'
import {
  encodeDepartureListReturn,
  toDepartureListReturnState,
  type DepartureListSearch,
} from '../utils/departure-list-search'
import { formatRouteLedgerInboundPriceFormula } from '../utils/route-ledger-inbound-price-formula'
import { resolveRouteLedgerQueryGate } from '../utils/route-ledger-query'

type RouteLedgerViewPanelProps = {
  routeName?: string
  startDateRange: [string | undefined, string | undefined] | null
  onRouteNameChange: (value?: string) => void
  onStartDateRangeChange: (
    value: [string | undefined, string | undefined] | null,
  ) => void
  onSwitchToDepartureList: () => void
  listReturnSearch?: DepartureListSearch
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

/** 日/路线段/发团标题上的拼出汇总：单行写清承接方与金额；多拼出以列表呈现。 */
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

function DepartureGroupSection({
  group,
  onSourceOrderClick,
}: {
  group: RouteLedgerDepartureGroup
  onSourceOrderClick: (departureId: string) => void
}) {
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
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
          onClick: () => onSourceOrderClick(record.departureId),
        })}
      />
    </Space>
  )
}

function RouteGroupSection({
  routeGroup,
  showRouteChrome,
  onSourceOrderClick,
}: {
  routeGroup: RouteLedgerRouteGroup
  showRouteChrome: boolean
  onSourceOrderClick: (departureId: string) => void
}) {
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {showRouteChrome ? (
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {routeGroup.routeName}
          </Typography.Title>
          <Typography.Text type="secondary">
            {formatTotalsHint('路线合计', routeGroup.totals)}
          </Typography.Text>
          <div>
            <OutsourceSummaryHint outsource={routeGroup.outsource} />
          </div>
        </div>
      ) : null}
      {routeGroup.departures.map((group) => (
        <DepartureGroupSection
          key={group.departureId}
          group={group}
          onSourceOrderClick={onSourceOrderClick}
        />
      ))}
    </Space>
  )
}

function DateBlockSection({
  block,
  showRouteChrome,
  onSourceOrderClick,
}: {
  block: RouteLedgerDateBlock
  showRouteChrome: boolean
  onSourceOrderClick: (departureId: string) => void
}) {
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
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
      {block.routes.map((routeGroup) => (
        <RouteGroupSection
          key={routeGroup.routeName}
          routeGroup={routeGroup}
          showRouteChrome={showRouteChrome}
          onSourceOrderClick={onSourceOrderClick}
        />
      ))}
    </Space>
  )
}

/**
 * 线路视图（#183 / #221）：双轴筛选（路线和/或出团日期），筛选以发团管理 URL 为真相源。
 * - 有路线：日 → 发团/客源（不展示路线段 chrome）
 * - 仅日期：日 → 路线段 → 发团/客源
 */
export function RouteLedgerViewPanel({
  routeName,
  startDateRange,
  onRouteNameChange,
  onStartDateRangeChange,
  onSwitchToDepartureList,
  listReturnSearch,
}: RouteLedgerViewPanelProps) {
  const navigate = useNavigate()
  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]
  const queryGate = resolveRouteLedgerQueryGate({
    routeName,
    startDateFrom,
    startDateTo,
  })
  const showRouteChrome = queryGate.status === 'ready' && !queryGate.params.routeName

  const { data: routeNamesData, isLoading: routeNamesLoading } = useQuery({
    queryKey: ['departures', 'route-names'],
    queryFn: ({ signal }) => listDepartureRouteNames(signal),
  })

  const {
    data: ledger,
    isLoading: ledgerLoading,
    isError: ledgerError,
    error: ledgerQueryError,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: [
      'departures',
      'route-ledger',
      queryGate.status === 'ready' ? queryGate.params : null,
    ],
    queryFn: ({ signal }) => {
      if (queryGate.status !== 'ready') {
        throw new Error('线路视图查询条件未就绪')
      }
      return getDepartureRouteLedger(queryGate.params, signal)
    },
    enabled: queryGate.status === 'ready',
  })

  const options =
    routeNamesData?.items.map((name) => ({
      value: name,
      label: name,
    })) ?? []

  const apiErrorMessage =
    ledgerQueryError && typeof ledgerQueryError === 'object' && 'message' in ledgerQueryError
      ? String((ledgerQueryError as { message?: unknown }).message ?? '')
      : ''

  const openSourceOrders = (departureId: string) => {
    void navigate({
      to: '/departure/$departureId',
      params: { departureId },
      search: {
        tab: 'sourceOrders',
        ...(listReturnSearch
          ? { listReturn: encodeDepartureListReturn(listReturnSearch) }
          : {}),
      },
      state: listReturnSearch
        ? (toDepartureListReturnState(listReturnSearch) as never)
        : undefined,
    })
  }

  let body: ReactNode
  if (queryGate.status === 'empty') {
    body = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text>{queryGate.message}</Typography.Text>
            <Typography.Text type="secondary">{queryGate.detail}</Typography.Text>
          </Space>
        }
        style={{ padding: '48px 0' }}
      />
    )
  } else if (queryGate.status === 'invalid') {
    body = (
      <Alert type="warning" showIcon title={queryGate.message} style={{ marginTop: 8 }} />
    )
  } else if (ledgerLoading) {
    body = <Skeleton active paragraph={{ rows: 6 }} style={{ padding: '24px 0' }} />
  } else if (ledgerError) {
    body = (
      <Alert
        type="error"
        showIcon
        title="线路视图加载失败"
        description={apiErrorMessage || undefined}
        action={
          <Typography.Link onClick={() => void refetchLedger()}>重试</Typography.Link>
        }
      />
    )
  } else if (!ledger?.dateBlocks.length) {
    const emptyTitle = routeName
      ? `「${routeName}」暂无匹配发团`
      : '所选日期范围内暂无匹配发团'
    body = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text>{emptyTitle}</Typography.Text>
            <Typography.Text type="secondary">
              可调整筛选条件，或
              <Typography.Link onClick={onSwitchToDepartureList}>返回发团视图</Typography.Link>
            </Typography.Text>
          </Space>
        }
        style={{ padding: '48px 0' }}
      />
    )
  } else {
    body = (
      <Space orientation="vertical" size={24} style={{ width: '100%' }}>
        {ledger.dateBlocks.map((block) => (
          <DateBlockSection
            key={block.startDate}
            block={block}
            showRouteChrome={showRouteChrome}
            onSourceOrderClick={openSourceOrders}
          />
        ))}
      </Space>
    )
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap>
        <Select
          showSearch={{ optionFilterProp: 'label' }}
          allowClear
          virtual={false}
          placeholder="选择路线名称"
          aria-label="路线名称"
          style={{ width: 320 }}
          loading={routeNamesLoading}
          options={options}
          value={routeName}
          onChange={(value) => onRouteNameChange(value)}
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
              onStartDateRangeChange(null)
              return
            }
            onStartDateRangeChange([
              dates?.[0]?.format('YYYY-MM-DD'),
              dates?.[1]?.format('YYYY-MM-DD'),
            ])
          }}
        />
      </Space>
      {body}
    </Space>
  )
}
