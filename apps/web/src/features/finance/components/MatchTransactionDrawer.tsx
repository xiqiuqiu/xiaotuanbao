import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { listTransactions } from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { yuanToCents } from '../utils/finance-form'
import {
  transactionToLinkTransactionValues,
  type LinkTransactionFormValues,
} from '../utils/link-transaction-form'

type MatchTransactionVariant = 'collection' | 'payment'

const COPY: Record<
  MatchTransactionVariant,
  {
    title: string
    scheduleNoLabel: string
    counterpartyLabel: string
    totalLabel: string
    settledLabel: string
    unsettledLabel: string
    postUnsettledLabel: string
    postTransactionBalanceLabel: string
    verificationDirectionLabel: string
    amountLabel: string
    submitLabel: string
  }
> = {
  collection: {
    title: '匹配流水',
    scheduleNoLabel: '应收单号',
    counterpartyLabel: '客户',
    totalLabel: '应收总额',
    settledLabel: '已收',
    unsettledLabel: '未收',
    postUnsettledLabel: '核销后未收',
    postTransactionBalanceLabel: '核销后流水余额',
    verificationDirectionLabel: '应收核销',
    amountLabel: '本次核销金额（元）',
    submitLabel: '确认核销',
  },
  payment: {
    title: '匹配流水',
    scheduleNoLabel: '应付单号',
    counterpartyLabel: '供应商',
    totalLabel: '应付总额',
    settledLabel: '已付',
    unsettledLabel: '未付',
    postUnsettledLabel: '核销后未付',
    postTransactionBalanceLabel: '核销后流水余额',
    verificationDirectionLabel: '应付核销',
    amountLabel: '本次核销金额（元）',
    submitLabel: '确认核销',
  },
}

interface MatchTransactionDrawerProps {
  variant: MatchTransactionVariant
  open: boolean
  schedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  loading: boolean
  form: FormInstance<LinkTransactionFormValues>
  onClose: () => void
  onSubmit: (values: LinkTransactionFormValues) => void
}

function formatDepartureLabel(
  departureId: string | null,
  departureMap: Map<string, { departureNo: string; name: string }>,
): string {
  if (!departureId) {
    return '—'
  }
  const departure = departureMap.get(departureId)
  if (!departure) {
    return '—'
  }
  return `${departure.departureNo} · ${departure.name}`
}

function formatCounterpartyLabel(transaction: FinanceTransactionSummary): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, transaction.counterpartyType)
  return transaction.counterpartyName ? `${typeLabel} · ${transaction.counterpartyName}` : typeLabel
}

function matchesCounterparty(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): boolean {
  if (transaction.counterpartyType !== schedule.counterpartyType) {
    return false
  }
  if (schedule.counterpartyId) {
    return transaction.counterpartyId === schedule.counterpartyId
  }
  return transaction.counterpartyName === schedule.counterpartyName
}

