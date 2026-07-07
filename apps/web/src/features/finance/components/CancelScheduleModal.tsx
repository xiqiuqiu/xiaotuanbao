import { Form, Input, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'

export interface CancelScheduleFormValues {
  cancelReason?: string
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
      destroyOnClose
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="节点">
            <Input value={`${schedule.scheduleNo} · ${schedule.title}`} disabled />
          </Form.Item>
          <Form.Item name="cancelReason" label="关闭原因">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="可选" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
