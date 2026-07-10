import { Alert, Descriptions, Form, Input, Modal, Space, Tag, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { TransactionDirection } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { formatCents, renderCompletionTags } from '../catalog'
import { DepartureTransactionsLink } from '../utils/departure-transactions-link'
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
  const hasUnverifiedCash =
    departure.unverifiedIncomeCents > 0 || departure.unverifiedExpenseCents > 0

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
          {
            label: '已核销应收 / 未结清应收',
            children: `${formatCents(departure.verifiedReceivableCents)} / ${formatCents(departure.openUnsettledReceivableCents)}`,
          },
          {
            label: '已核销应付 / 未结清应付',
            children: `${formatCents(departure.verifiedPayableCents)} / ${formatCents(departure.openUnsettledPayableCents)}`,
          },
          {
            label: '未核销收入',
            children: formatCents(departure.unverifiedIncomeCents),
          },
          {
            label: '未核销支出',
            children: formatCents(departure.unverifiedExpenseCents),
          },
        ]}
      />

      {hasUnverifiedCash ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="存在归属本发团的未核销资金"
          description={
            <Space direction="vertical" size={4}>
              {departure.unverifiedIncomeCents > 0 ? (
                <Typography.Text>
                  未核销收入 {formatCents(departure.unverifiedIncomeCents)}
                  <DepartureTransactionsLink
                    departureId={departure.id}
                    direction={TransactionDirection.INFLOW}
                  >
                    查看流水
                  </DepartureTransactionsLink>
                </Typography.Text>
              ) : null}
              {departure.unverifiedExpenseCents > 0 ? (
                <Typography.Text>
                  未核销支出 {formatCents(departure.unverifiedExpenseCents)}
                  <DepartureTransactionsLink
                    departureId={departure.id}
                    direction={TransactionDirection.OUTFLOW}
                  >
                    查看流水
                  </DepartureTransactionsLink>
                </Typography.Text>
              ) : null}
            </Space>
          }
        />
      ) : null}

      {action === 'settled' && !departure.isFinanciallySettled ? (
        <Alert
          type="error"
          showIcon
          title="全部账款尚未结清，不可标记为已结清"
          description={`仍有未结清应收 ${formatCents(departure.openUnsettledReceivableCents)}、未结清应付 ${formatCents(departure.openUnsettledPayableCents)}`}
        />
      ) : null}

      {showSoftWarning ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: requiresReason ? 16 : 0 }}
          title="资料或账款尚未完整"
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
