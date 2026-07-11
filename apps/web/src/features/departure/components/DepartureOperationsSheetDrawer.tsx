import { useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Space, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import type {
  DepartureOperationsSheetAnomaly,
  DepartureOperationsSheetPendingTransaction,
  DepartureOperationsSheetReceivablePathRow,
  DepartureOperationsSheetResourceRow,
  DepartureOperationsSheetSnapshot,
  DepartureOperationsSheetSourceOrderRow,
} from '@xiaotuanbao/shared'
import { PAYMENT_CHANNEL_LABELS } from '@xiaotuanbao/shared'
import {
  downloadDepartureOperationsSheet,
  getDepartureOperationsSheet,
} from '@/services/departure.service'
import {
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_LABELS,
  OPERATIONS_SHEET_ANOMALY_KIND_LABELS,
  OPERATIONS_SHEET_ANOMALY_SIDE_LABELS,
  OPERATIONS_SHEET_DATA_STAGE_LABELS,
  OPERATIONS_SHEET_PENDING_DIRECTION_LABELS,
  OPERATIONS_SHEET_RECEIVABLE_PROGRESS_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
  formatProgressCents,
} from '../catalog'

interface DepartureOperationsSheetDrawerProps {
  open: boolean
  departureId: string
  onClose: () => void
}

function nonEmptyNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function formatSnapshotTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function DepartureOperationsSheetDrawer({
  open,
  departureId,
  onClose,
}: DepartureOperationsSheetDrawerProps) {
  const [exporting, setExporting] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['departure-operations-sheet', departureId],
    queryFn: () => getDepartureOperationsSheet(departureId),
    enabled: open,
  })

  async function handleExport() {
    setExporting(true)
    try {
      await downloadDepartureOperationsSheet(departureId)
      message.success('已开始下载 Excel')
    } catch {
      // downloadBinary already surfaces the error message
    } finally {
      setExporting(false)
    }
  }

  return (
    <Drawer
      title="发团运营表"
      placement="right"
      width={960}
      open={open}
      onClose={onClose}
      destroyOnHidden
      loading={isLoading}
      extra={
        <Button type="primary" loading={exporting} disabled={!data || isError} onClick={handleExport}>
          导出 Excel
        </Button>
      }
    >
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="加载失败"
          description={error instanceof Error ? error.message : '无法加载发团运营表'}
        />
      ) : null}

      {!isLoading && !isError && !data ? <Empty description="暂无数据" /> : null}

      {data ? <OperationsSheetContent sheet={data} /> : null}
    </Drawer>
  )
}

