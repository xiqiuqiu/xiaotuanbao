import { Form, Input, Modal, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { DepartureDetail } from '@/types/api'

export interface UnarchiveDepartureFormValues {
  reason: string
}

interface DepartureUnarchiveModalProps {
  open: boolean
  departure: DepartureDetail
  loading: boolean
  form: FormInstance<UnarchiveDepartureFormValues>
  onClose: () => void
  onSubmit: (values: UnarchiveDepartureFormValues) => void
}

export function DepartureUnarchiveModal({
  open,
  departure,
  loading,
  form,
  onClose,
  onSubmit,
}: DepartureUnarchiveModalProps) {
  return (
    <Modal
      title="解除归档"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认解除归档"
      cancelText="取消"
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        解除归档后发团将回到待结算，可继续处理业务与财务事项。原归档履历会保留，不会被覆盖或删除。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit} preserve={false}>
        <Form.Item label="发团编号">
          <Input value={departure.departureNo} disabled />
        </Form.Item>
        <Form.Item
          name="reason"
          label="解除归档原因"
          rules={[{ required: true, message: '请输入解除归档原因' }]}
        >
          <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入解除归档原因" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
