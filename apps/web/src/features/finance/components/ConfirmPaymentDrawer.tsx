import { DatePicker, Drawer, Form, Input, InputNumber, Space, Button } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan } from '../utils/finance-form'
import type { ConfirmPaymentFormValues } from '../utils/confirm-payment-form'

interface ConfirmPaymentDrawerProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<ConfirmPaymentFormValues>
  onClose: () => void
  onSubmit: (values: ConfirmPaymentFormValues) => void
}

export function ConfirmPaymentDrawer({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: ConfirmPaymentDrawerProps) {
  return (
    <Drawer
      title="登记付款"
      open={open}
      width={480}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            确认付款
          </Button>
        </Space>
      }
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="节点">
            <Input value={`${schedule.scheduleNo} · ${schedule.title}`} disabled />
          </Form.Item>
          <Form.Item label="未结清金额">
            <Input value={`¥${centsToYuan(schedule.unsettledAmountCents).toFixed(2)}`} disabled />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="付款金额（元）"
            rules={[{ required: true, message: '请输入付款金额' }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="transactionDate"
            label="交易日期"
            rules={[{ required: true, message: '请选择交易日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      ) : null}
    </Drawer>
  )
}
