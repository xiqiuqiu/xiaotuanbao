import { Alert, Form, Input, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

export interface ReopenScheduleFormValues {
  reopenReason: string
}

interface ReopenScheduleModalProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<ReopenScheduleFormValues>
  onClose: () => void
  onSubmit: (values: ReopenScheduleFormValues) => void
}

export function ReopenScheduleModal({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: ReopenScheduleModalProps) {
  return (
    <Modal
      title="重新打开节点"
      open={open}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认重新打开"
      cancelText="取消"
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
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="将沿用原节点与完整履历，按当前核销与到期日恢复结清进度，并恢复登记收付与匹配流水。不会新建节点，也不会恢复普通金额编辑。"
          />
          <Form.Item
            name="reopenReason"
            label="重新打开原因"
            rules={[
              { required: true, message: '请填写重新打开原因' },
              { whitespace: true, message: '请填写重新打开原因' },
            ]}
          >
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              placeholder="必填，说明为何恢复追收/追付"
            />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  )
}
