import { Descriptions, Empty, Space, Table, Typography } from 'antd'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
import {
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_LABELS,
  OPERATIONS_SHEET_DATA_STAGE_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import {
  anomalyColumns,
  groundIncomeColumns,
  nonEmptyNote,
  pendingColumns,
  receivablePathColumns,
  resourceColumns,
  sourceColumns,
} from './operations-sheet-columns'

function formatSnapshotTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function OperationsSheetMetaSection({ sheet }: { sheet: DepartureOperationsSheetSnapshot }) {
  return (
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
          { label: '司机', children: sheet.departure.driverSupplierName || '-' },
          { label: '导游', children: sheet.departure.guideSupplierName || '-' },
          { label: '车牌', children: sheet.departure.vehiclePlate || '-' },
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
  )
}

export function OperationsSheetSourceOrdersSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  return (
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
  )
}

export function OperationsSheetSegmentsSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  return (
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
  )
}

export function OperationsSheetPendingSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  if (!sheet.pendingSummary) {
    return null
  }

  return (
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
  )
}

export function OperationsSheetGroundIncomeSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  if (sheet.groundIncomes.length === 0) {
    return null
  }

  return (
    <div>
      <Typography.Title level={5}>团上收入</Typography.Title>
      <Descriptions
        size="small"
        column={1}
        style={{ marginBottom: 12 }}
        items={[
          {
            label: '其他收入合计',
            children: formatCents(sheet.groundIncomeTotalCents),
          },
        ]}
      />
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        columns={groundIncomeColumns}
        dataSource={sheet.groundIncomes}
      />
    </div>
  )
}

export function OperationsSheetFinanceSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  const hasFinanceSummary =
    sheet.financeSummary.receivable != null || sheet.financeSummary.payable != null
  const showSummaryAndAnomalies = hasFinanceSummary || sheet.anomalies.length > 0

  if (!showSummaryAndAnomalies) {
    return null
  }

  return (
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
  )
}

export function OperationsSheetNotesSection({
  sheet,
}: {
  sheet: DepartureOperationsSheetSnapshot
}) {
  const departureNotes = nonEmptyNote(sheet.departure.notes)
  if (!departureNotes) {
    return null
  }

  return (
    <div>
      <Typography.Title level={5}>发团级备注</Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
        {departureNotes}
      </Typography.Paragraph>
    </div>
  )
}
