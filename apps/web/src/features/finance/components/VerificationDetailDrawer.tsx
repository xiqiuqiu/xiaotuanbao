import { Button, Descriptions, Drawer, Space, Spin, Tag, Typography } from 'antd'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { VerificationStatus } from '@xiaotuanbao/shared'
import { getVerification } from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_SCHEDULE_STATUS_COLORS,
  PAYMENT_SCHEDULE_STATUS_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  VERIFICATION_DIRECTION_COLORS,
  VERIFICATION_DIRECTION_LABELS,
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

interface VerificationDetailDrawerProps {
  open: boolean
  verificationId: string | null
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

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

export function VerificationDetailDrawer({
  open,
  verificationId,
  onClose,
}: VerificationDetailDrawerProps) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['finance-verification', verificationId],
    queryFn: () => {
      if (!verificationId) {
        throw new Error('核销 ID 缺失')
      }
      return getVerification(verificationId)
    },
    enabled: open && Boolean(verificationId),
  })

  const verification = detail?.verification
  const transaction = detail?.transaction
  const schedule = detail?.schedule

  return (
    <Drawer
      title="核销详情"
      open={open}
      size={680}
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
      ) : detail ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            核销信息
          </Typography.Title>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="核销单号">
              <Typography.Text code>{verification?.verificationNo}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="核销方向">
              <Tag color={VERIFICATION_DIRECTION_COLORS[verification?.direction ?? '']}>
                {catalogLabel(VERIFICATION_DIRECTION_LABELS, verification?.direction)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="核销日期">{verification?.verificationDate}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={VERIFICATION_STATUS_COLORS[verification?.status ?? '']}>
                {catalogLabel(VERIFICATION_STATUS_LABELS, verification?.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="本次核销金额">
              {formatCents(verification?.amountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="核销后未结金额">
              {formatCents(verification?.billUnsettledAfterCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="核销人">{verification?.createdByName}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {verification?.createdAt ? formatDateTime(verification.createdAt) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {verification?.remark?.trim() || '—'}
            </Descriptions.Item>
            {verification?.status === VerificationStatus.CANCELLED ? (
              <>
                <Descriptions.Item label="撤销人">{verification.cancelledByName ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="撤销时间">
                  {verification.cancelledAt ? formatDateTime(verification.cancelledAt) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="撤销原因" span={2}>
                  {verification.cancelReason?.trim() || '—'}
                </Descriptions.Item>
              </>
            ) : null}
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            流水信息
          </Typography.Title>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="流水号">
              <Typography.Text code>{transaction?.transactionNo}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="收支方向">
              <Tag color={TRANSACTION_DIRECTION_COLORS[transaction?.direction ?? '']}>
                {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction?.direction)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="交易日期">{transaction?.transactionDate}</Descriptions.Item>
            <Descriptions.Item label="往来对象">
              {formatCounterpartyLabel(
                transaction?.counterpartyType ?? '',
                transaction?.counterpartyName ?? null,
              )}
            </Descriptions.Item>
            <Descriptions.Item label="关联发团">
              {transaction?.departureId ? (
                <Link to="/departure/$departureId" params={{ departureId: transaction.departureId }}>
                  {verification?.departureNo} · {verification?.departureName}
                </Link>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="流水金额">
              {formatCents(transaction?.amountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="已核销">
              {formatCents(transaction?.allocatedAmountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="未核销">
              {formatCents(transaction?.unallocatedAmountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="收付款通道">
              {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction?.paymentChannel)}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            收付款节点信息
          </Typography.Title>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="收付款节点编号">
              <Typography.Text code>{schedule?.scheduleNo}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={VERIFICATION_DIRECTION_COLORS[schedule?.direction ?? '']}>
                {catalogLabel(VERIFICATION_DIRECTION_LABELS, schedule?.direction)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="关联发团">
              {schedule?.departureId ? (
                <Link to="/departure/$departureId" params={{ departureId: schedule.departureId }}>
                  {verification?.departureNo} · {verification?.departureName}
                </Link>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="往来对象">
              {formatCounterpartyLabel(
                schedule?.counterpartyType ?? '',
                schedule?.counterpartyName ?? null,
              )}
            </Descriptions.Item>
            <Descriptions.Item label="节点金额">
              {formatCents(schedule?.amountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="已结">
              {formatCents(schedule?.settledAmountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="未结">
              {formatCents(schedule?.unsettledAmountCents ?? 0)}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[schedule?.status ?? '']}>
                {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, schedule?.status)}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </>
      ) : null}
    </Drawer>
  )
}
