import { Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  DepartureOperationsSheetAnomaly,
  DepartureOperationsSheetIncomeRecordRow,
  DepartureOperationsSheetPendingTransaction,
  DepartureOperationsSheetReceivablePathRow,
  DepartureOperationsSheetResourceRow,
  DepartureOperationsSheetSourceOrderRow,
} from '@xiaotuanbao/shared'
import { PAYMENT_CHANNEL_LABELS } from '@xiaotuanbao/shared'
import {
  OPERATIONS_SHEET_ANOMALY_KIND_LABELS,
  OPERATIONS_SHEET_ANOMALY_SIDE_LABELS,
  OPERATIONS_SHEET_PENDING_DIRECTION_LABELS,
  OPERATIONS_SHEET_RECEIVABLE_PROGRESS_LABELS,
  SEGMENT_PAYABLE_STATUS_LABELS,
  catalogLabel,
  formatCents,
  formatProgressCents,
} from '../catalog'

function nonEmptyNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export { nonEmptyNote }

export const incomeRecordColumns: ColumnsType<DepartureOperationsSheetIncomeRecordRow> = [
  {
    title: '类型',
    dataIndex: 'typeLabel',
    width: 120,
  },
  {
    title: '项目',
    dataIndex: 'projectName',
  },
  {
    title: '合作方',
    dataIndex: 'partnerSupplierName',
    width: 140,
    render: (value: string | null) => value ?? '-',
  },
  {
    title: '增收金额',
    dataIndex: 'amountCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '导游提成',
    dataIndex: 'commissionCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '公司增收',
    dataIndex: 'companyIncomeCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
  },
  {
    title: '综合状态',
    dataIndex: 'settlementCompositeLabel',
    width: 110,
  },
]

export const sourceColumns: ColumnsType<DepartureOperationsSheetSourceOrderRow> = [
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
    title: '调整净额',
    dataIndex: 'fareAdjustmentNetCents',
    width: 110,
    align: 'right',
    render: (value: number) => formatCents(value),
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
]

export const receivablePathColumns: ColumnsType<DepartureOperationsSheetReceivablePathRow> = [
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
          <Space orientation="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
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
]

export const resourceColumns: ColumnsType<DepartureOperationsSheetResourceRow> = [
  {
    title: '资源种类',
    dataIndex: 'resourceKindLabel',
    width: 90,
  },
  {
    title: '供应商',
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
          <Space orientation="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
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
]

export const pendingColumns: ColumnsType<DepartureOperationsSheetPendingTransaction> = [
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
    title: '收付款方式',
    dataIndex: 'paymentChannel',
    width: 110,
    render: (value: string) => catalogLabel(PAYMENT_CHANNEL_LABELS, value),
  },
  {
    title: '流水备注',
    dataIndex: 'notes',
    render: (value: string | null) => nonEmptyNote(value) ?? '-',
  },
]

export const anomalyColumns: ColumnsType<DepartureOperationsSheetAnomaly> = [
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
]
