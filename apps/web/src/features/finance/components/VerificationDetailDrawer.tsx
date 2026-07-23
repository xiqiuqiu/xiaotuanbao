import type { ReactNode } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Flex,
  Row,
  Tag,
  Typography,
  theme,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import {
  VerificationStatus,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { getVerification } from '@/services/finance.service'
import {
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
import {
  counterpartyCollectionMethodText,
  counterpartyDisplayName,
} from '../utils/counterparty-display'
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
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
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

function AmountValue({ children }: { children: ReactNode }) {
  return (
    <Typography.Text style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</Typography.Text>
  )
}

function DetailColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <Row gutter={[24, 0]}>
      <Col xs={24} md={12}>
        <Descriptions column={1} size="small">
          {left}
        </Descriptions>
      </Col>
      <Col xs={24} md={12}>
        <Descriptions column={1} size="small">
          {right}
        </Descriptions>
      </Col>
    </Row>
  )
}

function VerificationFlowNode({
  label,
  value,
  footer,
  emphasis = false,
}: {
  label: string
  value: ReactNode
  footer?: ReactNode
  emphasis?: boolean
}) {
  const { token } = theme.useToken()
  return (
    <Flex
      vertical
      align="center"
      justify="center"
      gap={token.marginXXS}
      style={{
        minHeight: 96,
        padding: token.paddingSM,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorFillQuaternary,
        textAlign: 'center',
      }}
    >
      <Typography.Text strong>{label}</Typography.Text>
      <Typography.Text
        style={{
          color: emphasis ? token.colorPrimary : token.colorText,
          fontSize: emphasis ? token.fontSizeLG : token.fontSize,
          fontWeight: emphasis ? 600 : 400,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography.Text>
      {footer}
    </Flex>
  )
}

function VerificationFlow({
  transaction,
  schedule,
  amount,
}: {
  transaction: FinanceTransactionSummary
  schedule: PaymentScheduleSummary
  amount: string
}) {
  const { token } = theme.useToken()
  const scheduleLabel =
    schedule.direction === 'receivable'
      ? '应收单号'
      : schedule.direction === 'payable'
        ? '应付单号'
        : '收付款单号'

  return (
    <DetailSection title="核销链路">
      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} md={7}>
          <VerificationFlowNode
            label="资金流水"
            value={transaction.transactionNo}
            footer={
              <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
              </Tag>
            }
          />
        </Col>
        <Col xs={0} md={2} style={{ color: token.colorTextTertiary, textAlign: 'center' }}>
          <ArrowRightOutlined aria-hidden />
        </Col>
        <Col xs={24} md={6}>
          <VerificationFlowNode label="本次核销" value={amount} emphasis />
        </Col>
        <Col xs={0} md={2} style={{ color: token.colorTextTertiary, textAlign: 'center' }}>
          <ArrowRightOutlined aria-hidden />
        </Col>
        <Col xs={24} md={7}>
          <VerificationFlowNode
            label={scheduleLabel}
            value={schedule.scheduleNo}
            footer={
              <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[schedule.status]}>
                {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, schedule.status)}
              </Tag>
            }
          />
        </Col>
      </Row>
    </DetailSection>
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
  const { token } = theme.useToken()
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
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          核销详情
        </Typography.Title>
      }
      open={open}
      size="min(940px, 100vw)"
      styles={{
        header: { padding: `${token.paddingMD}px ${token.paddingXL}px` },
        body: { padding: `${token.paddingLG}px ${token.paddingXL}px` },
        footer: { padding: `${token.padding}px ${token.paddingXL}px` },
      }}
      onClose={onClose}
      destroyOnHidden
      loading={isLoading}
      footer={
        <Flex justify="flex-end">
          <Button onClick={onClose}>关闭</Button>
        </Flex>
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
        <Flex vertical>
          <DetailSection title="核销概览">
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
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="核销单号">
                <Typography.Text copyable>{verification?.verificationNo}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="核销类型">
                <Tag color={VERIFICATION_DIRECTION_COLORS[verification?.direction ?? '']}>
                  {catalogLabel(VERIFICATION_DIRECTION_LABELS, verification?.direction)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="核销日期">
                {verification?.verificationDate}
              </Descriptions.Item>
              <Descriptions.Item label="核销状态">
                <Tag color={VERIFICATION_STATUS_COLORS[verification?.status ?? '']}>
                  {catalogLabel(VERIFICATION_STATUS_LABELS, verification?.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作人">{verification?.createdByName}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {verification?.createdAt ? formatDateTime(verification.createdAt) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {verification?.remark?.trim() || '-'}
              </Descriptions.Item>
            </Descriptions>
            <AmountStrip
              items={[
                {
                  label: '本次核销金额',
                  value: formatCents(verification?.amountCents ?? 0),
                  emphasis: true,
                },
                {
                  label: '账款剩余未结金额',
                  value: formatCents(verification?.billUnsettledAfterCents ?? 0),
                },
              ]}
            />
          </DetailSection>

          {transaction && schedule ? (
            <>
              <Divider style={{ margin: '24px 0' }} />
              <VerificationFlow
                transaction={transaction}
                schedule={schedule}
                amount={formatCents(verification?.amountCents ?? 0)}
              />
            </>
          ) : null}

          {transaction ? (
            <>
              <Divider style={{ margin: '24px 0' }} />
              <DetailSection title="流水信息">
                <DetailColumns
                  left={
                    <>
                      <Descriptions.Item label="关联流水号">
                        <Typography.Text copyable>{transaction.transactionNo}</Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="流水金额">
                        <AmountValue>{formatCents(transaction.amountCents)}</AmountValue>
                      </Descriptions.Item>
                      <Descriptions.Item label="已核销">
                        <AmountValue>{formatCents(transaction.allocatedAmountCents)}</AmountValue>
                      </Descriptions.Item>
                      <Descriptions.Item label="未核销">
                        <AmountValue>{formatCents(transaction.unallocatedAmountCents)}</AmountValue>
                      </Descriptions.Item>
                      <Descriptions.Item label="收支方向">
                        <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                          {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="交易日期">
                        {transaction.transactionDate}
                      </Descriptions.Item>
                    </>
                  }
                  right={
                    <>
                      <Descriptions.Item label="收付款通道">
                        {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
                      </Descriptions.Item>
                      <Descriptions.Item label="收款方式">
                        {counterpartyCollectionMethodText(transaction.counterpartyType)}
                      </Descriptions.Item>
                      <Descriptions.Item label="往来对象">
                        {counterpartyDisplayName(transaction.counterpartyName)}
                      </Descriptions.Item>
                      <Descriptions.Item label="关联发团">
                        {departureLink(transaction.departureId)}
                      </Descriptions.Item>
                    </>
                  }
                />
              </DetailSection>
            </>
          ) : null}

          {schedule ? (
            <>
              <Divider style={{ margin: '24px 0' }} />
              <DetailSection title="收付款节点">
                <DetailColumns
                  left={
                    <>
                      <Descriptions.Item label="关联账款单号">
                        <Typography.Text copyable>{schedule.scheduleNo}</Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="节点金额">
                        <AmountValue>{formatCents(schedule.amountCents)}</AmountValue>
                      </Descriptions.Item>
                      <Descriptions.Item label="已结">
                        <AmountValue>{formatCents(schedule.settledAmountCents)}</AmountValue>
                      </Descriptions.Item>
                      <Descriptions.Item label="未结">
                        <AmountValue>{formatCents(schedule.unsettledAmountCents)}</AmountValue>
                      </Descriptions.Item>
                    </>
                  }
                  right={
                    <>
                      <Descriptions.Item label="状态">
                        <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[schedule.status]}>
                          {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, schedule.status)}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="类型">
                        <Tag color={VERIFICATION_DIRECTION_COLORS[schedule.direction]}>
                          {catalogLabel(VERIFICATION_DIRECTION_LABELS, schedule.direction)}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="收款方式">
                        {counterpartyCollectionMethodText(schedule.counterpartyType)}
                      </Descriptions.Item>
                      <Descriptions.Item label="往来对象">
                        {counterpartyDisplayName(schedule.counterpartyName)}
                      </Descriptions.Item>
                      <Descriptions.Item label="关联发团">
                        {departureLink(schedule.departureId)}
                      </Descriptions.Item>
                    </>
                  }
                />
              </DetailSection>
            </>
          ) : null}
        </Flex>
      ) : null}
    </Drawer>
  )
}
