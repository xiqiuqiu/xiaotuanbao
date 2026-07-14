import type { MenuProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Button, Dropdown, Space, Tag, Tooltip } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import {
  DepartureStatus,
  PaymentScheduleDirection,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
  deriveSettlementLabel,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_LABELS,
  SETTLEMENT_LABEL_COLORS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { FinanceDepartureLink } from './FinanceDepartureLink'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'

function isScheduleActionable(schedule: PaymentScheduleSummary): boolean {
  return schedule.status !== PaymentScheduleStatus.CANCELLED
}

function canSettle(schedule: PaymentScheduleSummary): boolean {
  return isScheduleActionable(schedule) && schedule.unsettledAmountCents > 0
}

function canClose(schedule: PaymentScheduleSummary): boolean {
  return canSettle(schedule)
}

/** Closed schedules can reopen when the list is not archive-read-only. */
export function canReopenSchedule(
  schedule: PaymentScheduleSummary,
  readOnly: boolean,
): boolean {
  return !readOnly && schedule.status === PaymentScheduleStatus.CANCELLED
}

/**
 * Resource payables or source-order receivable paths with finance history,
 * zero effective settlement, and an open node can take an explicit amount
 * adjustment (ADR-0010 / #92 / #93).
 */
export function canAdjustScheduleAmount(
  schedule: PaymentScheduleSummary,
  readOnly: boolean,
): boolean {
  if (
    readOnly ||
    schedule.departureStatus === DepartureStatus.CLOSED ||
    !schedule.financeTouched ||
    schedule.settledAmountCents !== 0 ||
    schedule.status === PaymentScheduleStatus.CANCELLED
  ) {
    return false
  }

  if (
    schedule.direction === PaymentScheduleDirection.PAYABLE &&
    schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE
  ) {
    return true
  }

  if (
    schedule.direction === PaymentScheduleDirection.RECEIVABLE &&
    (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT ||
      schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION)
  ) {
    return true
  }

  return false
}

function hasVerificationRecords(schedule: PaymentScheduleSummary): boolean {
  return schedule.settledAmountCents > 0
}

interface BuildPaymentScheduleColumnsOptions {
  isDepartureScope: boolean
  isReceivable: boolean
  readOnly: boolean
  departureMap: Map<string, { departureNo: string; name: string }>
  onConfirm: (schedule: PaymentScheduleSummary) => void
  onVerify: (schedule: PaymentScheduleSummary) => void
  onEdit: (schedule: PaymentScheduleSummary) => void
  onCancel: (schedule: PaymentScheduleSummary) => void
  onReopen: (schedule: PaymentScheduleSummary) => void
  onAdjustAmount: (schedule: PaymentScheduleSummary) => void
  onViewDetail: (schedule: PaymentScheduleSummary) => void
  onViewVerifications: (schedule: PaymentScheduleSummary) => void
}

export function buildPaymentScheduleColumns({
  isDepartureScope,
  isReceivable,
  readOnly,
  departureMap,
  onConfirm,
  onVerify,
  onEdit,
  onCancel,
  onReopen,
  onAdjustAmount,
  onViewDetail,
  onViewVerifications,
}: BuildPaymentScheduleColumnsOptions): ColumnsType<PaymentScheduleSummary> {
  return [
    {
      title: '节点编号',
      dataIndex: 'scheduleNo',
      render: (value: string, record) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => onViewDetail(record)}>
          {value}
        </Button>
      ),
    },
    { title: '标题', dataIndex: 'title' },
    ...(isDepartureScope
      ? []
      : [
          {
            title: '关联发团',
            dataIndex: 'departureId',
            render: (departureId: string) => {
              const departure = departureMap.get(departureId)
              if (!departure) {
                return '-'
              }
              return (
                <Tooltip title={departure.departureNo}>
                  <FinanceDepartureLink departureId={departureId}>
                    {departure.name}
                  </FinanceDepartureLink>
                </Tooltip>
              )
            },
          },
        ]),
    {
      title: '往来对象',
      render: (_, record) => (
        <span>
          {catalogLabel(COUNTERPARTY_TYPE_LABELS, record.counterpartyType)}
          {record.counterpartyName ? ` · ${record.counterpartyName}` : ''}
        </span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '已结清',
      dataIndex: 'settledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未结清',
      dataIndex: 'unsettledAmountCents',
      align: 'right',
      render: (value: number) => formatCents(value),
    },
    ...(isReceivable ? [{ title: '到期日', dataIndex: 'dueDate' as const }] : []),
    {
      title: '结清进度',
      key: 'settlementLabel',
      render: (_, record) => {
        const direction = isReceivable ? 'receivable' : 'payable'
        const { label, isOverdue } = deriveSettlementLabel(
          direction,
          record.amountCents,
          record.settledAmountCents,
          record.status,
        )
        const isClosed = record.status === PaymentScheduleStatus.CANCELLED

        return (
          <Space size={4} wrap>
            <Tag color={SETTLEMENT_LABEL_COLORS[label] ?? 'default'}>{label}</Tag>
            {isClosed ? <Tag>已关闭</Tag> : null}
            {isOverdue ? <Tag color="error">已逾期</Tag> : null}
          </Space>
        )
      },
    },
    {
      title: '财务介入',
      dataIndex: 'financeTouched',
      render: (value: boolean) => (value ? <Tag color="gold">已介入</Tag> : '-'),
    },
    ...(isDepartureScope
      ? []
      : buildBusinessTimestampColumns<PaymentScheduleSummary>()),
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => {
        if (readOnly) {
          return null
        }

        const primaryActions: React.ReactNode[] = []
        const moreItems: NonNullable<MenuProps['items']> = []

        if (canSettle(record)) {
          primaryActions.push(
            <Button key="confirm" type="link" onClick={() => onConfirm(record)}>
              {isReceivable ? '登记收款' : '登记付款'}
            </Button>,
          )
          primaryActions.push(
            <Button key="link" type="link" onClick={() => onVerify(record)}>
              匹配流水
            </Button>,
          )
        }

        if (isScheduleActionable(record)) {
          moreItems.push({
            key: 'edit',
            label: '编辑',
            onClick: () => onEdit(record),
          })
        }

        if (canClose(record)) {
          moreItems.push({
            key: 'cancel',
            label: '关闭节点',
            danger: true,
            onClick: () => onCancel(record),
          })
        }

        if (canReopenSchedule(record, readOnly)) {
          moreItems.push({
            key: 'reopen',
            label: '重新打开',
            onClick: () => onReopen(record),
          })
        }

        if (canAdjustScheduleAmount(record, readOnly)) {
          moreItems.push({
            key: 'adjust-amount',
            label: '调整约定金额',
            onClick: () => onAdjustAmount(record),
          })
        }

        if (hasVerificationRecords(record)) {
          moreItems.push({
            key: 'verifications',
            label: '查看核销',
            onClick: () => onViewVerifications(record),
          })
        }

        if (primaryActions.length === 0 && moreItems.length === 0) {
          return '-'
        }

        return (
          <Space size={0} wrap>
            {primaryActions}
            {moreItems.length > 0 ? (
              <Dropdown menu={{ items: moreItems }}>
                <Button type="link" style={{ paddingInline: 0 }}>
                  更多 <DownOutlined />
                </Button>
              </Dropdown>
            ) : null}
          </Space>
        )
      },
    },
  ]
}
