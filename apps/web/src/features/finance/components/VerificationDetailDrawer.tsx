import type { ReactNode } from 'react'
import { Alert, Button, Descriptions, Drawer, Flex, Space, Tag, Typography, theme } from 'antd'
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
import { FinanceDepartureLink } from './FinanceDepartureLink'

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

interface AmountStripItem {
  label: string
  value: ReactNode
  /** 主指标使用更大的字号，让本段最重要的数字一眼可辨。 */
  emphasis?: boolean
}

/**
 * 金额条：把一段内相关的金额指标并排分组，与明细字段分离，
 * 避免关键金额淹没在两列字段流里。
 */
function AmountStrip({ items }: { items: AmountStripItem[] }) {
  const { token } = theme.useToken()
  return (
    <Flex
      style={{
        background: token.colorFillQuaternary,
        borderRadius: token.borderRadiusLG,
        padding: `${token.paddingSM}px ${token.padding}px`,
      }}
      gap={token.padding}
    >
      {items.map((item) => (
        <div key={item.label} style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {item.label}
          </Typography.Text>
          <div
            style={{
              fontSize: item.emphasis ? token.fontSizeHeading4 : token.fontSizeLG,
              fontWeight: 600,
              lineHeight: 1.4,
              marginTop: token.marginXXS,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </Flex>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
        {title}
      </Typography.Title>
      <Flex vertical gap={12}>
        {children}
      </Flex>
    </section>
  )
}

export function VerificationDetailDrawer({
  open,
  verificationId,
  onClose,
}: VerificationDetailDrawerProps) {
  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
  const isCancelled = verification?.status === VerificationStatus.CANCELLED

  const departureLink = (departureId: string | null | undefined) =>
    departureId ? (
      <FinanceDepartureLink departureId={departureId}>
        {verification?.departureNo} · {verification?.departureName}
      </FinanceDepartureLink>
    ) : (
      '-'
    )

  return (
    <Drawer
      title="核销详情"
      open={open}
      size={680}
      onClose={onClose}
      destroyOnHidden
      loading={isLoading}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      }
    >
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="核销详情加载失败"
          description={
            error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
          }
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : detail ? (
        <Flex vertical gap={24}>
          <DetailSection title="核销信息">
            {isCancelled ? (
              <Alert
                type="warning"
                showIcon
                title="该核销已撤销"
                description={[
                  `撤销人：${verification?.cancelledByName ?? '-'}`,
                  `撤销时间：${verification?.cancelledAt ? formatDateTime(verification.cancelledAt) : '-'}`,
                  `原因：${verification?.cancelReason?.trim() || '-'}`,
                ].join(' · ')}
              />
            ) : null}
            <AmountStrip
              items={[
                {
                  label: '本次核销金额',
                  value: formatCents(verification?.amountCents ?? 0),
                  emphasis: true,
                },
                {
                  label: '核销后未结金额',
                  value: formatCents(verification?.billUnsettledAfterCents ?? 0),
                },
              ]}
            />
            <Descriptions column={2} size="small">
              <Descriptions.Item label="核销单号">
                <Typography.Text copyable>{verification?.verificationNo}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="核销方向">
                <Tag color={VERIFICATION_DIRECTION_COLORS[verification?.direction ?? '']}>
                  {catalogLabel(VERIFICATION_DIRECTION_LABELS, verification?.direction)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="核销日期">
                {verification?.verificationDate}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={VERIFICATION_STATUS_COLORS[verification?.status ?? '']}>
                  {catalogLabel(VERIFICATION_STATUS_LABELS, verification?.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="核销人">{verification?.createdByName}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {verification?.createdAt ? formatDateTime(verification.createdAt) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {verification?.remark?.trim() || '-'}
              </Descriptions.Item>
            </Descriptions>
          </DetailSection>

          {transaction ? (
            <DetailSection title="流水信息">
              <AmountStrip
                items={[
                  { label: '流水金额', value: formatCents(transaction.amountCents) },
                  { label: '已核销', value: formatCents(transaction.allocatedAmountCents) },
                  { label: '未核销', value: formatCents(transaction.unallocatedAmountCents) },
                ]}
              />
              <Descriptions column={2} size="small">
                <Descriptions.Item label="流水号">
                  <Typography.Text copyable>{transaction.transactionNo}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="收支方向">
                  <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                    {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="交易日期">
                  {transaction.transactionDate}
                </Descriptions.Item>
                <Descriptions.Item label="收付款通道">
                  {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
                </Descriptions.Item>
                <Descriptions.Item label="往来对象" span={2}>
                  {formatCounterpartyLabel(
                    transaction.counterpartyType,
                    transaction.counterpartyName ?? null,
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="关联发团" span={2}>
                  {departureLink(transaction.departureId)}
                </Descriptions.Item>
              </Descriptions>
            </DetailSection>
          ) : null}

          {schedule ? (
            <DetailSection title="收付款节点信息">
              <AmountStrip
                items={[
                  { label: '节点金额', value: formatCents(schedule.amountCents) },
                  { label: '已结', value: formatCents(schedule.settledAmountCents) },
                  { label: '未结', value: formatCents(schedule.unsettledAmountCents) },
                  {
                    label: '状态',
                    value: (
                      <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[schedule.status]}>
                        {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, schedule.status)}
                      </Tag>
                    ),
                  },
                ]}
              />
              <Descriptions column={2} size="small">
                <Descriptions.Item label="收付款节点编号">
                  <Typography.Text copyable>{schedule.scheduleNo}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  <Tag color={VERIFICATION_DIRECTION_COLORS[schedule.direction]}>
                    {catalogLabel(VERIFICATION_DIRECTION_LABELS, schedule.direction)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="往来对象" span={2}>
                  {formatCounterpartyLabel(
                    schedule.counterpartyType,
                    schedule.counterpartyName ?? null,
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="关联发团" span={2}>
                  {departureLink(schedule.departureId)}
                </Descriptions.Item>
              </Descriptions>
            </DetailSection>
          ) : null}
        </Flex>
      ) : null}
    </Drawer>
  )
}
