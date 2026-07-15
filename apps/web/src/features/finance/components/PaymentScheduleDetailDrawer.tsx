import { Alert, Button, Descriptions, Drawer, Empty, Timeline, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import {
  PaymentScheduleActivityType,
  deriveSettlementLabel,
  type PaymentScheduleActivityItem,
} from '@xiaotuanbao/shared'
import { getPayable, getReceivable } from '@/services/finance.service'
import {
  CLOSE_DISPOSITION_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'

interface PaymentScheduleDetailDrawerProps {
  open: boolean
  scheduleId: string | null
  isReceivable: boolean
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

function activityTitle(item: PaymentScheduleActivityItem): string {
  if (item.activityType === PaymentScheduleActivityType.CLOSE) {
    const disposition = catalogLabel(CLOSE_DISPOSITION_LABELS, item.closeDisposition)
    return `关闭节点 · ${disposition}`
  }
  if (item.activityType === PaymentScheduleActivityType.VOID) {
    return '作废资源应付'
  }
  if (item.activityType === PaymentScheduleActivityType.VERIFICATION_CANCELLED) {
    return '关闭后撤销核销'
  }
  if (item.activityType === PaymentScheduleActivityType.REOPEN) {
    return '重新打开节点'
  }
  if (item.activityType === PaymentScheduleActivityType.AMOUNT_ADJUST) {
    return '调整约定金额'
  }
  return item.activityType
}

function activityDescription(item: PaymentScheduleActivityItem): string {
  if (item.activityType === PaymentScheduleActivityType.CLOSE) {
    return [
      `约定 ${formatCents(item.amountCents ?? 0)}`,
      `已核销 ${formatCents(item.settledAmountCents ?? 0)}`,
      `未结清 ${formatCents(item.unsettledAmountCents ?? 0)}`,
      `说明：${item.note}`,
    ].join(' · ')
  }

  if (item.activityType === PaymentScheduleActivityType.VOID) {
    return [`作废前金额 ${formatCents(item.amountCents ?? 0)}`, `原因：${item.note}`].join(' · ')
  }

  if (item.activityType === PaymentScheduleActivityType.VERIFICATION_CANCELLED) {
    return [
      `已核销 ${formatCents(item.previousSettledAmountCents ?? 0)} → ${formatCents(item.settledAmountCents ?? 0)}`,
      `未结清 ${formatCents(item.previousUnsettledAmountCents ?? 0)} → ${formatCents(item.unsettledAmountCents ?? 0)}`,
      `说明：${item.note}`,
    ].join(' · ')
  }

  if (item.activityType === PaymentScheduleActivityType.REOPEN) {
    return [
      `约定 ${formatCents(item.amountCents ?? 0)}`,
      `已核销 ${formatCents(item.settledAmountCents ?? 0)}`,
      `未结清 ${formatCents(item.unsettledAmountCents ?? 0)}`,
      `原因：${item.note}`,
    ].join(' · ')
  }

  if (item.activityType === PaymentScheduleActivityType.AMOUNT_ADJUST) {
    return [
      `约定 ${formatCents(item.previousAmountCents ?? 0)} → ${formatCents(item.amountCents ?? 0)}`,
      `原因：${item.note}`,
    ].join(' · ')
  }

  return item.note
}

export function PaymentScheduleDetailDrawer({
  open,
  scheduleId,
  isReceivable,
  onClose,
}: PaymentScheduleDetailDrawerProps) {
  const { data: schedule, isLoading, isError, refetch } = useQuery({
    queryKey: ['payment-schedule-detail', isReceivable ? 'receivable' : 'payable', scheduleId],
    queryFn: () => {
      if (!scheduleId) {
        throw new Error('节点 ID 缺失')
      }
      return isReceivable ? getReceivable(scheduleId) : getPayable(scheduleId)
    },
    enabled: open && Boolean(scheduleId),
  })

  const settlement = schedule
    ? deriveSettlementLabel(
        schedule.direction,
        schedule.amountCents,
        schedule.settledAmountCents,
        schedule.status,
      )
    : null

  return (
    <Drawer
      title={isReceivable ? '应收节点详情' : '应付节点详情'}
      open={open}
      onClose={onClose}
      size="min(560px, 100vw)"
      destroyOnHidden
      loading={isLoading}
    >
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="节点详情加载失败"
          description="请检查网络后重试。"
          action={<Button onClick={() => void refetch()}>重试</Button>}
        />
      ) : !isLoading && !schedule ? (
        <Empty description="节点不存在" />
      ) : schedule ? (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="节点编号">{schedule.scheduleNo}</Descriptions.Item>
            <Descriptions.Item label="标题">{schedule.title}</Descriptions.Item>
            {schedule.voidedAt ? (
              <>
                <Descriptions.Item label="状态">已作废</Descriptions.Item>
                <Descriptions.Item label="作废前金额">
                  {schedule.voidedAmountCents == null
                    ? '-'
                    : formatCents(schedule.voidedAmountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="操作人">{schedule.voidedByName || '-'}</Descriptions.Item>
                <Descriptions.Item label="作废时间">
                  {formatDateTime(schedule.voidedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="作废原因">{schedule.voidReason || '-'}</Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label="约定金额">
                  {formatCents(schedule.amountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="已核销">
                  {formatCents(schedule.settledAmountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="未结清">
                  {formatCents(schedule.unsettledAmountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="结清进度">{settlement?.label ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="关闭状态">
                  {schedule.cancelledAt
                    ? `已关闭 · ${catalogLabel(CLOSE_DISPOSITION_LABELS, schedule.closeDisposition)}`
                    : '未关闭'}
                </Descriptions.Item>
                {schedule.cancelReason ? (
                  <Descriptions.Item label="关闭说明">{schedule.cancelReason}</Descriptions.Item>
                ) : null}
              </>
            )}
          </Descriptions>

          <div style={{ marginTop: 24 }}>
            <Typography.Text strong>操作时间线</Typography.Text>
            {schedule.activities.length === 0 ? (
              <Empty style={{ marginTop: 16 }} description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Timeline
                style={{ marginTop: 12, marginBottom: 0 }}
                items={schedule.activities.map((item) => ({
                  color:
                    item.activityType === PaymentScheduleActivityType.CLOSE ||
                    item.activityType === PaymentScheduleActivityType.VOID
                      ? 'gray'
                      : item.activityType === PaymentScheduleActivityType.REOPEN
                        ? 'green'
                        : 'blue',
                  children: (
                    <div>
                      <Typography.Text>
                        {activityTitle(item)}
                        {' · '}
                        {item.operatedByName || '-'}
                        {' · '}
                        {formatDateTime(item.operatedAt)}
                      </Typography.Text>
                      <div>
                        <Typography.Text type="secondary">{activityDescription(item)}</Typography.Text>
                      </div>
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        </>
      ) : null}
    </Drawer>
  )
}
