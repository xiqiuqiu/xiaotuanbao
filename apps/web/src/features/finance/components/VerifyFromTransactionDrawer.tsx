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
import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { listPayables, listReceivables } from '@/services/finance.service'
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
  scheduleToVerifyFormValues,
  type VerifyFromTransactionFormValues,
} from '../utils/verify-from-transaction-form'

type VerifyFromTransactionVariant = 'collection' | 'payment'

const COPY: Record<
  VerifyFromTransactionVariant,
  {
    scheduleNoLabel: string
    counterpartyLabel: string
    totalLabel: string
    settledLabel: string
    unsettledLabel: string
    postUnsettledLabel: string
    postTransactionBalanceLabel: string
    candidateTitle: string
    amountLabel: string
    submitLabel: string
  }
> = {
  collection: {
    scheduleNoLabel: '应收单号',
    counterpartyLabel: '客户',
    totalLabel: '应收总额',
    settledLabel: '已收',
    unsettledLabel: '未收',
    postUnsettledLabel: '核销后未收',
    postTransactionBalanceLabel: '核销后流水余额',
    candidateTitle: '候选应收节点',
    amountLabel: '本次核销金额（元）',
    submitLabel: '确认核销',
  },
  payment: {
    scheduleNoLabel: '应付单号',
    counterpartyLabel: '供应商',
    totalLabel: '应付总额',
    settledLabel: '已付',
    unsettledLabel: '未付',
    postUnsettledLabel: '核销后未付',
    postTransactionBalanceLabel: '核销后流水余额',
    candidateTitle: '候选应付节点',
    amountLabel: '本次核销金额（元）',
    submitLabel: '确认核销',
  },
}

