import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Flex, Space, Table, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import type {
  RouteLedgerDepartureGroup,
  RouteLedgerOutsourceLine,
  RouteLedgerResourceRow,
  RouteLedgerSourceOrderRow,
} from '@/types/api'
import { formatCents } from '../../catalog'
import {
  encodeDepartureListReturn,
  toDepartureListReturnState,
  type DepartureListSearch,
} from '../../utils/departure-list-search'
import {
  formatRouteLedgerUnitPriceYuan,
  summarizeRouteLedgerUnitPrices,
} from '../../utils/route-ledger-inbound-price-formula'
import { formatRouteLedgerReportTitlePrefix } from '../../utils/route-ledger-reports'
import {
  flattenRouteLedgerDeparture,
  type RouteLedgerTableRow,
} from '../../utils/route-ledger-table-rows'
import { LedgerModeSwitcher, type LedgerViewMode } from './LedgerModeSwitcher'
import { RouteLedgerFinanceSummary } from './RouteLedgerFinanceSummary'
import styles from './RouteLedgerReport.module.css'

const INCOME_TABLE_SCROLL_X = 1320
const COST_TABLE_SCROLL_X = 920
const OUTSOURCE_TABLE_SCROLL_X = 720

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

function IncomePanel({
  rows,
  totals,
  listReturnSearch,
}: {
  rows: RouteLedgerTableRow[]
  totals: RouteLedgerDepartureGroup['totals']
  listReturnSearch?: DepartureListSearch
}) {
  const navigate = useNavigate()

  const columns: ColumnsType<RouteLedgerTableRow> = useMemo(
    () => [
      { title: '序号', dataIndex: 'seq', width: 52, align: 'center' },
      { title: '发客客户', dataIndex: 'partnerName', width: 120 },
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

  const adultGuestTotal = rows.reduce((sum, row) => sum + row.adultGuestCount, 0)
  const childGuestTotal = rows.reduce((sum, row) => sum + row.childGuestCount, 0)
  const unitPriceSummary = useMemo(() => summarizeRouteLedgerUnitPrices(rows), [rows])

  return (
    <Table<RouteLedgerTableRow>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={rows}
      scroll={{ x: INCOME_TABLE_SCROLL_X }}
      locale={{ emptyText: '暂无客源单' }}
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
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <span className={styles.summaryLabel}>合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <Typography.Text type="secondary">{totals.orderCount} 单</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} />
            <Table.Summary.Cell index={3} />
            <Table.Summary.Cell index={4} align="right">
              <span className={styles.summaryValue}>{adultGuestTotal}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <span className={styles.summaryValue}>{childGuestTotal}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">
              <span className={styles.summaryValue}>{unitPriceSummary.adultUnitPriceYuan}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <span className={styles.summaryValue}>{unitPriceSummary.childUnitPriceYuan}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right">
              <span className={styles.summaryValue}>{formatCents(totals.grossReceivableCents)}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={9} align="right">
              <span className={styles.summaryValue}>{formatCents(totals.guestCollectCents)}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={10} align="right">
              <span className={styles.summaryValue}>
                {formatCents(totals.partnerCollectedCents)}
              </span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={11} align="right">
              <span className={styles.summaryValue}>{formatCents(totals.netReceivableCents)}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={12} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}

function CostPanel({ rows }: { rows: RouteLedgerResourceRow[] }) {
  const totalAmountCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.amountCents, 0),
    [rows],
  )

  const columns: ColumnsType<RouteLedgerResourceRow> = [
    { title: '序号', dataIndex: 'seq', width: 52, align: 'center' },
    { title: '归属日程', dataIndex: 'segmentLabel', width: 120 },
    { title: '资源类型', dataIndex: 'resourceKindLabel', width: 88 },
    { title: '项目', dataIndex: 'title', width: 180, ellipsis: { showTitle: false } },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      width: 160,
      ellipsis: { showTitle: false },
      render: (value: string) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
    {
      title: '金额',
      dataIndex: 'amountCents',
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
  ]

  return (
    <Table<RouteLedgerResourceRow>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={rows}
      scroll={{ x: COST_TABLE_SCROLL_X }}
      locale={{ emptyText: '暂无执行成本资源' }}
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <span className={styles.summaryLabel}>合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <Typography.Text type="secondary">{rows.length} 项</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} colSpan={3} />
            <Table.Summary.Cell index={5} align="right">
              <span className={styles.summaryValue}>{formatCents(totalAmountCents)}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}

type OutsourceRow = RouteLedgerOutsourceLine & { seq: number }

function OutsourcePanel({ items }: { items: RouteLedgerOutsourceLine[] }) {
  const rows = useMemo(
    () => items.map((item, index) => ({ ...item, seq: index + 1 })),
    [items],
  )
  const totalAmountCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.amountCents, 0),
    [rows],
  )

  const columns: ColumnsType<OutsourceRow> = [
    { title: '序号', dataIndex: 'seq', width: 52, align: 'center' },
    {
      title: '拼出方',
      dataIndex: 'supplierName',
      width: 160,
      ellipsis: { showTitle: false },
      render: (value: string) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
    {
      title: '说明',
      dataIndex: 'title',
      width: 200,
      ellipsis: { showTitle: false },
      render: (value: string) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
    {
      title: '金额',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '备注',
      key: 'notes',
      width: 96,
      render: () => '-',
    },
  ]

  return (
    <Table<OutsourceRow>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={rows}
      locale={{ emptyText: '本团暂无拼出记录' }}
      scroll={{ x: OUTSOURCE_TABLE_SCROLL_X }}
      summary={
        rows.length > 0
          ? () => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <span className={styles.summaryLabel}>合计</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>
                    <Typography.Text type="secondary">{rows.length} 项</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} align="right">
                    <span className={styles.summaryValue}>{formatCents(totalAmountCents)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              </Table.Summary>
            )
          : undefined
      }
    />
  )
}

export function RouteLedgerDepartureReport({
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
  const [mode, setMode] = useState<LedgerViewMode>('income')
  const incomeRows = useMemo(() => flattenRouteLedgerDeparture(departure), [departure])
  const titlePrefix = formatRouteLedgerReportTitlePrefix(startDate, routeName)

  return (
    <div className={styles.reportBlock}>
      <div className={styles.reportHeader}>
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space size={12} wrap align="center">
            <Typography.Text strong className={styles.reportTitle}>
              {titlePrefix}
              {' · '}
              <Link
                className={`${nameLinkStyles.nameLink} ${styles.reportNumberLink}`}
                to="/departure/$departureId"
                params={{ departureId: departure.departureId }}
                search={{ tab: 'overview' }}
              >
                {departure.departureNo}
              </Link>
            </Typography.Text>
            <LedgerModeSwitcher value={mode} onChange={setMode} />
          </Space>
          <RouteLedgerFinanceSummary departure={departure} />
        </Flex>
      </div>

      {mode === 'income' ? (
        <IncomePanel
          rows={incomeRows}
          totals={departure.totals}
          listReturnSearch={listReturnSearch}
        />
      ) : null}
      {mode === 'cost' ? <CostPanel rows={departure.costResources} /> : null}
      {mode === 'outsource' ? <OutsourcePanel items={departure.outsource.items} /> : null}
    </div>
  )
}
