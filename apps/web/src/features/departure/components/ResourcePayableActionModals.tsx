import { Alert, Form, Input, Modal, Select } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { PaymentScheduleCloseDisposition } from '@xiaotuanbao/shared'
import type { DepartureResourceSummary, SegmentResourceSummary } from '@/types/api'
import { CLOSE_DISPOSITION_OPTIONS, formatCents } from '@/features/finance/catalog'

export interface VoidResourcePayableFormValues {
  voidReason: string
}

export interface CloseResourcePayableFormValues {
  closeDisposition: PaymentScheduleCloseDisposition
  cancelReason: string
}

interface VoidModalProps {
  resource: SegmentResourceSummary | DepartureResourceSummary | null
  form: FormInstance<VoidResourcePayableFormValues>
  loading: boolean
  onClose: () => void
  onSubmit: (values: VoidResourcePayableFormValues) => void
}

export function VoidResourcePayableModal({ resource, form, loading, onClose, onSubmit }: VoidModalProps) {
  return (
    <Modal
      title="作废资源应付"
      open={Boolean(resource)}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认作废"
      okType="danger"
      destroyOnHidden
    >
      {resource ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Alert
            type="warning"
            showIcon
            title="作废后资源将恢复未生成"
            description={`原应付金额 ${formatCents(resource.amountCents)} 将保留在操作记录中；之后可修正资源金额并重新生成。`}
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            name="voidReason"
            label="作废原因"
            rules={[
              { required: true, message: '请填写作废原因' },
              { whitespace: true, message: '请填写作废原因' },
              { max: 200, message: '作废原因不能超过 200 个字符' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="必填，请说明误生成原因" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}

interface CloseModalProps {
  resource: SegmentResourceSummary | DepartureResourceSummary | null
  form: FormInstance<CloseResourcePayableFormValues>
  loading: boolean
  onClose: () => void
  onSubmit: (values: CloseResourcePayableFormValues) => void
}

export function CloseResourcePayableModal({ resource, form, loading, onClose, onSubmit }: CloseModalProps) {
  return (
    <Modal
      title="关闭节点"
      open={Boolean(resource)}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认关闭"
      okType="danger"
      destroyOnHidden
    >
      {resource ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Alert
            type="warning"
            showIcon
            title="关闭后将停止后续付款"
            description={`当前未结清 ${formatCents(resource.unsettledAmountCents ?? 0)}，关闭不会撤销已有核销。`}
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="closeDisposition" label="处置类型" rules={[{ required: true, message: '请选择处置类型' }]}>
            <Select options={CLOSE_DISPOSITION_OPTIONS.map(({ value, label }) => ({ value, label }))} />
          </Form.Item>
          <Form.Item
            name="cancelReason"
            label="具体说明"
            rules={[
              { required: true, message: '请填写具体说明' },
              { whitespace: true, message: '请填写具体说明' },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
