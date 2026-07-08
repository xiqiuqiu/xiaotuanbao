import { Alert, Descriptions, Modal, Space, Tag, Typography } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { formatCents, renderCompletionTags } from '../catalog'
import {
  TRANSITION_ACTION_META,
  canConfirmTransition,
  getIncompleteCompletionLabels,
  isCompletionTagIncomplete,
  type DepartureTransitionAction,
} from '../utils/departure-transition'

interface DepartureTransitionModalProps {
  open: boolean
  action: DepartureTransitionAction | null
  departure: DepartureDetail
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DepartureTransitionModal({
  open,
  action,
  departure,
  loading,
  onClose,
  onConfirm,
}: DepartureTransitionModalProps) {
  if (!action) {
    return null
  }

  const meta = TRANSITION_ACTION_META[action]
  const incompleteLabels = getIncompleteCompletionLabels(departure.completionTags)
  const canConfirm = canConfirmTransition(action, departure)
  const showSoftWarning = action !== 'settled' && incompleteLabels.length > 0

  return (
    <Modal
      title={meta.title}
      open={open}
      onCancel={onClose}
      onOk={onConfirm}
      okText={meta.confirmLabel}
      okButtonProps={{
        danger: meta.confirmDanger,
        disabled: !canConfirm,
        loading,
      }}
      cancelText="取消"
      destroyOnClose
    >
      <Typography.Paragraph type="secondary">{meta.description}</Typography.Paragraph>

      <Typography.Text strong>完成情况</Typography.Text>
      <Space size={[0, 8]} wrap style={{ display: 'flex', marginTop: 8, marginBottom: 16 }}>
        {renderCompletionTags(departure.completionTags).map((tag) => (
          <Tag
            key={tag.label}
            color={isCompletionTagIncomplete(tag.label) ? 'warning' : 'success'}
          >
            {tag.label}
          </Tag>
        ))}
      </Space>

      <Typography.Text strong>财务摘要</Typography.Text>
      <Descriptions
        size="small"
        column={2}
        style={{ marginTop: 8, marginBottom: 16 }}
        items={[
          { label: '实际应收', children: formatCents(departure.netReceivableCents) },
          { label: '应付合计', children: formatCents(departure.payableCents) },
          { label: '已收 / 未收', children: `${formatCents(departure.collectedCents)} / ${formatCents(departure.uncollectedCents)}` },
          { label: '已付 / 未付', children: `${formatCents(departure.paidCents)} / ${formatCents(departure.unpaidCents)}` },
        ]}
      />

      {action === 'settled' && !departure.isFinanciallySettled ? (
        <Alert
          type="error"
          showIcon
          message="全部账款尚未结清，不可标记为已结清"
          description={`仍有未收 ${formatCents(departure.uncollectedCents)}、未付 ${formatCents(departure.unpaidCents)}`}
        />
      ) : null}

      {showSoftWarning ? (
        <Alert
          type="warning"
          showIcon
          message="资料或账款尚未完整"
          description={`当前缺口：${incompleteLabels.join('、')}。仍可继续操作，请自行评估风险。`}
        />
      ) : null}
    </Modal>
  )
}