interface VerifyFromTransactionDrawerProps {
  open: boolean
  transaction: FinanceTransactionSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  loading: boolean
  form: FormInstance<VerifyFromTransactionFormValues>
  onClose: () => void
  onSubmit: (values: VerifyFromTransactionFormValues) => void
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

function formatCounterpartyLabel(
  counterpartyType: string,
  counterpartyName: string | null,
): string {
  const typeLabel = catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
  return counterpartyName ? `${typeLabel} · ${counterpartyName}` : typeLabel
}

function formatTransactionCounterpartyLabel(transaction: FinanceTransactionSummary): string {
  return formatCounterpartyLabel(transaction.counterpartyType, transaction.counterpartyName)
}

function formatScheduleCounterpartyLabel(schedule: PaymentScheduleSummary): string {
  return formatCounterpartyLabel(schedule.counterpartyType, schedule.counterpartyName)
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

function resolveVariant(transaction: FinanceTransactionSummary): VerifyFromTransactionVariant {
  return transaction.direction === TransactionDirection.INFLOW ? 'collection' : 'payment'
}

export function VerifyFromTransactionDrawer({
  open,
  transaction,
  departureMap,
  loading,
  form,
  onClose,
  onSubmit,
}: VerifyFromTransactionDrawerProps) {
  const variant = transaction ? resolveVariant(transaction) : 'collection'
  const copy = COPY[variant]
  const [searchKeyword, setSearchKeyword] = useState('')
  const selectedScheduleId = Form.useWatch('paymentScheduleId', form)
  const amountYuan = Form.useWatch('amountYuan', form)

  const isReceivable = variant === 'collection'

  const { data: schedulesResult, isLoading } = useQuery({
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'verify-from-transaction',
      transaction?.departureId,
    ],
    queryFn: () =>
      (isReceivable ? listReceivables : listPayables)({
        departureId: transaction?.departureId ?? undefined,
        pageSize: 100,
      }),
    enabled: open && Boolean(transaction),
  })

  const candidateSchedules = useMemo(() => {
    if (!transaction) {
      return []
    }

    const normalizedKeyword = searchKeyword.trim().toLowerCase()

    return (schedulesResult?.items ?? []).filter((schedule) => {
      if (
        schedule.status === PaymentScheduleStatus.CANCELLED ||
        schedule.unsettledAmountCents <= 0 ||
        !matchesCounterparty(transaction, schedule)
      ) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const departureLabel = formatDepartureLabel(schedule.departureId, departureMap)
      const haystack =
        `${schedule.scheduleNo} ${schedule.title} ${schedule.counterpartyName ?? ''} ${departureLabel}`.toLowerCase()
      return haystack.includes(normalizedKeyword)
    })
  }, [departureMap, schedulesResult?.items, searchKeyword, transaction])

  const selectedSchedule = useMemo(
    () => candidateSchedules.find((item) => item.id === selectedScheduleId) ?? null,
    [candidateSchedules, selectedScheduleId],
  )

  const postTransactionBalanceCents =
    transaction && typeof amountYuan === 'number'
      ? Math.max(transaction.unallocatedAmountCents - yuanToCents(amountYuan), 0)
      : (transaction?.unallocatedAmountCents ?? 0)

  const postUnsettledCents =
    selectedSchedule && typeof amountYuan === 'number'
      ? Math.max(selectedSchedule.unsettledAmountCents - yuanToCents(amountYuan), 0)
      : (selectedSchedule?.unsettledAmountCents ?? 0)

  const handleSelectSchedule = (schedule: PaymentScheduleSummary) => {
    if (!transaction) {
      return
    }
    form.setFieldsValue(scheduleToVerifyFormValues(schedule, transaction))
  }

  const columns: ColumnsType<PaymentScheduleSummary> = [
    {
      title: '单号',
      dataIndex: 'scheduleNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '标题', dataIndex: 'title' },
    {
      title: '关联发团',
      dataIndex: 'departureId',
      render: (departureId: string) => formatDepartureLabel(departureId, departureMap),
    },
    {
      title: '往来对象',
      render: (_, record) => formatScheduleCounterpartyLabel(record),
    },
    {
      title: '总额',
      dataIndex: 'amountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已结',
      dataIndex: 'settledAmountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未结',
      dataIndex: 'unsettledAmountCents',
      render: (value: number) => formatCents(value),
    },
    { title: '到期日', dataIndex: 'dueDate' },
  ]

  return (
    <Drawer
      title="去核销"
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
            disabled={!selectedSchedule}
            onClick={() => form.submit()}
          >
            {copy.submitLabel}
          </Button>
        </Space>
      }
    >
      {transaction ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            流水信息
          </Typography.Title>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="流水号">
                <Typography.Text code>{transaction.transactionNo}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="交易日期">{transaction.transactionDate}</Descriptions.Item>
              <Descriptions.Item label="收支方向">
                <Tag color={TRANSACTION_DIRECTION_COLORS[transaction.direction]}>
                  {catalogLabel(TRANSACTION_DIRECTION_LABELS, transaction.direction)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="往来对象">
                {formatTransactionCounterpartyLabel(transaction)}
              </Descriptions.Item>
              <Descriptions.Item label="关联发团">
                {formatDepartureLabel(transaction.departureId, departureMap)}
              </Descriptions.Item>
              <Descriptions.Item label="流水金额">
                {formatCents(transaction.amountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="已核销">
                {formatCents(transaction.allocatedAmountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="可核销余额">
                {formatCents(transaction.unallocatedAmountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="收付款通道">
                {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Form.Item
              name="paymentScheduleId"
              hidden
              rules={[{ required: true, message: '请选择收付款节点' }]}
            >
              <Input />
            </Form.Item>

            <Typography.Title level={5}>{copy.candidateTitle}</Typography.Title>
            <Input.Search
              allowClear
              placeholder="搜索单号、标题或往来对象"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="id"
              size="small"
              loading={isLoading}
              columns={columns}
              dataSource={candidateSchedules}
              pagination={false}
              scroll={{ x: 900, y: 240 }}
              rowClassName={(record) =>
                record.id === selectedScheduleId ? 'ant-table-row-selected' : ''
              }
              onRow={(record) => ({
                onClick: () => handleSelectSchedule(record),
                style: { cursor: 'pointer' },
              })}
            />

            {selectedSchedule ? (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Typography.Title level={5}>已选节点</Typography.Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label={copy.scheduleNoLabel}>
                      <Input value={selectedSchedule.scheduleNo} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="标题">
                      <Input value={selectedSchedule.title} disabled />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="关联发团">
                      <Input
                        value={formatDepartureLabel(selectedSchedule.departureId, departureMap)}
                        disabled
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label={copy.counterpartyLabel}>
                      <Input value={formatScheduleCounterpartyLabel(selectedSchedule)} disabled />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label={copy.totalLabel}>
                      <Input value={formatCents(selectedSchedule.amountCents)} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="已结清">
                      <Input value={formatCents(selectedSchedule.settledAmountCents)} disabled />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="未结清">
                      <Input value={formatCents(selectedSchedule.unsettledAmountCents)} disabled />
                    </Form.Item>
                  </Col>
                </Row>

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
                        if (amountCents > transaction.unallocatedAmountCents) {
                          return Promise.reject(new Error('金额不能超过流水可核销余额'))
                        }
                        if (amountCents > selectedSchedule.unsettledAmountCents) {
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
