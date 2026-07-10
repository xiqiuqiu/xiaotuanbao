import { Alert, Descriptions, Form, Input, Modal, Space, Tag, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { DepartureDetail } from '@/types/api'
import { formatCents, renderCompletionTags } from '../catalog'
import {
  TRANSITION_ACTION_META,
  canConfirmTransition,
  getIncompleteCompletionLabels,
  isCompletionTagIncomplete,
  type DepartureTransitionAction,
} from '../utils/departure-transition'

export interface CloseDepartureFormValues {
  reason: string
}

interface DepartureTransitionModalProps {
  open: boolean
  action: DepartureTransitionAction | null
  departure: DepartureDetail
  loading: boolean
  closeForm: FormInstance<CloseDepartureFormValues>
  onClose: () => void
  onConfirm: () => void
  onCloseSubmit: (values: CloseDepartureFormValues) => void
}

export function DepartureTransitionModal({
  open,
  action,
  departure,
  loading,
  closeForm,
  onClose,
  onConfirm,
  onCloseSubmit,
}: DepartureTransitionModalProps) {
  if (!action) {
    return null
  }

  const meta = TRANSITION_ACTION_META[action]
  const incompleteLabels = getIncompleteCompletionLabels(departure.completionTags)
  const canConfirm = canConfirmTransition(action, departure)
  const showSoftWarning = action !== 'settled' && incompleteLabels.length > 0
  const requiresReason = action === 'close'

  return (
    <Modal
      title={meta.title}
      open={open}
      onCancel={onClose}
      onOk={() => {
        if (requiresReason) {
          closeForm.submit()
          return
        }
        onConfirm()
      }}
      okText={meta.confirmLabel}
      okButtonProps={{
        danger: meta.confirmDanger,
        disabled: !canConfirm,
        loading,
      }}
      cancelText="取消"
      destroyOnHidden
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
          style={{ marginBottom: requiresReason ? 16 : 0 }}
          message="资料或账款尚未完整"
          description={`当前缺口：${incompleteLabels.join('、')}。仍可继续操作，请自行评估风险。`}
        />
      ) : null}

      {requiresReason ? (
        <Form form={closeForm} layout="vertical" onFinish={onCloseSubmit} preserve={false}>
          <Form.Item
            name="reason"
            label="归档原因"
            rules={[{ required: true, message: '请输入归档原因' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入归档原因" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
