import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { listDepartures } from '@/services/departure.service'
import {
  listPayables,
  listReceivables,
  listTransactions,
} from '@/services/finance.service'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  VERIFICATION_DIRECTION_OPTIONS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { dateStringToDayjs, dayjsToDateString, yuanToCents } from '../utils/finance-form'
import {
  filterCandidateSchedules,
  filterCandidateTransactions,
} from '../utils/verification-candidates'
import {
  emptyCreateVerificationFormValues,
  transactionAndScheduleToFormValues,
  directionFromTransaction,
  type CreateVerificationFormValues,
  type VerificationDirection,
} from '../utils/verification-form'

const STEP_ITEMS = [
  { title: '基础信息' },
  { title: '选择流水' },
  { title: '匹配节点' },
  { title: '确认核销' },
]

const SECTION_CONFIRM_TITLE = '④ 确认核销'

interface CreateVerificationDrawerProps {
  open: boolean
  loading: boolean
  form: FormInstance<CreateVerificationFormValues>
  onClose: () => void
  onSubmit: (values: CreateVerificationFormValues) => void
  lockedDepartureId?: string
  initialTransaction?: FinanceTransactionSummary
  initialSchedule?: PaymentScheduleSummary
}

function formatDepartureLabel(
  departureId: string | null | undefined,
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

function resolveStepsCurrent(values: {
  direction?: VerificationDirection
  transactionId?: string
  paymentScheduleId?: string
  amountYuan?: number
}): number {
  if (!values.direction) {
    return 0
  }
  if (!values.transactionId) {
    return 1
  }
  if (!values.paymentScheduleId) {
    return 2
  }
  return 3
}

export function CreateVerificationDrawer({
  open,
  loading,
  form,
  onClose,
  onSubmit,
  lockedDepartureId,
  initialTransaction,
  initialSchedule,
}: CreateVerificationDrawerProps) {
  const [transactionSearchKeyword, setTransactionSearchKeyword] = useState('')
  const [scheduleSearchKeyword, setScheduleSearchKeyword] = useState('')

  const direction = Form.useWatch('direction', form)
  const departureId = Form.useWatch('departureId', form)
  const counterpartyKeyword = Form.useWatch('counterpartyKeyword', form)
  const selectedTransactionId = Form.useWatch('transactionId', form)
  const selectedScheduleId = Form.useWatch('paymentScheduleId', form)
  const amountYuan = Form.useWatch('amountYuan', form)
  const verificationDate = Form.useWatch('verificationDate', form)

  const effectiveDepartureId = lockedDepartureId ?? departureId

  useEffect(() => {
    if (!open) {
      setTransactionSearchKeyword('')
      setScheduleSearchKeyword('')
      return
    }

    form.resetFields()
    const initialValues = emptyCreateVerificationFormValues({
      ...(lockedDepartureId ? { departureId: lockedDepartureId } : {}),
    })

    if (initialTransaction) {
      initialValues.transactionId = initialTransaction.id
      initialValues.direction = directionFromTransaction(initialTransaction)
      if (initialTransaction.departureId && !lockedDepartureId) {
        initialValues.departureId = initialTransaction.departureId
      }
    }

    if (initialSchedule) {
      initialValues.paymentScheduleId = initialSchedule.id
      initialValues.direction =
        initialSchedule.direction === 'receivable' ? 'receivable' : 'payable'
      if (initialSchedule.departureId && !lockedDepartureId) {
        initialValues.departureId = initialSchedule.departureId
      }
    }

    form.setFieldsValue(initialValues)
  }, [form, initialSchedule, initialTransaction, lockedDepartureId, open])

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'create-verification'],
    queryFn: () => listDepartures({ pageSize: 100 }),
    enabled: open,
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    return map
  }, [departuresResult?.items])

  const departureOptions = useMemo(
    () =>
      (departuresResult?.items ?? []).map((departure) => ({
        value: departure.id,
        label: `${departure.departureNo} · ${departure.name}`,
      })),
    [departuresResult?.items],
  )

  const { data: transactionsResult, isLoading: transactionsLoading } = useQuery({
    queryKey: ['finance-transactions', 'create-verification', effectiveDepartureId],
    queryFn: () =>
      listTransactions({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction),
  })

  const isReceivable = direction === 'receivable'

  const { data: schedulesResult, isLoading: schedulesLoading } = useQuery({
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'create-verification',
      effectiveDepartureId,
      selectedTransactionId,
    ],
    queryFn: () =>
      (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction) && Boolean(selectedTransactionId),
  })

  const candidateTransactions = useMemo(() => {
    if (!direction) {
      return []
    }

    return filterCandidateTransactions({
      transactions: transactionsResult?.items ?? [],
      direction,
      departureId: effectiveDepartureId,
      counterpartyKeyword,
      searchKeyword: transactionSearchKeyword,
      departureMap,
    })
  }, [
    counterpartyKeyword,
    departureMap,
    direction,
    effectiveDepartureId,
    transactionSearchKeyword,
    transactionsResult?.items,
  ])

  const selectedTransaction = useMemo(() => {
    const fromCandidates = candidateTransactions.find((item) => item.id === selectedTransactionId)
    if (fromCandidates) {
      return fromCandidates
    }
    return (transactionsResult?.items ?? []).find((item) => item.id === selectedTransactionId) ?? null
  }, [candidateTransactions, selectedTransactionId, transactionsResult?.items])

  const candidateSchedules = useMemo(() => {
    if (!selectedTransaction) {
      return []
    }

    return filterCandidateSchedules({
      schedules: schedulesResult?.items ?? [],
      selectedTransaction,
      departureId: effectiveDepartureId,
      searchKeyword: scheduleSearchKeyword,
      departureMap,
    })
  }, [
    departureMap,
    effectiveDepartureId,
    scheduleSearchKeyword,
    schedulesResult?.items,
    selectedTransaction,
  ])

  const selectedSchedule = useMemo(() => {
    const fromCandidates = candidateSchedules.find((item) => item.id === selectedScheduleId)
    if (fromCandidates) {
      return fromCandidates
    }
    return (schedulesResult?.items ?? []).find((item) => item.id === selectedScheduleId) ?? null
  }, [candidateSchedules, schedulesResult?.items, selectedScheduleId])

  const postTransactionBalanceCents =
    selectedTransaction && typeof amountYuan === 'number'
      ? Math.max(selectedTransaction.unallocatedAmountCents - yuanToCents(amountYuan), 0)
      : (selectedTransaction?.unallocatedAmountCents ?? 0)

  const postUnsettledCents =
    selectedSchedule && typeof amountYuan === 'number'
      ? Math.max(selectedSchedule.unsettledAmountCents - yuanToCents(amountYuan), 0)
      : (selectedSchedule?.unsettledAmountCents ?? 0)

  const stepsCurrent = resolveStepsCurrent({
    direction,
    transactionId: selectedTransactionId,
    paymentScheduleId: selectedScheduleId,
    amountYuan,
  })

  const handleDirectionChange = (nextDirection: VerificationDirection) => {
    form.setFieldsValue({
      direction: nextDirection,
      transactionId: '',
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setTransactionSearchKeyword('')
    setScheduleSearchKeyword('')
  }

  const handleSelectTransaction = (transaction: FinanceTransactionSummary) => {
    form.setFieldsValue({
      transactionId: transaction.id,
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setScheduleSearchKeyword('')
  }

  const handleClearTransaction = () => {
    form.setFieldsValue({
      transactionId: '',
      paymentScheduleId: '',
      amountYuan: 0,
    })
    setScheduleSearchKeyword('')
  }

  const handleSelectSchedule = (schedule: PaymentScheduleSummary) => {
    if (!selectedTransaction) {
      return
    }
    form.setFieldsValue(transactionAndScheduleToFormValues(selectedTransaction, schedule))
  }

  const transactionColumns: ColumnsType<FinanceTransactionSummary> = [
    {
      title: '流水号',
      dataIndex: 'transactionNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '日期', dataIndex: 'transactionDate' },
    {
      title: '方向',
      dataIndex: 'direction',
      render: (itemDirection: string) => (
        <Tag color={TRANSACTION_DIRECTION_COLORS[itemDirection]}>
          {catalogLabel(TRANSACTION_DIRECTION_LABELS, itemDirection)}
        </Tag>
      ),
    },
    {
      title: '往来对象',
      render: (_, record) => formatTransactionCounterpartyLabel(record),
    },
    {
      title: '发团',
      dataIndex: 'departureId',
      render: (itemDepartureId: string | null) => formatDepartureLabel(itemDepartureId, departureMap),
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

  const scheduleColumns: ColumnsType<PaymentScheduleSummary> = [
    {
      title: '收付款节点编号',
      dataIndex: 'scheduleNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '标题', dataIndex: 'title' },
    {
      title: '发团',
      dataIndex: 'departureId',
      render: (itemDepartureId: string) => formatDepartureLabel(itemDepartureId, departureMap),
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

  const submitDisabled =
    !selectedTransaction ||
    !selectedSchedule ||
    amountYuan == null ||
    amountYuan <= 0 ||
    !verificationDate

  return (
    <Drawer
      title="新增核销"
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
            disabled={submitDisabled}
            onClick={() => form.submit()}
          >
            确认核销
          </Button>
        </Space>
      }
    >
      <Steps current={stepsCurrent} items={STEP_ITEMS} style={{ marginBottom: 24 }} />

      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="transactionId" hidden rules={[{ required: true, message: '请选择流水' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="paymentScheduleId"
          hidden
          rules={[{ required: true, message: '请选择收付款节点' }]}
        >
          <Input />
        </Form.Item>

        <Typography.Title level={5} style={{ marginTop: 0 }}>
          ① 基础信息
        </Typography.Title>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="direction"
              label="核销方向"
              rules={[{ required: true, message: '请选择核销方向' }]}
            >
              <Radio.Group
                options={[...VERIFICATION_DIRECTION_OPTIONS]}
                onChange={(event) => handleDirectionChange(event.target.value)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="verificationDate"
              label="核销日期"
              rules={[{ required: true, message: '请选择核销日期' }]}
              getValueProps={(value: string) => ({ value: dateStringToDayjs(value) })}
              normalize={(value) => dayjsToDateString(value)}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="departureId" label="关联发团">
              <Select
                allowClear
                showSearch
                placeholder="可选，缩小候选范围"
                options={departureOptions}
                optionFilterProp="label"
                disabled={Boolean(lockedDepartureId)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="counterpartyKeyword" label="往来对象">
          <Input allowClear placeholder="可选，模糊过滤往来对象名称" />
        </Form.Item>

        <Divider />

        <Typography.Title level={5}>② 选择流水</Typography.Title>
        {!direction ? (
          <Typography.Text type="secondary">请先选择核销方向</Typography.Text>
        ) : selectedTransaction ? (
          <>
            <Card
              size="small"
              extra={
                <Button type="link" onClick={handleClearTransaction}>
                  重新选择
                </Button>
              }
            >
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
                  {formatTransactionCounterpartyLabel(selectedTransaction)}
                </Descriptions.Item>
                <Descriptions.Item label="流水金额">
                  {formatCents(selectedTransaction.amountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="可核销余额">
                  {formatCents(selectedTransaction.unallocatedAmountCents)}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </>
        ) : (
          <>
            <Input.Search
              allowClear
              placeholder="搜索流水号、往来对象或发团"
              value={transactionSearchKeyword}
              onChange={(event) => setTransactionSearchKeyword(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="id"
              size="small"
              loading={transactionsLoading}
              columns={transactionColumns}
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
          </>
        )}

        <Divider />

        <Typography.Title level={5}>③ 可匹配收付款节点</Typography.Title>
        {!selectedTransaction ? (
          <Typography.Text type="secondary">请先选择流水</Typography.Text>
        ) : (
          <>
            <Input.Search
              allowClear
              placeholder="搜索单号、标题、往来对象或发团"
              value={scheduleSearchKeyword}
              onChange={(event) => setScheduleSearchKeyword(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="id"
              size="small"
              loading={schedulesLoading}
              columns={scheduleColumns}
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
          </>
        )}

        <Divider />

        <Typography.Title level={5}>{SECTION_CONFIRM_TITLE}</Typography.Title>
        {!selectedSchedule || !selectedTransaction ? (
          <Typography.Text type="secondary">请先选择流水与收付款节点</Typography.Text>
        ) : (
          <>
            <Form.Item
              name="amountYuan"
              label="本次核销金额（元）"
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
                    if (amountCents > selectedSchedule.unsettledAmountCents) {
                      return Promise.reject(new Error('金额不能超过节点未结清金额'))
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
                <Form.Item label="核销后流水余额">
                  <Input value={formatCents(postTransactionBalanceCents)} disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="核销后节点未结金额">
                  <Input value={formatCents(postUnsettledCents)} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remark" label="备注">
              <Input.TextArea maxLength={200} showCount rows={3} placeholder="可选" />
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  )
}
