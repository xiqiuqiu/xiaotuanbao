import { useEffect, useMemo, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  theme,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { ColumnsType } from 'antd/es/table'
import type {
  FinanceTransactionSummary,
  PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_CHANNEL_LABELS,
  TRANSACTION_DIRECTION_COLORS,
  TRANSACTION_DIRECTION_LABELS,
  VERIFICATION_DIRECTION_OPTIONS,
  VERIFICATION_DIRECTION_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import {
  dateStringToDayjs,
  dayjsToDateString,
  yuanToCents,
} from '../utils/finance-form'
import type {
  CreateVerificationFormValues,
  VerificationDirection,
} from '../utils/verification-form'
import { useCreateVerificationDrawerState } from '../hooks/useCreateVerificationDrawerState'
import styles from './CreateVerificationDrawer.module.css'

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

function formatTransactionCounterpartyLabel(
  transaction: FinanceTransactionSummary,
): string {
  return formatCounterpartyLabel(
    transaction.counterpartyType,
    transaction.counterpartyName,
  )
}

function formatScheduleCounterpartyLabel(
  schedule: PaymentScheduleSummary,
): string {
  return formatCounterpartyLabel(
    schedule.counterpartyType,
    schedule.counterpartyName,
  )
}

function buildTransactionColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
): ColumnsType<FinanceTransactionSummary> {
  return [
    {
      title: '流水信息',
      width: 224,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{record.transactionNo}</Typography.Text>
          <Space size={4} wrap>
            <Typography.Text type="secondary">
              {record.transactionDate}
            </Typography.Text>
            <Tag color={TRANSACTION_DIRECTION_COLORS[record.direction]}>
              {catalogLabel(TRANSACTION_DIRECTION_LABELS, record.direction)}
            </Tag>
            <Typography.Text type="secondary">
              {catalogLabel(PAYMENT_CHANNEL_LABELS, record.paymentChannel)}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '往来对象 / 发团',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>
            {formatTransactionCounterpartyLabel(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDepartureLabel(record.departureId, departureMap)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '流水金额',
      dataIndex: 'amountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已核销',
      dataIndex: 'allocatedAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '可核销余额',
      dataIndex: 'unallocatedAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
  ]
}

function buildScheduleColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
  isReceivable: boolean,
): ColumnsType<PaymentScheduleSummary> {
  return [
    {
      title: '节点信息',
      width: 224,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{record.scheduleNo}</Typography.Text>
          <Typography.Text type="secondary">{record.title}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '往来对象 / 发团',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text>
            {formatScheduleCounterpartyLabel(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDepartureLabel(record.departureId, departureMap)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '总额',
      dataIndex: 'amountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已结',
      dataIndex: 'settledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未结',
      dataIndex: 'unsettledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    ...(isReceivable
      ? [{ title: '到期日', dataIndex: 'dueDate' as const }]
      : []),
  ]
}

interface VerificationBasicsSectionProps {
  directionLocked: boolean
  departureOptions: Array<{ value: string; label: string }>
  lockedDepartureId?: string
  onDirectionChange: (direction: VerificationDirection) => void
  onDepartureChange: () => void
}

function VerificationBasicsSection({
  directionLocked,
  departureOptions,
  lockedDepartureId,
  onDirectionChange,
  onDepartureChange,
}: VerificationBasicsSectionProps) {
  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        核销条件
      </Typography.Title>
      <Row gutter={16}>
        <Col xs={24} md={7}>
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
        <Col xs={24} md={7}>
          <Form.Item
            name="verificationDate"
            label="核销日期"
            rules={[{ required: true, message: '请选择核销日期' }]}
            getValueProps={(value: string) => ({
              value: dateStringToDayjs(value),
            })}
            normalize={(value) => dayjsToDateString(value)}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={10}>
          <Form.Item name="departureId" label="关联发团">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="可选，缩小候选范围"
              options={departureOptions}
              disabled={Boolean(lockedDepartureId)}
              onChange={onDepartureChange}
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

function SelectionSectionHeader({
  title,
  selected,
  onClear,
}: {
  title: string
  selected: boolean
  onClear?: () => void
}) {
  return (
    <div className={styles.sectionHeader}>
      <Space size={8} wrap>
        <Typography.Text strong>{title}</Typography.Text>
        {selected ? (
          <Typography.Text type="secondary">（已选择）</Typography.Text>
        ) : null}
      </Space>
      {selected && onClear ? (
        <Button type="link" size="small" onClick={onClear}>
          重新选择
        </Button>
      ) : null}
    </div>
  )
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
  const { token } = theme.useToken()

  return (
    <section
      className={styles.selectionSection}
      style={{
        borderColor: token.colorBorderSecondary,
        background: token.colorBgContainer,
      }}
    >
      <SelectionSectionHeader
        title="1. 资金流水"
        selected={Boolean(selectedTransaction)}
        onClear={onClearTransaction}
      />
      <div className={styles.selectionContent}>
        {selectedTransaction ? (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="流水号">
              {selectedTransaction.transactionNo}
            </Descriptions.Item>
            <Descriptions.Item label="交易日期">
              {selectedTransaction.transactionDate}
            </Descriptions.Item>
            <Descriptions.Item label="收支方向">
              <Tag
                color={
                  TRANSACTION_DIRECTION_COLORS[selectedTransaction.direction]
                }
              >
                {catalogLabel(
                  TRANSACTION_DIRECTION_LABELS,
                  selectedTransaction.direction,
                )}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="收付款渠道">
              {catalogLabel(
                PAYMENT_CHANNEL_LABELS,
                selectedTransaction.paymentChannel,
              )}
            </Descriptions.Item>
            <Descriptions.Item label="往来对象" span="filled">
              {formatTransactionCounterpartyLabel(selectedTransaction)}
            </Descriptions.Item>
            <Descriptions.Item label="关联发团" span="filled">
              {selectedTransaction.departureNo &&
              selectedTransaction.departureName
                ? `${selectedTransaction.departureNo} · ${selectedTransaction.departureName}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="流水金额">
              {formatCents(selectedTransaction.amountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="已核销">
              {formatCents(selectedTransaction.allocatedAmountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="可核销余额">
              <Typography.Text strong>
                {formatCents(selectedTransaction.unallocatedAmountCents)}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        ) : loadError ? (
          <Alert
            type="error"
            showIcon
            title="流水候选加载失败，请关闭抽屉后重试"
          />
        ) : !direction ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请先选择核销方向"
          />
        ) : (
          <>
            <Input.Search
              allowClear
              aria-label="搜索资金流水"
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
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无可核销流水，请调整发团或搜索条件"
                  />
                ),
              }}
              scroll={{ x: 760, y: 280 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedTransactionId
                  ? [selectedTransactionId]
                  : [],
                onSelect: onSelectTransaction,
              }}
              onRow={(record) => ({
                onClick: () => onSelectTransaction(record),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectTransaction(record)
                  }
                },
                tabIndex: 0,
                style: { cursor: 'pointer' },
              })}
            />
          </>
        )}
      </div>
    </section>
  )
}

interface ScheduleSelectionSectionProps {
  selectedTransaction: FinanceTransactionSummary | null
  selectedSchedule: PaymentScheduleSummary | null
  departureMap: Map<string, { departureNo: string; name: string }>
  searchKeyword: string
  loading: boolean
  loadError: boolean
  columns: ColumnsType<PaymentScheduleSummary>
  candidateSchedules: PaymentScheduleSummary[]
  selectedScheduleId?: string
  onSearchKeywordChange: (keyword: string) => void
  onClearSchedule: () => void
  onSelectSchedule: (schedule: PaymentScheduleSummary) => void
}

function ScheduleSelectionSection({
  selectedTransaction,
  selectedSchedule,
  departureMap,
  searchKeyword,
  loading,
  loadError,
  columns,
  candidateSchedules,
  selectedScheduleId,
  onSearchKeywordChange,
  onClearSchedule,
  onSelectSchedule,
}: ScheduleSelectionSectionProps) {
  const { token } = theme.useToken()

  return (
    <section
      className={styles.selectionSection}
      style={{
        borderColor: token.colorBorderSecondary,
        background: token.colorBgContainer,
      }}
    >
      <SelectionSectionHeader
        title="2. 收付款节点"
        selected={Boolean(selectedSchedule)}
        onClear={onClearSchedule}
      />
      <div className={styles.selectionContent}>
        {selectedSchedule ? (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="节点编号">
              {selectedSchedule.scheduleNo}
            </Descriptions.Item>
            <Descriptions.Item label="标题">
              {selectedSchedule.title}
            </Descriptions.Item>
            <Descriptions.Item label="往来对象" span="filled">
              {formatScheduleCounterpartyLabel(selectedSchedule)}
            </Descriptions.Item>
            <Descriptions.Item label="关联发团" span="filled">
              {formatDepartureLabel(selectedSchedule.departureId, departureMap)}
            </Descriptions.Item>
            <Descriptions.Item label="总额">
              {formatCents(selectedSchedule.amountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="已结">
              {formatCents(selectedSchedule.settledAmountCents)}
            </Descriptions.Item>
            <Descriptions.Item label="未结">
              <Typography.Text strong>
                {formatCents(selectedSchedule.unsettledAmountCents)}
              </Typography.Text>
            </Descriptions.Item>
            {selectedSchedule.dueDate ? (
              <Descriptions.Item label="到期日">
                {selectedSchedule.dueDate}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        ) : loadError ? (
          <Alert
            type="error"
            showIcon
            title="收付款节点候选加载失败，请关闭抽屉后重试"
          />
        ) : !selectedTransaction ? (
          <div
            className={styles.dependentEmpty}
            style={{ background: token.colorFillQuaternary }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择资金流水后显示同一往来对象的未结清节点"
            />
          </div>
        ) : (
          <>
            <Input.Search
              allowClear
              aria-label="搜索收付款节点"
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
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无同一往来对象的未结清节点，请调整发团或搜索条件"
                  />
                ),
              }}
              scroll={{ x: 760, y: 280 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedScheduleId ? [selectedScheduleId] : [],
                onSelect: onSelectSchedule,
              }}
              onRow={(record) => ({
                onClick: () => onSelectSchedule(record),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectSchedule(record)
                  }
                },
                tabIndex: 0,
                style: { cursor: 'pointer' },
              })}
            />
          </>
        )}
      </div>
    </section>
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
  const { token } = theme.useToken()

  if (!selectedSchedule || !selectedTransaction) {
    return null
  }

  return (
    <section
      className={styles.amountSection}
      style={{
        borderColor: token.colorBorderSecondary,
        background: token.colorBgContainer,
      }}
    >
      <div className={styles.sectionHeader}>
        <Typography.Text strong>3. 核对金额</Typography.Text>
      </div>
      <div className={styles.amountContent}>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} md={8}>
            <Form.Item
              name="amountYuan"
              label="本次核销金额（元）"
              extra={`最多可核销 ${formatCents(
                Math.min(
                  selectedTransaction.unallocatedAmountCents,
                  selectedSchedule.unsettledAmountCents,
                ),
              )}`}
              rules={[
                { required: true, message: '请输入核销金额' },
                {
                  validator: (_, value) => {
                    if (value == null || value <= 0) {
                      return Promise.reject(new Error('金额必须大于 0'))
                    }
                    const amountCents = yuanToCents(value)
                    if (
                      amountCents > selectedTransaction.unallocatedAmountCents
                    ) {
                      return Promise.reject(
                        new Error('金额不能超过流水可核销余额'),
                      )
                    }
                    if (amountCents > selectedSchedule.unsettledAmountCents) {
                      return Promise.reject(
                        new Error('金额不能超过节点未结清金额'),
                      )
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber
                min={0.01}
                precision={2}
                prefix="¥"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <div
              className={styles.resultMetric}
              style={{ background: token.colorFillQuaternary }}
            >
              <Typography.Text type="secondary">核销后流水余额</Typography.Text>
              <Typography.Text strong>
                {formatCents(postTransactionBalanceCents)}
              </Typography.Text>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div
              className={styles.resultMetric}
              style={{ background: token.colorFillQuaternary }}
            >
              <Typography.Text type="secondary">
                核销后节点未结金额
              </Typography.Text>
              <Typography.Text strong>
                {formatCents(postUnsettledCents)}
              </Typography.Text>
            </div>
          </Col>
        </Row>
        <Form.Item
          name="remark"
          label="备注（选填）"
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea
            maxLength={200}
            showCount
            rows={3}
            placeholder="最多 200 字"
          />
        </Form.Item>
      </div>
    </section>
  )
}

interface CreateVerificationFooterProps {
  loading: boolean
  submitDisabled: boolean
  previewing: boolean
  onCancel: () => void
  onPreview: () => void
  onBack: () => void
  onConfirm: () => void
}

function CreateVerificationFooter({
  loading,
  submitDisabled,
  previewing,
  onCancel,
  onPreview,
  onBack,
  onConfirm,
}: CreateVerificationFooterProps) {
  if (previewing) {
    return (
      <Space className={styles.footerActions}>
        <Button disabled={loading} onClick={onBack}>
          返回修改
        </Button>
        <Button type="primary" loading={loading} onClick={onConfirm}>
          确认核销
        </Button>
      </Space>
    )
  }

  return (
    <Space className={styles.footerActions}>
      <Button onClick={onCancel}>取消</Button>
      <Button type="primary" disabled={submitDisabled} onClick={onPreview}>
        预览核销
      </Button>
    </Space>
  )
}

function VerificationHiddenFields() {
  return (
    <>
      <Form.Item
        name="transactionId"
        hidden
        rules={[{ required: true, message: '请选择流水' }]}
      >
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

interface VerificationPreviewProps {
  values: CreateVerificationFormValues
  transaction: FinanceTransactionSummary
  schedule: PaymentScheduleSummary
  departureMap: Map<string, { departureNo: string; name: string }>
  postTransactionBalanceCents: number
  postUnsettledCents: number
}

function VerificationPreview({
  values,
  transaction,
  schedule,
  departureMap,
  postTransactionBalanceCents,
  postUnsettledCents,
}: VerificationPreviewProps) {
  const { token } = theme.useToken()
  const amount = formatCents(yuanToCents(values.amountYuan))
  const selectedDeparture = values.departureId
    ? formatDepartureLabel(values.departureId, departureMap)
    : '未限定'
  const previewPanelStyle = {
    borderColor: token.colorBorderSecondary,
    background: token.colorBgContainer,
  }

  return (
    <div className={styles.preview}>
      <section>
        <Typography.Title level={5}>核销条件</Typography.Title>
        <Descriptions column={{ xs: 1, sm: 3 }} size="small">
          <Descriptions.Item label="核销方向">
            {catalogLabel(VERIFICATION_DIRECTION_LABELS, values.direction)}
          </Descriptions.Item>
          <Descriptions.Item label="核销日期">
            {values.verificationDate}
          </Descriptions.Item>
          <Descriptions.Item label="关联发团">
            {selectedDeparture}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <Divider />

      <section>
        <Typography.Title level={5}>匹配关系</Typography.Title>
        <div className={styles.previewRelationship}>
          <div className={styles.previewObject} style={previewPanelStyle}>
            <Typography.Text strong>资金流水</Typography.Text>
            <Typography.Text style={{ color: token.colorPrimary }}>
              {transaction.transactionNo}
            </Typography.Text>
            <Typography.Text type="secondary">
              {transaction.transactionDate} ·{' '}
              {catalogLabel(
                TRANSACTION_DIRECTION_LABELS,
                transaction.direction,
              )}{' '}
              ·{' '}
              {catalogLabel(PAYMENT_CHANNEL_LABELS, transaction.paymentChannel)}
            </Typography.Text>
            <Typography.Text>
              {formatTransactionCounterpartyLabel(transaction)}
            </Typography.Text>
            <Typography.Text type="secondary">
              {transaction.departureNo && transaction.departureName
                ? `${transaction.departureNo} · ${transaction.departureName}`
                : '-'}
            </Typography.Text>
            <div className={styles.previewAmounts}>
              <Typography.Text>
                流水金额 {formatCents(transaction.amountCents)}
              </Typography.Text>
              <Typography.Text>
                已核销 {formatCents(transaction.allocatedAmountCents)}
              </Typography.Text>
              <Typography.Text strong>
                可核销余额 {formatCents(transaction.unallocatedAmountCents)}
              </Typography.Text>
            </div>
          </div>

          <div className={styles.previewArrow}>
            <ArrowRightOutlined aria-hidden />
            <Typography.Text type="secondary">本次核销金额</Typography.Text>
            <Typography.Text
              className={styles.previewAmount}
              style={{ color: token.colorPrimary }}
            >
              {amount}
            </Typography.Text>
            <ArrowRightOutlined aria-hidden />
          </div>

          <div className={styles.previewObject} style={previewPanelStyle}>
            <Typography.Text strong>收付款节点</Typography.Text>
            <Typography.Text style={{ color: token.colorPrimary }}>
              {schedule.scheduleNo}
            </Typography.Text>
            <Typography.Text>{schedule.title}</Typography.Text>
            <Typography.Text>
              {formatScheduleCounterpartyLabel(schedule)}
            </Typography.Text>
            <Typography.Text type="secondary">
              {formatDepartureLabel(schedule.departureId, departureMap)}
            </Typography.Text>
            <div className={styles.previewAmounts}>
              <Typography.Text>
                总额 {formatCents(schedule.amountCents)}
              </Typography.Text>
              <Typography.Text>
                已结 {formatCents(schedule.settledAmountCents)}
              </Typography.Text>
              <Typography.Text strong>
                未结 {formatCents(schedule.unsettledAmountCents)}
              </Typography.Text>
              {schedule.dueDate ? (
                <Typography.Text>到期日 {schedule.dueDate}</Typography.Text>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section>
        <Typography.Title level={5}>核销后结果</Typography.Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <div
              className={styles.previewResult}
              style={{ background: token.colorFillQuaternary }}
            >
              <Typography.Text type="secondary">核销后流水余额</Typography.Text>
              <Typography.Text strong>
                {formatCents(postTransactionBalanceCents)}
              </Typography.Text>
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div
              className={styles.previewResult}
              style={{ background: token.colorFillQuaternary }}
            >
              <Typography.Text type="secondary">
                核销后节点未结金额
              </Typography.Text>
              <Typography.Text strong>
                {formatCents(postUnsettledCents)}
              </Typography.Text>
            </div>
          </Col>
        </Row>
      </section>

      <Divider />

      <section>
        <Typography.Title level={5}>备注</Typography.Title>
        <Typography.Text>{values.remark?.trim() || '-'}</Typography.Text>
      </section>
    </div>
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
  const { modal } = App.useApp()
  const [previewValues, setPreviewValues] =
    useState<CreateVerificationFormValues | null>(null)
  const state = useCreateVerificationDrawerState({
    open,
    form,
    lockedDepartureId,
    initialTransaction,
    initialSchedule,
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.resetFields()
    form.setFieldsValue(state.initialValues)
  }, [open, form, state.initialValues])

  const transactionColumns = useMemo(
    () => buildTransactionColumns(state.departureMap),
    [state.departureMap],
  )
  const scheduleColumns = useMemo(
    () =>
      buildScheduleColumns(
        state.departureMap,
        state.direction === 'receivable',
      ),
    [state.departureMap, state.direction],
  )

  const handleSubmit = (values: CreateVerificationFormValues) => {
    const transactionDepartureId = state.selectedTransaction?.departureId
    const scheduleDepartureId = state.selectedSchedule?.departureId
    if (
      transactionDepartureId &&
      scheduleDepartureId &&
      transactionDepartureId !== scheduleDepartureId
    ) {
      modal.confirm({
        title: '确认跨团核销？',
        content: `流水关联「${formatDepartureLabel(transactionDepartureId, state.departureMap)}」，收付款节点关联「${formatDepartureLabel(scheduleDepartureId, state.departureMap)}」。跨团核销将正常计入双方发团，请确认业务归属无误。`,
        okText: '继续核销',
        cancelText: '取消',
        onOk: () => onSubmit(values),
      })
      return
    }
    onSubmit(values)
  }

  const handleClose = () => {
    setPreviewValues(null)
    onClose()
  }

  const handlePreview = () => {
    void form
      .validateFields()
      .then((values) => setPreviewValues(values))
      .catch(() => undefined)
  }

  const previewing = Boolean(
    previewValues && state.selectedTransaction && state.selectedSchedule,
  )

  return (
    <Drawer
      title={previewing ? '核销预览' : '新增核销'}
      open={open}
      size="min(960px, 100vw)"
      onClose={handleClose}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPreviewValues(null)
        }
      }}
      destroyOnHidden
      footer={
        <CreateVerificationFooter
          loading={loading}
          submitDisabled={state.submitDisabled}
          previewing={previewing}
          onCancel={handleClose}
          onPreview={handlePreview}
          onBack={() => setPreviewValues(null)}
          onConfirm={() => form.submit()}
        />
      }
    >
      {previewValues && state.selectedTransaction && state.selectedSchedule ? (
        <VerificationPreview
          values={previewValues}
          transaction={state.selectedTransaction}
          schedule={state.selectedSchedule}
          departureMap={state.departureMap}
          postTransactionBalanceCents={state.postTransactionBalanceCents}
          postUnsettledCents={state.postUnsettledCents}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={state.initialValues}
        onFinish={handleSubmit}
        scrollToFirstError={{ focus: true }}
        style={{ display: previewing ? 'none' : undefined }}
      >
        <VerificationHiddenFields />

        <VerificationBasicsSection
          directionLocked={state.directionLocked}
          departureOptions={state.departureOptions}
          lockedDepartureId={lockedDepartureId}
          onDirectionChange={state.handleDirectionChange}
          onDepartureChange={state.handleDepartureChange}
        />

        <Divider />

        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          匹配关系
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          先选择有可核销余额的资金流水，再匹配同一往来对象的未结清收付款节点。
        </Typography.Paragraph>

        {state.selectedTransaction && state.selectedSchedule ? (
          <div className={styles.matchedSelectionGrid}>
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
            <ArrowRightOutlined className={styles.matchArrow} aria-hidden />
            <ScheduleSelectionSection
              selectedTransaction={state.selectedTransaction}
              selectedSchedule={state.selectedSchedule}
              departureMap={state.departureMap}
              searchKeyword={state.scheduleSearchKeyword}
              loading={state.schedulesLoading}
              loadError={state.schedulesError}
              columns={scheduleColumns}
              candidateSchedules={state.candidateSchedules}
              selectedScheduleId={state.selectedScheduleId}
              onSearchKeywordChange={state.setScheduleSearchKeyword}
              onClearSchedule={state.handleClearSchedule}
              onSelectSchedule={state.handleSelectSchedule}
            />
          </div>
        ) : (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
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
            <ScheduleSelectionSection
              selectedTransaction={state.selectedTransaction}
              selectedSchedule={state.selectedSchedule}
              departureMap={state.departureMap}
              searchKeyword={state.scheduleSearchKeyword}
              loading={state.schedulesLoading}
              loadError={state.schedulesError}
              columns={scheduleColumns}
              candidateSchedules={state.candidateSchedules}
              selectedScheduleId={state.selectedScheduleId}
              onSearchKeywordChange={state.setScheduleSearchKeyword}
              onClearSchedule={state.handleClearSchedule}
              onSelectSchedule={state.handleSelectSchedule}
            />
          </Space>
        )}

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
