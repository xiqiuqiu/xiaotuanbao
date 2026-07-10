import { Alert, Checkbox, Form, Input, Modal } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { DepartureStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

export interface ReopenScheduleFormValues {
  reopenReason: string
  confirmDepartureSettlementReversal?: boolean
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
  const requiresSettlementReversal =
    schedule?.departureStatus === DepartureStatus.SETTLED

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
          {requiresSettlementReversal ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              title="发团当前为已结清"
              description="重新打开本节点后，发团将回到待结算。节点打开与发团回退将作为同一业务动作完成，之后需由计调重新确认已结清。"
            />
          ) : null}
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
          {requiresSettlementReversal ? (
            <Form.Item
              name="confirmDepartureSettlementReversal"
              valuePropName="checked"
              rules={[
                {
                  validator: async (_, value) => {
                    if (value === true) {
                      return
                    }
                    throw new Error('请确认发团将回到待结算')
                  },
                },
              ]}
            >
              <Checkbox>我确认发团将回到待结算</Checkbox>
            </Form.Item>
          ) : null}
        </Form>
      ) : null}
    </Modal>
  )
}
