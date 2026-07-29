import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Popover,
  Select,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import type {
  RouteLedgerDepartureGroup,
  RouteLedgerOutsourceSummary,
  RouteLedgerSourceOrderRow,
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
import { formatRouteLedgerUnitPriceYuan } from '../utils/route-ledger-inbound-price-formula'
import { resolveRouteLedgerQueryGate } from '../utils/route-ledger-query'
import {
  formatRouteLedgerChineseDate,
  formatRouteLedgerReportTitlePrefix,
  listRouteLedgerReportStack,
} from '../utils/route-ledger-reports'
import {
  flattenRouteLedgerDeparture,
  type RouteLedgerTableRow,
} from '../utils/route-ledger-table-rows'
import styles from './RouteLedgerViewPanel.module.css'

const ROUTE_LEDGER_TABLE_SCROLL_X = 1200

type RouteLedgerViewPanelProps = {
  viewNavigation?: ReactNode
  routeName?: string
  startDateRange: [string | undefined, string | undefined] | null
  onRouteNameChange: (value?: string) => void
  onStartDateRangeChange: (
    value: [string | undefined, string | undefined] | null,
  ) => void
  onSwitchToDepartureList: () => void
  listReturnSearch?: DepartureListSearch
}

function MoneyColumnTitle({ label, habitAlias }: { label: string; habitAlias: string }) {
  return (
    <Tooltip title={`习惯称：${habitAlias}`}>
      <span>{label}</span>
    </Tooltip>
  )
}

function formatGuestRepresentativeName(row: RouteLedgerSourceOrderRow): string {
  return row.guestRepresentativeName?.trim() || '-'
}

function formatGuestPhone(row: RouteLedgerSourceOrderRow): string {
  return row.guestRepresentativePhone?.trim() || '-'
}

/** 发团日报右上角拼出汇总：只汇总当前发团，明细按需展开。 */
function OutsourceSummary({ outsource }: { outsource: RouteLedgerOutsourceSummary }) {
  const { token } = theme.useToken()
  if (outsource.items.length === 0) {
    return null
  }

  return (
    <Flex className={styles.outsourceSummary} align="center" gap={token.marginXS}>
      <Typography.Text>拼出</Typography.Text>
      <Typography.Text>
        {outsource.items.length} 项 · {formatCents(outsource.totalAmountCents)}
      </Typography.Text>
      <Popover
        placement="bottomRight"
        trigger="click"
        title="拼出明细"
        content={
          <div className={styles.outsourcePopover}>
            <div className={styles.outsourceItems}>
              {outsource.items.map((item) => (
                <div className={styles.outsourceItem} key={item.id}>
                  <Typography.Text className={styles.outsourceSupplier}>
                    {item.supplierName}
                  </Typography.Text>
                  <Typography.Text type="secondary" className={styles.outsourceTitle}>
                    {item.title || '-'}
                  </Typography.Text>
                  <Typography.Text className={styles.outsourceAmount}>
                    {formatCents(item.amountCents)}
                  </Typography.Text>
                </div>
              ))}
            </div>
            <Typography.Text type="secondary" className={styles.outsourceFooter}>
              共 {outsource.items.length} 项
            </Typography.Text>
          </div>
        }
      >
        <Button type="link" size="small" className={styles.outsourceDetailButton}>
          查看明细
        </Button>
      </Popover>
    </Flex>
  )
}

function SummaryMoney({ value }: { value: number }) {
  return <span className={styles.summaryValue}>{formatCents(value)}</span>
}

/** 一团一份完整日报表（#221）：表头含团号；合计/拼出仅本发团。 */
function DepartureLedgerReport({
  startDate,
  routeName,
  departure,
  listReturnSearch,
}: {
  startDate: string
  routeName: string
  departure: RouteLedgerDepartureGroup
  listReturnSearch?: DepartureListSearch
}) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const rows = useMemo(() => flattenRouteLedgerDeparture(departure), [departure])
  const totals = departure.totals
  const titlePrefix = formatRouteLedgerReportTitlePrefix(startDate, routeName)

  const columns: ColumnsType<RouteLedgerTableRow> = useMemo(
    () => [
      {
        title: '序号',
        dataIndex: 'seq',
        width: 52,
        align: 'center',
      },
      {
        title: '发客客户',
        dataIndex: 'partnerName',
        width: 120,
      },
      {
        title: '游客代表',
        key: 'guestName',
        width: 96,
        render: (_value, row) => formatGuestRepresentativeName(row),
      },
      {
        title: '电话',
        key: 'phone',
        width: 120,
        render: (_value, row) => formatGuestPhone(row),
      },
      {
        title: (
          <Tooltip title="拼入单价（元），只读；金额以原始团款为准">
            <span>拼入价</span>
          </Tooltip>
        ),
        key: 'inboundUnitPrice',
        children: [
          {
            title: '成人',
            key: 'adultUnitPrice',
            width: 72,
            align: 'right',
            render: (_value, row) =>
              row.adultGuestCount > 0
                ? formatRouteLedgerUnitPriceYuan(row.adultUnitPriceCents)
                : '-',
          },
          {
            title: '儿童',
            key: 'childUnitPrice',
            width: 72,
            align: 'right',
            render: (_value, row) =>
              row.childGuestCount > 0
                ? formatRouteLedgerUnitPriceYuan(row.childUnitPriceCents)
                : '-',
          },
        ],
      },
      {
        title: '人数',
        key: 'guestCount',
        children: [
          {
            title: '成人',
            key: 'adultGuestCount',
            width: 64,
            align: 'right',
            render: (_value, row) => row.adultGuestCount,
          },
          {
            title: '儿童',
            key: 'childGuestCount',
            width: 64,
            align: 'right',
            render: (_value, row) => row.childGuestCount,
          },
        ],
      },
      {
        title: <MoneyColumnTitle label="原始团款" habitAlias="拼入合计" />,
        dataIndex: 'grossReceivableCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: <MoneyColumnTitle label="我方代收" habitAlias="游客代收" />,
        dataIndex: 'guestCollectCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: <MoneyColumnTitle label="客户已收" habitAlias="客户已收押金" />,
        dataIndex: 'partnerCollectedCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: <MoneyColumnTitle label="结算金额" habitAlias="实际应收" />,
        dataIndex: 'netReceivableCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '备注',
        dataIndex: 'notes',
        width: 96,
        ellipsis: { showTitle: false },
        render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
      },
    ],
    [],
  )

  return (
    <div className={styles.dayBlock}>
      <Table<RouteLedgerTableRow>
        className={styles.dayTable}
        size="small"
        bordered
        pagination={false}
        rowKey="id"
        columns={columns}
        dataSource={rows}
        scroll={{ x: ROUTE_LEDGER_TABLE_SCROLL_X }}
        locale={{ emptyText: '暂无客源单' }}
        styles={{ title: { padding: 0 } }}
        title={() => (
          <Flex
            className={styles.dateBand}
            align="flex-start"
            justify="space-between"
            gap={16}
            wrap="wrap"
          >
            <Flex className={styles.reportIdentity} vertical gap={4}>
              <Typography.Text strong className={styles.reportTitle}>
                {titlePrefix}
                {' · '}
                <Link
                  className={`${nameLinkStyles.nameLink} ${styles.reportNumberLink}`}
                  to="/departure/$departureId"
                  params={{ departureId: departure.departureId }}
                  search={{ tab: 'overview' }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {departure.departureNo}
                </Link>
              </Typography.Text>
              {departure.departureName ? (
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {departure.departureName}
                </Typography.Text>
              ) : null}
            </Flex>
            <OutsourceSummary outsource={departure.outsource} />
          </Flex>
        )}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => {
            void navigate({
              to: '/departure/$departureId',
              params: { departureId: record.departureId },
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
          },
        })}
        summary={() => {
          const adultGuestTotal = rows.reduce((sum, row) => sum + row.adultGuestCount, 0)
          const childGuestTotal = rows.reduce((sum, row) => sum + row.childGuestCount, 0)
          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <span className={styles.summaryLabel}>合计</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Typography.Text type="secondary">
                    {totals.orderCount} 单
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} />
                <Table.Summary.Cell index={5} />
                <Table.Summary.Cell index={6} align="right">
                  <span className={styles.summaryValue}>{adultGuestTotal}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <span className={styles.summaryValue}>{childGuestTotal}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <SummaryMoney value={totals.grossReceivableCents} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">
                  <SummaryMoney value={totals.guestCollectCents} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right">
                  <SummaryMoney value={totals.partnerCollectedCents} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="right">
                  <SummaryMoney value={totals.netReceivableCents} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={12} />
              </Table.Summary.Row>
            </Table.Summary>
          )
        }}
      />
    </div>
  )
}

