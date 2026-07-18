import { Space, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  FinanceTransactionSummary,
  PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

export function formatDepartureLabel(
  departureId: string | null | undefined,
  departureMap: Map<string, { departureNo: string; name: string }>,
): string {
  if (!departureId) {
    return '-'
  }
  const departure = departureMap.get(departureId)
  if (!departure) {
    return '-'
  }
  return `${departure.departureNo} · ${departure.name}`
}

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

export function formatTransactionCounterpartyLabel(
  transaction: FinanceTransactionSummary,
): string {
  return formatCounterpartyLabel(
    transaction.counterpartyType,
    transaction.counterpartyName,
  )
}

export function formatScheduleCounterpartyLabel(
  schedule: PaymentScheduleSummary,
): string {
  return formatCounterpartyLabel(
    schedule.counterpartyType,
    schedule.counterpartyName,
  )
}

export function buildTransactionColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
): ColumnsType<FinanceTransactionSummary> {
  return [
    {
      title: '流水信息',
      width: 224,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{record.transactionNo}</Typography.Text>
          <Space size={4} wrap>
            <Typography.Text type="secondary">
              {record.transactionDate}
            </Typography.Text>
            <Tag color={TRANSACTION_DIRECTION_COLORS[record.direction]}>
              {catalogLabel(TRANSACTION_DIRECTION_LABELS, record.direction)}
            </Tag>
            <Typography.Text type="secondary">
              {catalogLabel(PAYMENT_CHANNEL_LABELS, record.paymentChannel)}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '往来对象 / 发团',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>
            {formatTransactionCounterpartyLabel(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDepartureLabel(record.departureId, departureMap)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '流水金额',
      dataIndex: 'amountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已核销',
      dataIndex: 'allocatedAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '可核销余额',
      dataIndex: 'unallocatedAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
  ]
}

export function buildScheduleColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
  isReceivable: boolean,
): ColumnsType<PaymentScheduleSummary> {
  return [
    {
      title: '节点信息',
      width: 224,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{record.scheduleNo}</Typography.Text>
          <Typography.Text type="secondary">{record.title}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '往来对象 / 发团',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>
            {formatScheduleCounterpartyLabel(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDepartureLabel(record.departureId, departureMap)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '总额',
      dataIndex: 'amountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已结',
      dataIndex: 'settledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未结',
      dataIndex: 'unsettledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    ...(isReceivable
      ? [{ title: '到期日', dataIndex: 'dueDate' as const }]
      : []),
  ]
}
