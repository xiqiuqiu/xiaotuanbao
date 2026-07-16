import { Button, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus } from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_WRITEOFF_STATUS_COLORS,
  TRANSACTION_WRITEOFF_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { FinanceDepartureLink } from './FinanceDepartureLink'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'

export function buildTransactionColumns({
  isDepartureScope,
  readOnly,
  onOpenDetail,
  onOpenVerify,
  onEdit,
  onOpenVoidModal,
  onViewVerifications,
}: {
  isDepartureScope: boolean
  readOnly: boolean
  onOpenDetail: (id: string) => void
  onOpenVerify: (transaction: FinanceTransactionSummary) => void
  onEdit: (transaction: FinanceTransactionSummary) => void
  onOpenVoidModal: (transaction: FinanceTransactionSummary) => void
  onViewVerifications: (transaction: FinanceTransactionSummary) => void
}): ColumnsType<FinanceTransactionSummary> {
  const columns: ColumnsType<FinanceTransactionSummary> = [
    {
      title: '流水号',
      dataIndex: 'transactionNo',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onOpenDetail(record.id)}>
          {value}
        </Button>
      ),
    },
    {
      title: '收支方向',
      dataIndex: 'direction',
      render: (value: string) => (
        <Tag color={TRANSACTION_DIRECTION_COLORS[value]}>
          {catalogLabel(TRANSACTION_DIRECTION_LABELS, value)}
        </Tag>
      ),
    },
    {
      title: '流水金额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已核销',
      dataIndex: 'allocatedAmountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未核销',
      dataIndex: 'unallocatedAmountCents',
      render: (value: number) => formatCents(value),
    },
    { title: '交易日期', dataIndex: 'transactionDate' },
    {
      title: '往来对象',
      render: (_, record) => (
        <span>
          {catalogLabel(COUNTERPARTY_TYPE_LABELS, record.counterpartyType)}
          {record.counterpartyName ? ` · ${record.counterpartyName}` : ''}
        </span>
      ),
    },
  ]

  if (!isDepartureScope) {
    columns.push({
      title: '关联发团',
      dataIndex: 'departureName',
      render: (_value: string | null, record) => {
        if (!record.departureId) {
          return '-'
        }
        const label = record.departureName || record.departureNo || '-'
        return (
          <Tooltip title={record.departureNo ?? undefined}>
            <FinanceDepartureLink departureId={record.departureId}>
              {label}
            </FinanceDepartureLink>
          </Tooltip>
        )
      },
    })
  }

  columns.push(
    {
      title: '收付款通道',
      dataIndex: 'paymentChannel',
      render: (value: string) => catalogLabel(PAYMENT_CHANNEL_LABELS, value),
    },
    {
      title: '核销状态',
      render: (_, record) => {
        const writeoff = deriveTransactionWriteoffStatus(
          record.amountCents,
          record.allocatedAmountCents,
        )
        return (
          <Tag color={TRANSACTION_WRITEOFF_STATUS_COLORS[writeoff.status]}>
            {TRANSACTION_WRITEOFF_STATUS_LABELS[writeoff.status]}
          </Tag>
        )
      },
    },
    {
      title: '流水状态',
      render: (_, record) => (
        <Tag color={record.voidedAt ? 'default' : 'success'}>
          {record.voidedAt ? TRANSACTION_STATUS_LABELS.voided : TRANSACTION_STATUS_LABELS.normal}
        </Tag>
      ),
    },
    ...buildBusinessTimestampColumns<FinanceTransactionSummary>(),
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => {
        if (record.voidedAt || readOnly) {
          return (
            <Button type="link" onClick={() => onOpenDetail(record.id)}>
              查看
            </Button>
          )
        }

        const writeoff = deriveTransactionWriteoffStatus(
          record.amountCents,
          record.allocatedAmountCents,
        )

        if (writeoff.status === 'none') {
          return (
            <>
              <Button type="link" onClick={() => onOpenVerify(record)}>
                去核销
              </Button>
              <Button type="link" onClick={() => onEdit(record)}>
                编辑
              </Button>
              <Button type="link" danger onClick={() => onOpenVoidModal(record)}>
                作废
              </Button>
            </>
          )
        }

        if (writeoff.status === 'partial') {
          return (
            <>
              <Button type="link" onClick={() => onOpenVerify(record)}>
                去核销
              </Button>
              <Button type="link" onClick={() => onViewVerifications(record)}>
                查看核销
              </Button>
            </>
          )
        }

        return (
          <Button type="link" onClick={() => onViewVerifications(record)}>
            查看核销
          </Button>
        )
      },
    },
  )

  return columns
}
