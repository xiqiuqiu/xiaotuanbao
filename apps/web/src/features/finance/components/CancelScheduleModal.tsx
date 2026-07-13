import { Alert, Form, Input, Modal, Select } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { PaymentScheduleCloseDisposition, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { CLOSE_DISPOSITION_OPTIONS, formatCents } from '../catalog'

export interface CancelScheduleFormValues {
  closeDisposition: PaymentScheduleCloseDisposition
  cancelReason: string
}

interface CancelScheduleModalProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<CancelScheduleFormValues>
  onClose: () => void
  onSubmit: (values: CancelScheduleFormValues) => void
}

export function CancelScheduleModal({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: CancelScheduleModalProps) {
  const hasVerifiedAmount = Boolean(schedule && schedule.settledAmountCents > 0)

  return (
    <Modal
      title="关闭节点"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认关闭"
      okType="danger"
      cancelText="取消"
      cancelButtonProps={{ disabled: loading }}
      closable={!loading}
      keyboard={!loading}
      maskClosable={!loading}
      destroyOnHidden
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="节点">
            <Input value={`${schedule.scheduleNo} · ${schedule.title}`} disabled />
          </Form.Item>
          <Form.Item label="约定 / 已核销 / 未结清">
            <Input
              value={`${formatCents(schedule.amountCents)} / ${formatCents(schedule.settledAmountCents)} / ${formatCents(schedule.unsettledAmountCents)}`}
              disabled
            />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            title="关闭后将停止后续收付"
            description={
              hasVerifiedAmount
                ? '已核销与未结清金额仍保留在节点上，不会撤销核销或改写约定金额。'
                : '节点将不能继续登记收付或匹配流水；约定金额与当前未结清金额仍会保留。'
            }
          />
          <Form.Item
            name="closeDisposition"
            label="处置类型"
            rules={[{ required: true, message: '请选择处置类型' }]}
          >
            <Select
              placeholder="请选择处置类型"
              options={CLOSE_DISPOSITION_OPTIONS.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="cancelReason"
            label="具体说明"
            rules={[
              { required: true, message: '请填写具体说明' },
              { whitespace: true, message: '请填写具体说明' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="必填，说明为何停止当前追收/追付" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