/**
 * 线路视图（#183 / #221）：
 * - 双轴筛选（路线和/或出团日期），筛选以发团管理 URL 为真相源；
 * - 一团一份完整日报表；换日轻量分隔；不做日/路线跨团加总。
 */
export function RouteLedgerViewPanel({
  viewNavigation,
  routeName,
  startDateRange,
  onRouteNameChange,
  onStartDateRangeChange,
  onSwitchToDepartureList,
  listReturnSearch,
}: RouteLedgerViewPanelProps) {
  const startDateFrom = startDateRange?.[0]
  const startDateTo = startDateRange?.[1]
  const queryGate = resolveRouteLedgerQueryGate({
    routeName,
    startDateFrom,
    startDateTo,
  })

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

  const reportStack = useMemo(
    () => (ledger ? listRouteLedgerReportStack(ledger.dateBlocks) : []),
    [ledger],
  )

  const apiErrorMessage =
    ledgerQueryError && typeof ledgerQueryError === 'object' && 'message' in ledgerQueryError
      ? String((ledgerQueryError as { message?: unknown }).message ?? '')
      : ''

  let body: ReactNode
  let hasReportResults = false
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
        style={{ padding: '8px 0' }}
      />
    )
  } else if (queryGate.status === 'invalid') {
    body = <Alert type="warning" showIcon title={queryGate.message} />
  } else if (ledgerLoading) {
    body = <Skeleton active paragraph={{ rows: 6 }} />
  } else if (ledgerError) {
    body = (
      <Alert
        type="error"
        showIcon
        title="线路视图加载失败"
        description={apiErrorMessage || '网络异常，请稍后重试'}
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
        style={{ padding: '8px 0' }}
      />
    )
  } else {
    hasReportResults = true
    body = (
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        {reportStack.map((item) => {
          if (item.type === 'date-separator') {
            return (
              <Typography.Title
                key={`sep-${item.startDate}`}
                level={5}
                style={{ margin: 0 }}
              >
                {formatRouteLedgerChineseDate(item.startDate)}
              </Typography.Title>
            )
          }
          return (
            <DepartureLedgerReport
              key={item.departure.departureId}
              startDate={item.startDate}
              routeName={item.routeName}
              departure={item.departure}
              listReturnSearch={listReturnSearch}
            />
          )
        })}
      </Space>
    )
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card className={styles.filterWorkspace} styles={{ body: { padding: 0 } }}>
        {viewNavigation}
        <div className={styles.filterArea}>
          <Form layout="inline" className={styles.filterForm} colon={false}>
            <Form.Item label="路线名称">
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                allowClear
                placeholder="选择路线名称"
                aria-label="路线名称"
                style={{ width: 280 }}
                loading={routeNamesLoading}
                options={options}
                value={routeName}
                onChange={(value) => onRouteNameChange(value)}
              />
            </Form.Item>
            <Form.Item label="出团日期">
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
            </Form.Item>
          </Form>
        </div>
        {!hasReportResults ? <div className={styles.stateArea}>{body}</div> : null}
      </Card>
      {hasReportResults ? body : null}
    </Space>
  )
}
