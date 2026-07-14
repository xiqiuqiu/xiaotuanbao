import { Button, Space, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  VerificationStatus,
  type FinanceVerificationListItem,
} from '@xiaotuanbao/shared'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import {
  COUNTERPARTY_TYPE_LABELS,
  VERIFICATION_DIRECTION_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { FinanceDepartureLink } from './FinanceDepartureLink'

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

export function buildVerificationColumns({
  isDepartureScope,
  readOnly,
  onOpenDetail,
  onOpenCancelModal,
}: {
  isDepartureScope: boolean
  readOnly: boolean
  onOpenDetail: (verificationId: string) => void
  onOpenCancelModal: (verification: FinanceVerificationListItem) => void
}): ColumnsType<FinanceVerificationListItem> {
  const columns: ColumnsType<FinanceVerificationListItem> = [
    {
      title: '核销单号',
      dataIndex: 'verificationNo',
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => onOpenDetail(record.id)}>
          {value}
        </Button>
      ),
    },
    { title: '核销日期', dataIndex: 'verificationDate' },
    {
      title: '核销方向',
      dataIndex: 'direction',
      render: (value: string) => catalogLabel(VERIFICATION_DIRECTION_LABELS, value),
    },
    {
      title: '往来对象',
      key: 'counterparty',
      render: (_: unknown, record) =>
        formatCounterpartyLabel(record.counterpartyType, record.counterpartyName),
    },
  ]

  if (!isDepartureScope) {
    columns.push({
      title: '关联发团',
      dataIndex: 'departureName',
      render: (value: string, record) => (
        <Tooltip title={record.departureNo}>
          <FinanceDepartureLink departureId={record.departureId}>
            {value || record.departureNo}
          </FinanceDepartureLink>
        </Tooltip>
      ),
    })
  }

  columns.push(
    { title: '流水号', dataIndex: 'transactionNo' },
    { title: '收付款节点编号', dataIndex: 'scheduleNo' },
    {
      title: '本次核销金额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '核销后未结金额',
      dataIndex: 'billUnsettledAfterCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (itemStatus: string) => (
        <Tag color={VERIFICATION_STATUS_COLORS[itemStatus]}>
          {catalogLabel(VERIFICATION_STATUS_LABELS, itemStatus)}
        </Tag>
      ),
    },
    { title: '核销人', dataIndex: 'createdByName' },
    ...(isDepartureScope
      ? []
      : buildBusinessTimestampColumns<FinanceVerificationListItem>()),
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_: unknown, record: FinanceVerificationListItem) => (
        <Space>
          <Button type="link" onClick={() => onOpenDetail(record.id)}>
            查看
          </Button>
          {!readOnly && record.status === VerificationStatus.NORMAL ? (
            <Button type="link" danger onClick={() => onOpenCancelModal(record)}>
              撤销核销
            </Button>
          ) : null}
        </Space>
      ),
    },
  )

  return columns
}
