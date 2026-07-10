import { useMemo } from 'react'
import {
  Alert,
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
import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
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
import type { CreateVerificationFormValues, VerificationDirection } from '../utils/verification-form'
import { useCreateVerificationDrawerState } from '../hooks/useCreateVerificationDrawerState'

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
    return '-'
  }
  const departure = departureMap.get(departureId)
  if (!departure) {
    return '-'
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

function buildTransactionColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
): ColumnsType<FinanceTransactionSummary> {
  return [
    {
      title: '流水号',
      dataIndex: 'transactionNo',
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
}

function buildScheduleColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
): ColumnsType<PaymentScheduleSummary> {
  return [
    {
      title: '收付款节点编号',
      dataIndex: 'scheduleNo',
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
}

interface VerificationBasicsSectionProps {
  directionLocked: boolean
  departureOptions: Array<{ value: string; label: string }>
  lockedDepartureId?: string
  onDirectionChange: (direction: VerificationDirection) => void
}

function VerificationBasicsSection({
  directionLocked,
  departureOptions,
  lockedDepartureId,
  onDirectionChange,
}: VerificationBasicsSectionProps) {
  return (
    <>
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
              disabled={directionLocked}
              options={[...VERIFICATION_DIRECTION_OPTIONS]}
              onChange={(event) => onDirectionChange(event.target.value)}
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
    </>
  )
}

interface TransactionSelectionSectionProps {
  direction?: VerificationDirection
  selectedTransaction: FinanceTransactionSummary | null
  searchKeyword: string
  loading: boolean
  loadError: boolean
  columns: ColumnsType<FinanceTransactionSummary>
  candidateTransactions: FinanceTransactionSummary[]
  selectedTransactionId?: string
  onSearchKeywordChange: (keyword: string) => void
  onClearTransaction: () => void
  onSelectTransaction: (transaction: FinanceTransactionSummary) => void
}

function TransactionSelectionSection({
  direction,
  selectedTransaction,
  searchKeyword,
  loading,
  loadError,
  columns,
  candidateTransactions,
  selectedTransactionId,
  onSearchKeywordChange,
  onClearTransaction,
  onSelectTransaction,
}: TransactionSelectionSectionProps) {
  return (
    <>
      <Typography.Title level={5}>② 选择流水</Typography.Title>
      {!direction ? (
        <Typography.Text type="secondary">请先选择核销方向</Typography.Text>
      ) : selectedTransaction ? (
        <Card
          size="small"
          extra={
            <Button type="link" onClick={onClearTransaction}>
              重新选择
            </Button>
          }
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="流水号">
              {selectedTransaction.transactionNo}
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
      ) : loadError ? (
        <Alert type="error" showIcon title="流水候选加载失败，请关闭抽屉后重试" />
      ) : (
        <>
          <Input.Search
            allowClear
            placeholder="搜索流水号、往来对象或发团"
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
            onSearch={(value) => onSearchKeywordChange(value)}
            onPressEnter={(event) => event.preventDefault()}
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={candidateTransactions}
            pagination={false}
            scroll={{ x: 900, y: 240 }}
            rowClassName={(record) =>
              record.id === selectedTransactionId ? 'ant-table-row-selected' : ''
            }
            onRow={(record) => ({
              onClick: () => onSelectTransaction(record),
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}
    </>
  )
}

interface ScheduleSelectionSectionProps {
  selectedTransaction: FinanceTransactionSummary | null
  searchKeyword: string
  loading: boolean
  loadError: boolean
  columns: ColumnsType<PaymentScheduleSummary>
  candidateSchedules: PaymentScheduleSummary[]
  selectedScheduleId?: string
  onSearchKeywordChange: (keyword: string) => void
  onSelectSchedule: (schedule: PaymentScheduleSummary) => void
}

function ScheduleSelectionSection({
  selectedTransaction,
  searchKeyword,
  loading,
  loadError,
  columns,
  candidateSchedules,
  selectedScheduleId,
  onSearchKeywordChange,
  onSelectSchedule,
}: ScheduleSelectionSectionProps) {
  return (
    <>
      <Typography.Title level={5}>③ 可匹配收付款节点</Typography.Title>
      {!selectedTransaction ? (
        <Typography.Text type="secondary">请先选择流水</Typography.Text>
      ) : loadError ? (
        <Alert type="error" showIcon title="收付款节点候选加载失败，请关闭抽屉后重试" />
      ) : (
        <>
          <Input.Search
            allowClear
            placeholder="搜索单号、标题、往来对象或发团"
            value={searchKeyword}
            onChange={(event) => onSearchKeywordChange(event.target.value)}
            onSearch={(value) => onSearchKeywordChange(value)}
            onPressEnter={(event) => event.preventDefault()}
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={candidateSchedules}
            pagination={false}
            scroll={{ x: 900, y: 240 }}
            rowClassName={(record) =>
              record.id === selectedScheduleId ? 'ant-table-row-selected' : ''
            }
            onRow={(record) => ({
              onClick: () => onSelectSchedule(record),
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}
    </>
  )
}

interface VerificationConfirmSectionProps {
  selectedTransaction: FinanceTransactionSummary | null
  selectedSchedule: PaymentScheduleSummary | null
  postTransactionBalanceCents: number
  postUnsettledCents: number
}

function VerificationConfirmSection({
  selectedTransaction,
  selectedSchedule,
  postTransactionBalanceCents,
  postUnsettledCents,
}: VerificationConfirmSectionProps) {
  return (
    <>
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
    </>
  )
}

interface CreateVerificationFooterProps {
  loading: boolean
  submitDisabled: boolean
  onCancel: () => void
  onSubmit: () => void
}

function CreateVerificationFooter({
  loading,
  submitDisabled,
  onCancel,
  onSubmit,
}: CreateVerificationFooterProps) {
  return (
    <Space style={{ float: 'right' }}>
      <Button onClick={onCancel}>取消</Button>
      <Button type="primary" loading={loading} disabled={submitDisabled} onClick={onSubmit}>
        确认核销
      </Button>
    </Space>
  )
}

function VerificationHiddenFields() {
  return (
    <>
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
    </>
  )
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
  const state = useCreateVerificationDrawerState({
    open,
    form,
    lockedDepartureId,
    initialTransaction,
    initialSchedule,
  })

  const stepsCurrent = resolveStepsCurrent({
    direction: state.direction,
    transactionId: state.selectedTransactionId,
    paymentScheduleId: state.selectedScheduleId,
    amountYuan: state.amountYuan,
  })

  const transactionColumns = useMemo(
    () => buildTransactionColumns(state.departureMap),
    [state.departureMap],
  )
  const scheduleColumns = useMemo(
    () => buildScheduleColumns(state.departureMap),
    [state.departureMap],
  )

  return (
    <Drawer
      title="新增核销"
      open={open}
      size={960}
      onClose={onClose}
      destroyOnHidden
      footer={
        <CreateVerificationFooter
          loading={loading}
          submitDisabled={state.submitDisabled}
          onCancel={onClose}
          onSubmit={() => form.submit()}
        />
      }
    >
      <Steps current={stepsCurrent} items={STEP_ITEMS} style={{ marginBottom: 24 }} />

      <Form
        form={form}
        layout="vertical"
        initialValues={state.initialValues}
        onFinish={onSubmit}
      >
        <VerificationHiddenFields />

        <VerificationBasicsSection
          directionLocked={state.directionLocked}
          departureOptions={state.departureOptions}
          lockedDepartureId={lockedDepartureId}
          onDirectionChange={state.handleDirectionChange}
        />

        <Divider />

        <TransactionSelectionSection
          direction={state.direction}
          selectedTransaction={state.selectedTransaction}
          searchKeyword={state.transactionSearchKeyword}
          loading={state.transactionsLoading}
          loadError={state.transactionsError}
          columns={transactionColumns}
          candidateTransactions={state.candidateTransactions}
          selectedTransactionId={state.selectedTransactionId}
          onSearchKeywordChange={state.setTransactionSearchKeyword}
          onClearTransaction={state.handleClearTransaction}
          onSelectTransaction={state.handleSelectTransaction}
        />

        <Divider />

        <ScheduleSelectionSection
          selectedTransaction={state.selectedTransaction}
          searchKeyword={state.scheduleSearchKeyword}
          loading={state.schedulesLoading}
          loadError={state.schedulesError}
          columns={scheduleColumns}
          candidateSchedules={state.candidateSchedules}
          selectedScheduleId={state.selectedScheduleId}
          onSearchKeywordChange={state.setScheduleSearchKeyword}
          onSelectSchedule={state.handleSelectSchedule}
        />

        <Divider />

        <VerificationConfirmSection
          selectedTransaction={state.selectedTransaction}
          selectedSchedule={state.selectedSchedule}
          postTransactionBalanceCents={state.postTransactionBalanceCents}
          postUnsettledCents={state.postUnsettledCents}
        />
      </Form>
    </Drawer>
  )
}
