import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionVerificationSummary } from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { getTransaction } from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_WRITEOFF_STATUS_COLORS,
  TRANSACTION_WRITEOFF_STATUS_LABELS,
  VERIFICATION_DIRECTION_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { FinanceDepartureLink } from './FinanceDepartureLink'

interface TransactionDetailDrawerProps {
  open: boolean
  transactionId: string | null
  onClose: () => void
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDepartureLink(
  departureId: string | null,
  departureNo: string | null,
  departureName: string | null,
) {
  if (!departureId || !departureNo) {
    return '-'
  }
  return (
    <FinanceDepartureLink departureId={departureId}>
      {departureName ? `${departureNo} · ${departureName}` : departureNo}
    </FinanceDepartureLink>
  )
}

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

export function TransactionDetailDrawer({
  open,
  transactionId,
  onClose,
}: TransactionDetailDrawerProps) {
  const {
    data: transaction,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['finance-transaction', transactionId],
    queryFn: () => {
      if (!transactionId) {
        throw new Error('流水 ID 缺失')
      }
      return getTransaction(transactionId)
    },
    enabled: open && Boolean(transactionId),
  })

  const writeoff = transaction
    ? deriveTransactionWriteoffStatus(
        transaction.amountCents,
        transaction.allocatedAmountCents,
      )
    : null

  const verificationColumns: ColumnsType<FinanceTransactionVerificationSummary> = [
    {
      title: '核销单号',
      dataIndex: 'verificationNo',
    },
    {
      title: '核销方向',
      dataIndex: 'scheduleDirection',
      render: (value: string) => catalogLabel(VERIFICATION_DIRECTION_LABELS, value),
    },
    {
      title: '账款单号',
      dataIndex: 'scheduleNo',
    },
    {
      title: '本次核销金额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '核销状态',
      dataIndex: 'status',
      render: (status: string) => (
        <Tag color={VERIFICATION_STATUS_COLORS[status]}>
          {catalogLabel(VERIFICATION_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    {
      title: '核销时间',
      dataIndex: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
  ]

  return (
    <Drawer
      title="流水详情"
      open={open}
      size={640}
      onClose={onClose}
      destroyOnHidden
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      }
    >
      {isLoading ? (
        <Spin />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          title="流水详情加载失败"
          description={
            error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
          }
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : transaction ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            基础信息
          </Typography.Title>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="流水号">{transaction.transactionNo}</Descriptions.Item>
            <Descriptions.Item label="收支方向">
              <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="流水金额">
              {formatCents(transaction.amountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="交易日期">{transaction.transactionDate}</Descriptions.Item>
            <Descriptions.Item label="收付款通道">
              {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
            </Descriptions.Item>
            <Descriptions.Item label="往来对象">
              {formatCounterpartyLabel(transaction.counterpartyType, transaction.counterpartyName)}
            </Descriptions.Item>
            <Descriptions.Item label="关联发团">
              {formatDepartureLink(
                transaction.departureId,
                transaction.departureNo,
                transaction.departureName,
              )}
            </Descriptions.Item>
            <Descriptions.Item label="流水状态">
              <Tag color={transaction.voidedAt ? 'default' : 'success'}>
                {transaction.voidedAt
                  ? TRANSACTION_STATUS_LABELS.voided
                  : TRANSACTION_STATUS_LABELS.normal}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="核销状态">
              {writeoff ? (
                <Tag color={TRANSACTION_WRITEOFF_STATUS_COLORS[writeoff.status]}>
                  {TRANSACTION_WRITEOFF_STATUS_LABELS[writeoff.status]}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatDateTime(transaction.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label="流水备注" span={2}>
              {transaction.notes?.trim() || '-'}
            </Descriptions.Item>
            {transaction.voidedAt ? (
              <>
                <Descriptions.Item label="作废原因" span={2}>
                  {transaction.voidReason?.trim() || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="作废时间" span={2}>
                  {formatDateTime(transaction.voidedAt)}
                </Descriptions.Item>
              </>
            ) : null}
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            核销信息
          </Typography.Title>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="已核销">
              {formatCents(transaction.allocatedAmountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="未核销">
              {formatCents(transaction.unallocatedAmountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="核销笔数">{transaction.verificationCount}</Descriptions.Item>
            <Descriptions.Item label="最近核销时间">
              {transaction.lastVerificationAt
                ? formatDateTime(transaction.lastVerificationAt)
                : '-'}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            核销记录
          </Typography.Title>
          {transaction.verifications.length > 0 ? (
            <Table
              rowKey="id"
              size="small"
              columns={verificationColumns}
              dataSource={transaction.verifications}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          ) : (
            <Empty description="暂无核销记录" />
          )}
        </>
      ) : null}
    </Drawer>
  )
}
