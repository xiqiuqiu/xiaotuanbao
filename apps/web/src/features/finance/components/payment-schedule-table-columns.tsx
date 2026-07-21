import type { MenuProps } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Button, Dropdown, Space, Tag, Tooltip } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  CounterpartyType,
  DepartureStatus,
  PaymentScheduleDirection,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
  RESOURCE_KIND_LABELS,
  deriveSettlementLabel,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  RECEIVABLE_COLLECTION_METHOD_LABELS,
  SETTLEMENT_LABEL_COLORS,
  formatCents,
} from '../catalog'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import { FinanceDepartureLink } from './FinanceDepartureLink'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'

const DASH = '-'

/** 应付「费用类别」：资源种类 label；非资源来源显示「-」。 */
function feeCategoryText(schedule: PaymentScheduleSummary): string {
  if (!schedule.resourceKind) {
    return DASH
  }
  return RESOURCE_KIND_LABELS[schedule.resourceKind as never] ?? schedule.resourceKind
}

/** 应付「费用项目」：实时资源项目名，缺失回落资源种类；手工行回落节点标题。 */
function feeItemText(schedule: PaymentScheduleSummary): string {
  if (schedule.resourceTitle) {
    return schedule.resourceTitle
  }
  if (schedule.resourceKind) {
    return RESOURCE_KIND_LABELS[schedule.resourceKind as never] ?? schedule.resourceKind
  }
  return schedule.title || DASH
}

/** 应收「客源单」：客源单展示名；非客源来源显示「-」。 */
function sourceOrderText(schedule: PaymentScheduleSummary): string {
  return schedule.sourceOrderName || DASH
}

/** 应收「收款方式」：客户补款 / 游客代收；手工其他应收回落「其他」。 */
function collectionMethodText(schedule: PaymentScheduleSummary): string {
  return RECEIVABLE_COLLECTION_METHOD_LABELS[schedule.sourceType] ?? '其他'
}

/** 「往来对象」列展示值：游客代收统一显示「游客」，其余显示对手方名称。 */
function counterpartyText(schedule: PaymentScheduleSummary): string {
  if (schedule.counterpartyType === CounterpartyType.GUEST) {
    return '游客'
  }
  return schedule.counterpartyName || DASH
}

function isScheduleActionable(schedule: PaymentScheduleSummary): boolean {
  return schedule.status !== PaymentScheduleStatus.CANCELLED
}

function canSettle(schedule: PaymentScheduleSummary): boolean {
  return isScheduleActionable(schedule) && schedule.unsettledAmountCents > 0
}

export function canCloseSchedule(schedule: PaymentScheduleSummary): boolean {
  if (
    schedule.direction === PaymentScheduleDirection.PAYABLE &&
    schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE &&
    !schedule.financeTouched
  ) {
    return false
  }
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
  voidedAudit?: boolean
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
  voidedAudit = false,
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
  const scheduleNoColumn: ColumnsType<PaymentScheduleSummary>[number] = {
    title: isReceivable ? '应收单号' : '应付单号',
    dataIndex: 'scheduleNo',
    width: 150,
    render: (value: string, record) => (
      <Button type="link" style={{ paddingInline: 0 }} onClick={() => onViewDetail(record)}>
        {value}
      </Button>
    ),
  }

  const titleColumn: ColumnsType<PaymentScheduleSummary>[number] = {
    title: '标题',
    dataIndex: 'title',
    width: 200,
    ellipsis: { showTitle: false },
    render: (value: string) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
  }

  const departureColumns: ColumnsType<PaymentScheduleSummary> = isDepartureScope
    ? []
    : [
        {
          title: '关联发团',
          dataIndex: 'departureId',
          width: 160,
          ellipsis: { showTitle: false },
          render: (departureId: string) => {
            const departure = departureMap.get(departureId)
            return departure ? (
              <Tooltip title={departure.departureNo}>
                <FinanceDepartureLink departureId={departureId}>
                  <EllipsisTooltipText empty="">{departure.name}</EllipsisTooltipText>
                </FinanceDepartureLink>
              </Tooltip>
            ) : (
              DASH
            )
          },
        },
      ]

  const sourceColumns: ColumnsType<PaymentScheduleSummary> = isReceivable
    ? [
        {
          title: '客源单',
          width: 140,
          ellipsis: { showTitle: false },
          render: (_, record) => (
            <EllipsisTooltipText>{sourceOrderText(record)}</EllipsisTooltipText>
          ),
        },
        { title: '收款方式', width: 100, render: (_, record) => collectionMethodText(record) },
      ]
    : [
        { title: '费用类别', width: 90, render: (_, record) => feeCategoryText(record) },
        {
          title: '费用项目',
          width: 160,
          ellipsis: { showTitle: false },
          render: (_, record) => (
            <EllipsisTooltipText>{feeItemText(record)}</EllipsisTooltipText>
          ),
        },
      ]

  const counterpartyColumn: ColumnsType<PaymentScheduleSummary>[number] = {
    title: '往来对象',
    width: 160,
    ellipsis: { showTitle: false },
    render: (_, record) => (
      <EllipsisTooltipText>{counterpartyText(record)}</EllipsisTooltipText>
    ),
  }

  // 应收列表靠标题检索/对账，必须露出节点标题；应付费用项目已覆盖资源名或标题回落。
  const identityColumns: ColumnsType<PaymentScheduleSummary> = [
    scheduleNoColumn,
    ...(isReceivable ? [titleColumn] : []),
    ...departureColumns,
    ...sourceColumns,
    counterpartyColumn,
  ]

  if (voidedAudit) {
    return [
      ...identityColumns,
      {
        title: '作废前金额',
        dataIndex: 'voidedAmountCents',
        align: 'right',
        render: (value: number | null) => (value == null ? DASH : formatCents(value)),
      },
      {
        title: '操作人',
        dataIndex: 'voidedByName',
        render: (value: string | null) => value || DASH,
      },
      {
        title: '作废时间',
        dataIndex: 'voidedAt',
        render: (value: string | null) =>
          value ? dayjs(value).format('YYYY-MM-DD HH:mm') : DASH,
      },
      {
        title: '作废原因',
        dataIndex: 'voidReason',
        render: (value: string | null) => value || DASH,
      },
    ]
  }

  return [
    ...identityColumns,
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
        const departureClosed = record.departureStatus === DepartureStatus.CLOSED

        return (
          <Space size={4} wrap>
            <Tag color={SETTLEMENT_LABEL_COLORS[label] ?? 'default'}>{label}</Tag>
            {isClosed ? <Tag>已关闭</Tag> : null}
            {departureClosed ? <Tag>发团已关闭</Tag> : null}
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
    ...buildBusinessTimestampColumns<PaymentScheduleSummary>(),
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

        if (canCloseSchedule(record)) {
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
