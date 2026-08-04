import { useMemo, useState } from 'react'
import { Flex, Space, Table, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import {
  formatRouteLedgerUnitPriceYuan,
  summarizeRouteLedgerUnitPrices,
} from '../../utils/route-ledger-inbound-price-formula'
import { LedgerModeSwitcher } from './ModeSwitcher'
import { FinanceSummaryStrip, DateSeparator } from './parts'
import {
  COST_SCOPE_COLUMN_LABEL,
  formatCents,
  formatReportTitlePrefix,
  type LedgerViewMode,
  type ProtoCostRow,
  type ProtoDepartureReport,
  type ProtoIncomeRow,
  type ProtoOutsourceItem,
} from './shared'
import styles from './route-ledger-mode-prototype.module.css'

function sumIncomeField(rows: ProtoIncomeRow[], field: keyof ProtoIncomeRow): number {
  return rows.reduce((sum, row) => sum + (row[field] as number), 0)
}

function IncomePanel({ rows }: { rows: ProtoIncomeRow[] }) {
  const totals = useMemo(
    () => ({
      orderCount: rows.length,
      adultGuestCount: sumIncomeField(rows, 'adultGuestCount'),
      childGuestCount: sumIncomeField(rows, 'childGuestCount'),
      grossReceivableCents: sumIncomeField(rows, 'grossReceivableCents'),
      guestCollectCents: sumIncomeField(rows, 'guestCollectCents'),
      partnerCollectedCents: sumIncomeField(rows, 'partnerCollectedCents'),
      netReceivableCents: sumIncomeField(rows, 'netReceivableCents'),
    }),
    [rows],
  )

  const unitPriceSummary = useMemo(() => summarizeRouteLedgerUnitPrices(rows), [rows])

  const columns: ColumnsType<ProtoIncomeRow> = [
    { title: '序号', dataIndex: 'seq', width: 52, align: 'center' },
    { title: '发客客户', dataIndex: 'partnerName', width: 120 },
    { title: '游客代表', dataIndex: 'guestName', width: 96 },
    { title: '电话', dataIndex: 'phone', width: 120 },
    {
      title: '人数',
      children: [
        { title: '成人', dataIndex: 'adultGuestCount', width: 64, align: 'right' },
        { title: '儿童', dataIndex: 'childGuestCount', width: 64, align: 'right' },
      ],
    },
    {
      title: (
        <Tooltip title="拼入单价（元），只读；金额以原始团款为准">
          <span>拼入价</span>
        </Tooltip>
      ),
      children: [
        {
          title: '成人',
          key: 'adultUnit',
          width: 72,
          align: 'right',
          render: (_value, row) =>
            row.adultGuestCount > 0
              ? formatRouteLedgerUnitPriceYuan(row.adultUnitPriceCents)
              : '-',
        },
        {
          title: '儿童',
          key: 'childUnit',
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
      title: '原始团款',
      dataIndex: 'grossReceivableCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '我方代收',
      dataIndex: 'guestCollectCents',
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
      title: '结算金额',
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
  ]

  return (
    <Table<ProtoIncomeRow>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={rows}
      scroll={{ x: 1320 }}
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
              <span className={styles.summaryValue}>{totals.adultGuestCount}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <span className={styles.summaryValue}>{totals.childGuestCount}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">
              <span className={styles.summaryValue}>{unitPriceSummary.adultUnitPriceYuan}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <span className={styles.summaryValue}>{unitPriceSummary.childUnitPriceYuan}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right">
              <span className={styles.summaryValue}>
                {formatCents(totals.grossReceivableCents)}
              </span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={9} align="right">
              <span className={styles.summaryValue}>
                {formatCents(totals.guestCollectCents)}
              </span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={10} align="right">
              <span className={styles.summaryValue}>
                {formatCents(totals.partnerCollectedCents)}
              </span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={11} align="right">
              <span className={styles.summaryValue}>
                {formatCents(totals.netReceivableCents)}
              </span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={12} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}

function CostPanel({ rows }: { rows: ProtoCostRow[] }) {
  const totalAmountCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.amountCents, 0),
    [rows],
  )

  const columns: ColumnsType<ProtoCostRow> = [
    { title: '序号', dataIndex: 'seq', width: 52, align: 'center' },
    { title: COST_SCOPE_COLUMN_LABEL, dataIndex: 'segmentLabel', width: 120 },
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
    <Table<ProtoCostRow>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={rows}
      scroll={{ x: 920 }}
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

function OutsourcePanel({ items }: { items: ProtoOutsourceItem[] }) {
  const totalAmountCents = useMemo(
    () => items.reduce((sum, row) => sum + row.amountCents, 0),
    [items],
  )

  const columns: ColumnsType<ProtoOutsourceItem> = [
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
      dataIndex: 'notes',
      width: 96,
      ellipsis: { showTitle: false },
      render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
    },
  ]

  return (
    <Table<ProtoOutsourceItem>
      className={styles.reportTable}
      size="small"
      bordered
      pagination={false}
      rowKey="id"
      columns={columns}
      dataSource={items}
      locale={{ emptyText: '本团暂无拼出记录' }}
      scroll={{ x: 720 }}
      summary={
        items.length > 0
          ? () => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <span className={styles.summaryLabel}>合计</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>
                    <Typography.Text type="secondary">{items.length} 项</Typography.Text>
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

function DepartureReportBlock({ report }: { report: ProtoDepartureReport }) {
  const [mode, setMode] = useState<LedgerViewMode>('income')
  const titlePrefix = formatReportTitlePrefix(report.startDate, report.routeName)

  return (
    <div className={styles.reportBlock}>
      <div className={styles.reportHeader}>
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space size={12} wrap align="center">
            <Typography.Text strong className={styles.reportTitle}>
              {titlePrefix} · {report.departureNo}
            </Typography.Text>
            <LedgerModeSwitcher value={mode} onChange={setMode} />
          </Space>
          <FinanceSummaryStrip report={report} />
        </Flex>
      </div>

      {mode === 'income' ? <IncomePanel rows={report.incomeRows} /> : null}
      {mode === 'cost' ? <CostPanel rows={report.costRows} /> : null}
      {mode === 'outsource' ? <OutsourcePanel items={report.outsource.items} /> : null}
    </div>
  )
}

/** 定稿：汇总条 + Radio 分面表格。 */
export function RouteLedgerReportList({ reports }: { reports: ProtoDepartureReport[] }) {
  let lastDate: string | null = null

  return (
    <div className={styles.variantCStack}>
      {reports.map((report) => {
        const showDateHeading = report.startDate !== lastDate
        lastDate = report.startDate
        return (
          <div key={report.departureId}>
            {showDateHeading ? <DateSeparator startDate={report.startDate} /> : null}
            <DepartureReportBlock report={report} />
          </div>
        )
      })}
    </div>
  )
}