function OperationsSheetContent({ sheet }: { sheet: DepartureOperationsSheetSnapshot }) {
  const sourceColumns = useMemo<ColumnsType<DepartureOperationsSheetSourceOrderRow>>(
    () => [
      {
        title: '合作方',
        dataIndex: 'partnerName',
        width: 140,
      },
      {
        title: '游客代表',
        key: 'guestRepresentative',
        width: 140,
        render: (_, row) => {
          if (!row.guestRepresentative) {
            return '-'
          }
          return row.guestRepresentative.phone
            ? `${row.guestRepresentative.name} ${row.guestRepresentative.phone}`
            : row.guestRepresentative.name
        },
      },
      {
        title: '成人/儿童/合计',
        key: 'guests',
        width: 120,
        render: (_, row) => `${row.adultGuestCount}/${row.childGuestCount}/${row.guestCount}`,
      },
      {
        title: '约定应收',
        dataIndex: 'agreedReceivableCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '备注',
        key: 'notes',
        render: (_, row) => {
          const parts: string[] = []
          const settlementNotes = nonEmptyNote(row.settlementNotes)
          const notes = nonEmptyNote(row.notes)
          if (settlementNotes) {
            parts.push(`结算：${settlementNotes}`)
          }
          if (notes) {
            parts.push(`客源：${notes}`)
          }
          return parts.length > 0 ? parts.join('；') : '-'
        },
      },
    ],
    [],
  )

  const receivablePathColumns = useMemo<ColumnsType<DepartureOperationsSheetReceivablePathRow>>(
    () => [
      {
        title: '收款路径',
        dataIndex: 'pathLabel',
        width: 110,
      },
      {
        title: '约定应收',
        key: 'receivable',
        width: 160,
        align: 'right',
        render: (_, row) => {
          if (
            row.scheduleReceivableCents != null &&
            row.scheduleReceivableCents !== row.agreedReceivableCents
          ) {
            return (
              <Space direction="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
                <Typography.Text>业务 {formatCents(row.agreedReceivableCents)}</Typography.Text>
                <Typography.Text type="secondary">
                  财务 {formatCents(row.scheduleReceivableCents)}
                </Typography.Text>
              </Space>
            )
          }
          return formatCents(row.agreedReceivableCents)
        },
      },
      {
        title: '已收',
        dataIndex: 'receivedCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '未收',
        dataIndex: 'unreceivedCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '进度',
        key: 'progress',
        width: 130,
        render: (_, row) => {
          if (row.receivableStatus === 'not_generated') {
            return '—'
          }
          const progressLabel = catalogLabel(
            OPERATIONS_SHEET_RECEIVABLE_PROGRESS_LABELS,
            row.receivableStatus,
          )
          if (row.needsReview) {
            return progressLabel === '—' ? '需核对' : `${progressLabel} · 需核对`
          }
          return progressLabel
        },
      },
    ],
    [],
  )

  const resourceColumns = useMemo<ColumnsType<DepartureOperationsSheetResourceRow>>(
    () => [
      {
        title: '资源种类',
        dataIndex: 'resourceKindLabel',
        width: 90,
      },
      {
        title: '对手方',
        dataIndex: 'counterpartyName',
        width: 140,
      },
      {
        title: '名称',
        dataIndex: 'title',
        width: 140,
      },
      {
        title: '约定应付',
        key: 'payable',
        width: 150,
        align: 'right',
        render: (_, row) => {
          if (
            row.schedulePayableCents != null &&
            row.schedulePayableCents !== row.agreedPayableCents
          ) {
            return (
              <Space direction="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
                <Typography.Text>业务 {formatCents(row.agreedPayableCents)}</Typography.Text>
                <Typography.Text type="secondary">
                  财务 {formatCents(row.schedulePayableCents)}
                </Typography.Text>
              </Space>
            )
          }
          return formatCents(row.agreedPayableCents)
        },
      },
      {
        title: '已付',
        dataIndex: 'paidCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '未付',
        dataIndex: 'unpaidCents',
        width: 90,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '进度',
        key: 'progress',
        width: 110,
        render: (_, row) => {
          if (row.payableStatus === 'not_generated') {
            return '—'
          }
          const progressLabel = catalogLabel(SEGMENT_PAYABLE_STATUS_LABELS, row.payableStatus)
          if (row.needsReview) {
            return progressLabel === '—' ? '需核对' : `${progressLabel} · 需核对`
          }
          return progressLabel
        },
      },
      {
        title: '备注',
        dataIndex: 'notes',
        render: (value: string | null) => nonEmptyNote(value) ?? '-',
      },
    ],
    [],
  )

  const pendingColumns = useMemo<ColumnsType<DepartureOperationsSheetPendingTransaction>>(
    () => [
      {
        title: '方向',
        dataIndex: 'direction',
        width: 80,
        render: (value: string) => catalogLabel(OPERATIONS_SHEET_PENDING_DIRECTION_LABELS, value),
      },
      {
        title: '交易日期',
        dataIndex: 'transactionDate',
        width: 120,
      },
      {
        title: '往来对象',
        dataIndex: 'counterpartyName',
        width: 160,
        render: (value: string) => value || '-',
      },
      {
        title: '剩余待确认',
        dataIndex: 'remainingUnverifiedCents',
        width: 120,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '收付款通道',
        dataIndex: 'paymentChannel',
        width: 110,
        render: (value: string) => catalogLabel(PAYMENT_CHANNEL_LABELS, value),
      },
      {
        title: '流水备注',
        dataIndex: 'notes',
        render: (value: string | null) => nonEmptyNote(value) ?? '-',
      },
    ],
    [],
  )

  const anomalyColumns = useMemo<ColumnsType<DepartureOperationsSheetAnomaly>>(
    () => [
      {
        title: '异常类型',
        dataIndex: 'kind',
        width: 160,
        render: (value: string) => catalogLabel(OPERATIONS_SHEET_ANOMALY_KIND_LABELS, value),
      },
      {
        title: '侧',
        dataIndex: 'side',
        width: 80,
        render: (value: string) => catalogLabel(OPERATIONS_SHEET_ANOMALY_SIDE_LABELS, value),
      },
      {
        title: '对象',
        dataIndex: 'subjectLabel',
      },
      {
        title: '业务金额',
        dataIndex: 'agreedAmountCents',
        width: 110,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '财务金额',
        dataIndex: 'scheduleAmountCents',
        width: 110,
        align: 'right',
        render: (value: number | null) => formatProgressCents(value),
      },
      {
        title: '已核销',
        dataIndex: 'settledCents',
        width: 100,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
      {
        title: '剩余',
        dataIndex: 'remainingCents',
        width: 100,
        align: 'right',
        render: (value: number) => formatCents(value),
      },
    ],
    [],
  )

  const departureNotes = nonEmptyNote(sheet.departure.notes)
  const hasFinanceSummary =
    sheet.financeSummary.receivable != null || sheet.financeSummary.payable != null
  const showSummaryAndAnomalies = hasFinanceSummary || sheet.anomalies.length > 0

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          发团与数据阶段
        </Typography.Title>
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, sm: 2, md: 3 }}
          items={[
            { label: '企业', children: sheet.organizationName },
            { label: '发团编号', children: sheet.departure.departureNo },
            { label: '发团名称', children: sheet.departure.name },
            { label: '路线', children: sheet.departure.routeName },
            {
              label: '日期',
              children: `${sheet.departure.startDate} ~ ${sheet.departure.endDate}（${sheet.departure.dayCount} 天）`,
            },
            { label: '负责人', children: sheet.departure.ownerName },
            {
              label: '发团状态',
              children: catalogLabel(DEPARTURE_STATUS_LABELS, sheet.departure.status),
            },
            {
              label: '出团进度',
              children: catalogLabel(DEPARTURE_PROGRESS_LABELS, sheet.departure.departureProgress),
            },
            {
              label: '数据阶段',
              children: catalogLabel(OPERATIONS_SHEET_DATA_STAGE_LABELS, sheet.dataStage),
            },
            { label: '快照时间', children: formatSnapshotTime(sheet.exportedAt) },
            { label: '导出人', children: sheet.exportedByName || '-' },
          ]}
        />
      </div>

      <div>
        <Typography.Title level={5}>客源及应收</Typography.Title>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          columns={sourceColumns}
          dataSource={sheet.sourceOrders}
          locale={{ emptyText: '暂无客源单' }}
          scroll={{ x: 760 }}
          expandable={{
            defaultExpandAllRows: true,
            rowExpandable: (row) => (row.receivablePaths?.length ?? 0) > 0,
            expandedRowRender: (row) => (
              <Table
                size="small"
                rowKey="pathType"
                pagination={false}
                columns={receivablePathColumns}
                dataSource={row.receivablePaths ?? []}
                showHeader
              />
            ),
          }}
        />
      </div>

      <div>
        <Typography.Title level={5}>行程段资源及应付</Typography.Title>
        {sheet.segments.length === 0 ? (
          <Empty description="暂无行程段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {sheet.segments.map((segment) => {
              const segmentNotes = nonEmptyNote(segment.notes)
              const dateLabel =
                segment.startDate && segment.endDate
                  ? `${segment.startDate} ~ ${segment.endDate}`
                  : '日期待定'
              const dayLabel = segment.dayCount != null ? `${segment.dayCount} 天` : null

              return (
                <div key={segment.id}>
                  <Typography.Text strong>{segment.name}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    {[dateLabel, dayLabel, segment.destination].filter(Boolean).join(' · ')}
                    {segmentNotes ? ` · 备注：${segmentNotes}` : ''}
                  </Typography.Paragraph>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    columns={resourceColumns}
                    dataSource={segment.resources}
                    locale={{ emptyText: '该段暂无资源' }}
                    scroll={{ x: 980 }}
                  />
                </div>
              )
            })}
          </Space>
        )}
      </div>

      {sheet.pendingSummary ? (
        <div>
          <Typography.Title level={5}>待确认款项</Typography.Title>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            style={{ marginBottom: 12 }}
            items={[
              ...(sheet.pendingSummary.pendingCollectionCents > 0
                ? [
                    {
                      label: '待确认收款',
                      children: formatCents(sheet.pendingSummary.pendingCollectionCents),
                    },
                  ]
                : []),
              ...(sheet.pendingSummary.pendingPaymentCents > 0
                ? [
                    {
                      label: '待确认付款',
                      children: formatCents(sheet.pendingSummary.pendingPaymentCents),
                    },
                  ]
                : []),
            ]}
          />
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            columns={pendingColumns}
            dataSource={sheet.pendingTransactions}
            scroll={{ x: 780 }}
          />
        </div>
      ) : null}

      {showSummaryAndAnomalies ? (
        <div>
          <Typography.Title level={5}>财务汇总与异常</Typography.Title>
          {hasFinanceSummary ? (
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, sm: 2 }}
              style={{ marginBottom: sheet.anomalies.length > 0 ? 16 : 0 }}
              items={[
                ...(sheet.financeSummary.receivable
                  ? [
                      {
                        label: '正常应收',
                        children: formatCents(sheet.financeSummary.receivable.agreedCents),
                      },
                      {
                        label: '正常已收',
                        children: formatCents(sheet.financeSummary.receivable.settledCents),
                      },
                      {
                        label: '正常未收',
                        children: formatCents(sheet.financeSummary.receivable.unsettledCents),
                      },
                    ]
                  : []),
                ...(sheet.financeSummary.payable
                  ? [
                      {
                        label: '正常应付',
                        children: formatCents(sheet.financeSummary.payable.agreedCents),
                      },
                      {
                        label: '正常已付',
                        children: formatCents(sheet.financeSummary.payable.settledCents),
                      },
                      {
                        label: '正常未付',
                        children: formatCents(sheet.financeSummary.payable.unsettledCents),
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
          {sheet.anomalies.length > 0 ? (
            <Table
              size="small"
              rowKey={(row) => `${row.kind}-${row.side}-${row.subjectLabel}`}
              pagination={false}
              columns={anomalyColumns}
              dataSource={sheet.anomalies}
              scroll={{ x: 860 }}
            />
          ) : null}
        </div>
      ) : null}

      {departureNotes ? (
        <div>
          <Typography.Title level={5}>发团级备注</Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            {departureNotes}
          </Typography.Paragraph>
        </div>
      ) : null}
    </Space>
  )
}
