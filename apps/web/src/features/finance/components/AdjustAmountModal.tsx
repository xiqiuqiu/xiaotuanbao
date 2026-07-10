import { Alert, Form, Input, InputNumber, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'
import { centsToYuan } from '../utils/finance-form'

export interface AdjustAmountFormValues {
  amountYuan: number
  adjustReason: string
}

interface AdjustAmountModalProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<AdjustAmountFormValues>
  onClose: () => void
  onSubmit: (values: AdjustAmountFormValues) => void
}

export function AdjustAmountModal({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: AdjustAmountModalProps) {
  return (
    <Modal
      title="调整约定金额"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认调整"
      cancelText="取消"
      destroyOnHidden
    >
      {schedule ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ amountYuan: centsToYuan(schedule.amountCents) }}
        >
          <Form.Item label="节点">
            <Input value={`${schedule.scheduleNo} · ${schedule.title}`} disabled />
          </Form.Item>
          <Form.Item label="当前约定 / 已核销 / 未结清">
            <Input
              value={`${formatCents(schedule.amountCents)} / ${formatCents(schedule.settledAmountCents)} / ${formatCents(schedule.unsettledAmountCents)}`}
              disabled
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="将同步修正资源约定金额与原应付节点，保留原节点编号与财务履历。不会新建节点，也不会恢复普通金额编辑。"
          />
          <Form.Item
            name="amountYuan"
            label="调整后金额（元）"
            rules={[
              { required: true, message: '请填写调整后金额' },
              {
                type: 'number',
                min: 0.01,
                message: '金额必须大于 0',
              },
            ]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="adjustReason"
            label="调整原因"
            rules={[
              { required: true, message: '请填写调整原因' },
              { whitespace: true, message: '请填写调整原因' },
            ]}
          >
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="必填，说明为何修正约定金额"
            />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
