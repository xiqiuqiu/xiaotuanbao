import type { ReactNode } from 'react'
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Row,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { FinanceTransactionVerificationSummary } from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { useAuthStore } from '@/app/store/auth.store'
import {
  acknowledgeTransactionSourceAmountChange,
  getTransaction,
} from '@/services/finance.service'
import { canMutateFinance } from '../utils/finance-permission'
import {
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
import {
  counterpartyCollectionMethodText,
  counterpartyDisplayName,
} from '../utils/counterparty-display'
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

function AmountStrip({
  items,
}: {
  items: Array<{ label: string; value: string; emphasis?: boolean }>
}) {
  const { token } = theme.useToken()
  return (
    <Row
      gutter={[token.padding, token.paddingSM]}
      style={{
        marginInline: 0,
        padding: `${token.paddingSM}px 0`,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
      }}
    >
      {items.map((item) => (
        <Col key={item.label} xs={24} sm={8}>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {item.label}
          </Typography.Text>
          <div
            style={{
              color: token.colorText,
              fontSize: item.emphasis ? token.fontSizeHeading4 : token.fontSizeLG,
              fontWeight: 600,
              lineHeight: 1.4,
              marginTop: token.marginXXS,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {item.value}
          </div>
        </Col>
      ))}
    </Row>
  )
}

export function TransactionDetailDrawer({
  open,
  transactionId,
  onClose,
}: TransactionDetailDrawerProps) {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const menuKeys = useAuthStore((state) => state.menuKeys)
  const canAcknowledgeSourceAmountChange = canMutateFinance(menuKeys)
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

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => acknowledgeTransactionSourceAmountChange(id),
    onSuccess: async () => {
      message.success('已标记为已知悉')
      if (transactionId) {
        await queryClient.invalidateQueries({ queryKey: ['finance-transaction', transactionId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    },
    onError: (acknowledgeError) => {
      message.error(
        acknowledgeError instanceof Error ? acknowledgeError.message : '知悉失败，请稍后重试',
      )
    },
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
      title: '核销类型',
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
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          流水详情
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
        <Flex vertical>
          <DetailSection title="流水概览">
            {transaction.voidedAt ? (
              <Alert
                type="warning"
                showIcon
                title="该流水已作废"
                description={`作废时间：${formatDateTime(transaction.voidedAt)} · 原因：${transaction.voidReason?.trim() || '-'}`}
              />
            ) : null}
            {transaction.sourceAmountChanged ? (
              <Alert
                type="warning"
                showIcon
                title="关联客源金额已变更"
                description="计调已调整本单游客代收/客户已收路径金额。请核对流水与后续核销是否仍匹配。"
                action={
                  canAcknowledgeSourceAmountChange ? (
                    <Button
                      size="small"
                      loading={acknowledgeMutation.isPending}
                      onClick={() => acknowledgeMutation.mutate(transaction.id)}
                    >
                      已知悉
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="流水单号">
                <Typography.Text copyable>{transaction.transactionNo}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="流水方向">
                <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                  {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="交易日期">
                {transaction.transactionDate}
              </Descriptions.Item>
              <Descriptions.Item label="收付款方式">
                {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
              </Descriptions.Item>
              <Descriptions.Item label="收款方式">
                {counterpartyCollectionMethodText(transaction.counterpartyType)}
              </Descriptions.Item>
              <Descriptions.Item label="往来对象">
                {counterpartyDisplayName(transaction.counterpartyName)}
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
              <Descriptions.Item label="创建时间">
                {formatDateTime(transaction.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="流水备注" span="filled">
                {transaction.notes?.trim() || '-'}
              </Descriptions.Item>
            </Descriptions>
            <AmountStrip
              items={[
                {
                  label: '交易金额',
                  value: formatCents(transaction.amountCents),
                  emphasis: true,
                },
                {
                  label: '已核销金额',
                  value: formatCents(transaction.allocatedAmountCents),
                },
                {
                  label: '待核销金额',
                  value: formatCents(transaction.unallocatedAmountCents),
                },
              ]}
            />
          </DetailSection>

          <Divider style={{ margin: '24px 0' }} />
          <DetailSection title="核销概况">
            <Descriptions column={{ xs: 1, sm: 3 }} size="small">
              <Descriptions.Item label="核销状态">
                {writeoff ? (
                  <Tag color={TRANSACTION_WRITEOFF_STATUS_COLORS[writeoff.status]}>
                    {TRANSACTION_WRITEOFF_STATUS_LABELS[writeoff.status]}
                  </Tag>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="核销笔数">
                {transaction.verificationCount}
              </Descriptions.Item>
              <Descriptions.Item label="最近核销时间">
                {transaction.lastVerificationAt
                  ? formatDateTime(transaction.lastVerificationAt)
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          </DetailSection>

          <Divider style={{ margin: '24px 0' }} />
          <DetailSection title="核销记录">
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
          </DetailSection>
        </Flex>
      ) : null}
    </Drawer>
  )
}
