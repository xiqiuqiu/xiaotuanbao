import { Form, Input, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { FinanceVerificationSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

export interface CancelVerificationFormValues {
  cancelReason: string
}

interface CancelVerificationModalProps {
  open: boolean
  verification: FinanceVerificationSummary | null
  loading: boolean
  form: FormInstance<CancelVerificationFormValues>
  onClose: () => void
  onSubmit: (values: CancelVerificationFormValues) => void
}

export function CancelVerificationModal({
  open,
  verification,
  loading,
  form,
  onClose,
  onSubmit,
}: CancelVerificationModalProps) {
  return (
    <Modal
      title="撤销核销"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认撤销"
      okType="danger"
      cancelText="取消"
      destroyOnClose
    >
      {verification ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="核销单号">
            <Input value={verification.verificationNo} disabled />
          </Form.Item>
          <Form.Item label="核销金额">
            <Input value={formatCents(verification.amountCents)} disabled />
          </Form.Item>
          <Form.Item
            name="cancelReason"
            label="撤销原因"
            rules={[{ required: true, message: '请输入撤销原因' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入撤销原因" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
