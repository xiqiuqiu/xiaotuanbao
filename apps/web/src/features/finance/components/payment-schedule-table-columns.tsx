import type { ColumnsType } from 'antd/es/table'
import { Button, Space, Tag, Typography } from 'antd'
import { Link } from '@tanstack/react-router'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  COUNTERPARTY_TYPE_LABELS,
  PAYMENT_SCHEDULE_STATUS_COLORS,
  PAYMENT_SCHEDULE_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

function isScheduleActionable(schedule: PaymentScheduleSummary): boolean {
  return schedule.status !== PaymentScheduleStatus.CANCELLED
}

function canSettle(schedule: PaymentScheduleSummary): boolean {
  return isScheduleActionable(schedule) && schedule.unsettledAmountCents > 0
}

interface BuildPaymentScheduleColumnsOptions {
  isDepartureScope: boolean
  isReceivable: boolean
  readOnly: boolean
  departureMap: Map<string, { departureNo: string; name: string }>
  onConfirm: (schedule: PaymentScheduleSummary) => void
  onLink: (schedule: PaymentScheduleSummary) => void
  onEdit: (schedule: PaymentScheduleSummary) => void
  onCancel: (schedule: PaymentScheduleSummary) => void
}

export function buildPaymentScheduleColumns({
  isDepartureScope,
  isReceivable,
  readOnly,
  departureMap,
  onConfirm,
  onLink,
  onEdit,
  onCancel,
}: BuildPaymentScheduleColumnsOptions): ColumnsType<PaymentScheduleSummary> {
  return [
    {
      title: '节点编号',
      dataIndex: 'scheduleNo',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '标题', dataIndex: 'title' },
    ...(isDepartureScope
      ? []
      : [
          {
            title: '发团',
            dataIndex: 'departureId',
            render: (departureId: string) => {
              const departure = departureMap.get(departureId)
              if (!departure) {
                return '—'
              }
              return (
                <Link to="/departure/$departureId" params={{ departureId }}>
                  {departure.departureNo} · {departure.name}
                </Link>
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
      render: (value: number) => formatCents(value),
    },
    {
      title: '已结清',
      dataIndex: 'settledAmountCents',
      render: (value: number) => formatCents(value),
    },
    {
      title: '未结清',
      dataIndex: 'unsettledAmountCents',
      render: (value: number) => formatCents(value),
    },
    { title: '到期日', dataIndex: 'dueDate' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => (
        <Tag color={PAYMENT_SCHEDULE_STATUS_COLORS[status]}>
          {catalogLabel(PAYMENT_SCHEDULE_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    {
      title: '财务介入',
      dataIndex: 'financeTouched',
      render: (value: boolean) => (value ? <Tag color="gold">已介入</Tag> : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => {
        if (readOnly) {
          return null
        }

        const actions: React.ReactNode[] = []

        if (canSettle(record)) {
          actions.push(
            <Button key="confirm" type="link" onClick={() => onConfirm(record)}>
              {isReceivable ? '登记收款' : '登记付款'}
            </Button>,
          )
          actions.push(
            <Button key="link" type="link" onClick={() => onLink(record)}>
              关联流水
            </Button>,
          )
        }

        if (isScheduleActionable(record)) {
          actions.push(
            <Button key="edit" type="link" onClick={() => onEdit(record)}>
              编辑
            </Button>,
          )
          actions.push(
            <Button key="cancel" type="link" danger onClick={() => onCancel(record)}>
              关闭节点
            </Button>,
          )
        }

        return actions.length > 0 ? <Space size={0} wrap>{actions}</Space> : '—'
      },
    },
  ]
}
