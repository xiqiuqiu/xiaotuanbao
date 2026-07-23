import { DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Button } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { CounterpartyType, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { COUNTERPARTY_TYPE_OPTIONS } from '../catalog'
import type { EditScheduleFormValues } from '../utils/edit-schedule-form'
import {
  collectionMethodText,
  counterpartyText,
  feeCategoryText,
  feeItemText,
  sourceOrderText,
} from '../utils/payment-schedule-identity-display'

interface EditScheduleDrawerProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<EditScheduleFormValues>
  /** 应付本版不暴露到期日编辑（ADR-0019）。 */
  isReceivable: boolean
  onClose: () => void
  onSubmit: (values: EditScheduleFormValues) => void
}

export function EditScheduleDrawer({
  open,
  schedule,
  loading,
  form,
  isReceivable,
  onClose,
  onSubmit,
}: EditScheduleDrawerProps) {
  const financeLocked = schedule?.financeTouched ?? false
  const isGuestCounterparty = schedule?.counterpartyType === CounterpartyType.GUEST

  return (
    <Drawer
      title={isReceivable ? '编辑应收单' : '编辑应付单'}
      open={open}
      size="min(480px, 100vw)"
      onClose={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label={isReceivable ? '应收单号' : '应付单号'}>
            <Input value={schedule.scheduleNo} disabled />
          </Form.Item>
          {isReceivable ? (
            <>
              <Form.Item label="来源客源单">
                <Input value={sourceOrderText(schedule)} disabled />
              </Form.Item>
              <Form.Item label="收款方式">
                <Input value={collectionMethodText(schedule)} disabled />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item label="费用类别">
                <Input value={feeCategoryText(schedule)} disabled />
              </Form.Item>
              <Form.Item label="费用项目">
                <Input value={feeItemText(schedule)} disabled />
              </Form.Item>
            </>
          )}
          <Form.Item label={isReceivable ? '收款对象类型' : '付款对象类型'}>
            <Select
              disabled
              value={schedule.counterpartyType}
              options={[...COUNTERPARTY_TYPE_OPTIONS]}
            />
          </Form.Item>
          {isGuestCounterparty ? (
            <Form.Item label={isReceivable ? '收款对象名称' : '付款对象名称'}>
              <Input value={counterpartyText(schedule)} disabled />
            </Form.Item>
          ) : (
            <Form.Item
              name="counterpartyName"
              label={isReceivable ? '收款对象名称' : '付款对象名称'}
            >
              <Input disabled={financeLocked} />
            </Form.Item>
          )}
          <Form.Item
            name="amountYuan"
            label="金额（元）"
            rules={financeLocked ? undefined : [{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              min={0.01}
              precision={2}
              style={{ width: '100%' }}
              disabled={financeLocked}
            />
          </Form.Item>
          {isReceivable ? (
            <Form.Item
              name="dueDate"
              label="到期日"
              rules={financeLocked ? undefined : [{ required: true, message: '请选择到期日' }]}
            >
              <DatePicker style={{ width: '100%' }} disabled={financeLocked} />
            </Form.Item>
          ) : null}
        </Form>
      ) : null}
    </Drawer>
  )
}