export function MatchTransactionDrawer({
  variant,
  open,
  schedule,
  departureMap,
  loading,
  form,
  onClose,
  onSubmit,
}: MatchTransactionDrawerProps) {
  const copy = COPY[variant]
  const [searchKeyword, setSearchKeyword] = useState('')
  const selectedTransactionId = Form.useWatch('transactionId', form)
  const amountYuan = Form.useWatch('amountYuan', form)

  const expectedDirection =
    variant === 'collection' ? TransactionDirection.INFLOW : TransactionDirection.OUTFLOW

  const { data: transactionsResult, isLoading } = useQuery({
    queryKey: ['finance-transactions', 'match', schedule?.departureId, schedule?.counterpartyType],
    queryFn: () =>
      listTransactions({
        departureId: schedule?.departureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(schedule),
  })

  const candidateTransactions = useMemo(() => {
    if (!schedule) {
      return []
    }

    const normalizedKeyword = searchKeyword.trim().toLowerCase()

    return (transactionsResult?.items ?? []).filter((transaction) => {
      if (
        transaction.voidedAt ||
        transaction.unallocatedAmountCents <= 0 ||
        transaction.direction !== expectedDirection ||
        !matchesCounterparty(transaction, schedule)
      ) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const departureLabel = formatDepartureLabel(transaction.departureId, departureMap)
      const haystack =
        `${transaction.transactionNo} ${transaction.counterpartyName ?? ''} ${departureLabel}`.toLowerCase()
      return haystack.includes(normalizedKeyword)
    })
  }, [departureMap, expectedDirection, schedule, searchKeyword, transactionsResult?.items])

  const selectedTransaction = useMemo(
    () => candidateTransactions.find((item) => item.id === selectedTransactionId) ?? null,
    [candidateTransactions, selectedTransactionId],
  )

  const postTransactionBalanceCents =
    selectedTransaction && typeof amountYuan === 'number'
      ? Math.max(selectedTransaction.unallocatedAmountCents - yuanToCents(amountYuan), 0)
      : (selectedTransaction?.unallocatedAmountCents ?? 0)

  const postUnsettledCents =
    schedule && typeof amountYuan === 'number'
      ? Math.max(schedule.unsettledAmountCents - yuanToCents(amountYuan), 0)
      : (schedule?.unsettledAmountCents ?? 0)

  const handleSelectTransaction = (transaction: FinanceTransactionSummary) => {
    if (!schedule) {
      return
    }
    form.setFieldsValue(transactionToLinkTransactionValues(transaction, schedule))
  }

  const columns: ColumnsType<FinanceTransactionSummary> = [
    {
      title: '流水号',
      dataIndex: 'transactionNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '日期', dataIndex: 'transactionDate' },
    {
      title: '方向',
      dataIndex: 'direction',
      render: (direction: string) => (
        <Tag color={TRANSACTION_DIRECTION_COLORS[direction]}>
          {catalogLabel(TRANSACTION_DIRECTION_LABELS, direction)}
        </Tag>
      ),
    },
    {
      title: '往来对象',
      render: (_, record) => formatCounterpartyLabel(record),
    },
    {
      title: '团单',
      dataIndex: 'departureId',
      render: (departureId: string | null) => formatDepartureLabel(departureId, departureMap),
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
      title: '可核销余额',
      dataIndex: 'unallocatedAmountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '收付款通道',
      dataIndex: 'paymentChannel',
      render: (value: string) => catalogLabel(PAYMENT_CHANNEL_LABELS, value),
    },
  ]

  return (
    <Drawer
      title={copy.title}
      open={open}
      width={960}
      onClose={onClose}
      destroyOnClose
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={loading}
            disabled={!selectedTransaction}
            onClick={() => form.submit()}
          >
            {copy.submitLabel}
          </Button>
        </Space>
      }
    >
      {schedule ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            账款信息
          </Typography.Title>
          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Form.Item name="transactionId" hidden rules={[{ required: true, message: '请选择流水' }]}>
              <Input />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={copy.scheduleNoLabel}>
                  <Input value={schedule.scheduleNo} disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="标题">
                  <Input value={schedule.title} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="关联团单">
                  <Input value={formatDepartureLabel(schedule.departureId, departureMap)} disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={copy.counterpartyLabel}>
                  <Input
                    value={
                      schedule.counterpartyName
                        ? `${catalogLabel(COUNTERPARTY_TYPE_LABELS, schedule.counterpartyType)} · ${schedule.counterpartyName}`
                        : catalogLabel(COUNTERPARTY_TYPE_LABELS, schedule.counterpartyType)
                    }
                    disabled
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label={copy.totalLabel}>
                  <Input value={formatCents(schedule.amountCents)} disabled />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={copy.settledLabel}>
                  <Input value={formatCents(schedule.settledAmountCents)} disabled />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label={copy.unsettledLabel}>
                  <Input value={formatCents(schedule.unsettledAmountCents)} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="核销方向">
              <Input value={copy.verificationDirectionLabel} disabled />
            </Form.Item>

            <Divider style={{ margin: '8px 0 16px' }} />

            <Typography.Title level={5}>候选流水</Typography.Title>
            <Input.Search
              allowClear
              placeholder="搜索流水号、往来对象或团单"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="id"
              size="small"
              loading={isLoading}
              columns={columns}
              dataSource={candidateTransactions}
              pagination={false}
              scroll={{ x: 900, y: 240 }}
              rowClassName={(record) =>
                record.id === selectedTransactionId ? 'ant-table-row-selected' : ''
              }
              onRow={(record) => ({
                onClick: () => handleSelectTransaction(record),
                style: { cursor: 'pointer' },
              })}
            />

            {selectedTransaction ? (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Typography.Title level={5}>已选流水</Typography.Title>
                <Card size="small">
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="流水号">
                      <Typography.Text code>{selectedTransaction.transactionNo}</Typography.Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="交易日期">
                      {selectedTransaction.transactionDate}
                    </Descriptions.Item>
                    <Descriptions.Item label="收支方向">
                      <Tag color={TRANSACTION_DIRECTION_COLORS[selectedTransaction.direction]}>
                        {catalogLabel(TRANSACTION_DIRECTION_LABELS, selectedTransaction.direction)}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="往来对象">
                      {formatCounterpartyLabel(selectedTransaction)}
                    </Descriptions.Item>
                    <Descriptions.Item label="流水金额">
                      {formatCents(selectedTransaction.amountCents)}
                    </Descriptions.Item>
                    <Descriptions.Item label="已核销">
                      {formatCents(selectedTransaction.allocatedAmountCents)}
                    </Descriptions.Item>
                    <Descriptions.Item label="可核销余额">
                      {formatCents(selectedTransaction.unallocatedAmountCents)}
                    </Descriptions.Item>
                    <Descriptions.Item label="收付款通道">
                      {catalogLabel(PAYMENT_CHANNEL_LABELS, selectedTransaction.paymentChannel)}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <Divider style={{ margin: '16px 0' }} />
                <Typography.Title level={5}>本次核销</Typography.Title>
                <Form.Item
                  name="amountYuan"
                  label={copy.amountLabel}
                  rules={[
                    { required: true, message: '请输入核销金额' },
                    {
                      validator: (_, value) => {
                        if (value == null || value <= 0) {
                          return Promise.reject(new Error('金额必须大于 0'))
                        }
                        const amountCents = yuanToCents(value)
                        if (amountCents > selectedTransaction.unallocatedAmountCents) {
                          return Promise.reject(new Error('金额不能超过流水可核销余额'))
                        }
                        if (amountCents > schedule.unsettledAmountCents) {
                          return Promise.reject(new Error(`金额不能超过${copy.unsettledLabel}金额`))
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
                </Form.Item>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label={copy.postTransactionBalanceLabel}>
                      <Input value={formatCents(postTransactionBalanceCents)} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label={copy.postUnsettledLabel}>
                      <Input value={formatCents(postUnsettledCents)} disabled />
                    </Form.Item>
                  </Col>
                </Row>
              </>
            ) : null}
          </Form>
        </>
      ) : null}
    </Drawer>
  )
}
