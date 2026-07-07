import { DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Button } from 'antd'
import type { FormInstance } from 'antd/es/form'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { COUNTERPARTY_TYPE_OPTIONS } from '../catalog'
import {
  centsToYuan,
  dateStringToDayjs,
  dayjsToDateString,
  yuanToCents,
} from '../utils/finance-form'

export interface EditScheduleFormValues {
  title: string
  amountYuan?: number
  dueDate?: ReturnType<typeof dateStringToDayjs>
  counterpartyName?: string
}

interface EditScheduleDrawerProps {
  open: boolean
  schedule: PaymentScheduleSummary | null
  loading: boolean
  form: FormInstance<EditScheduleFormValues>
  onClose: () => void
  onSubmit: (values: EditScheduleFormValues) => void
}

export function scheduleToEditValues(schedule: PaymentScheduleSummary): EditScheduleFormValues {
  return {
    title: schedule.title,
    amountYuan: centsToYuan(schedule.amountCents),
    dueDate: dateStringToDayjs(schedule.dueDate),
    counterpartyName: schedule.counterpartyName ?? undefined,
  }
}

export function buildUpdateSchedulePayload(
  schedule: PaymentScheduleSummary,
  values: EditScheduleFormValues,
) {
  const payload: {
    title: string
    amountCents?: number
    dueDate?: string
    counterpartyName?: string | null
  } = {
    title: values.title.trim(),
  }

  if (!schedule.financeTouched) {
    if (values.amountYuan !== undefined) {
      payload.amountCents = yuanToCents(values.amountYuan)
    }
    if (values.dueDate) {
      payload.dueDate = dayjsToDateString(values.dueDate)
    }
    if (values.counterpartyName !== undefined) {
      payload.counterpartyName = values.counterpartyName.trim() || null
    }
  }

  return payload
}

export function EditScheduleDrawer({
  open,
  schedule,
  loading,
  form,
  onClose,
  onSubmit,
}: EditScheduleDrawerProps) {
  const financeLocked = schedule?.financeTouched ?? false

  return (
    <Drawer
      title="编辑节点"
      open={open}
      width={480}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={() => form.submit()}>
            保存
          </Button>
        </Space>
      }
    >
      {schedule ? (
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="节点编号">
            <Input value={schedule.scheduleNo} disabled />
          </Form.Item>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
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
          <Form.Item
            name="dueDate"
            label="到期日"
            rules={financeLocked ? undefined : [{ required: true, message: '请选择到期日' }]}
          >
            <DatePicker style={{ width: '100%' }} disabled={financeLocked} />
          </Form.Item>
          <Form.Item label="往来对象类型">
            <Select
              disabled
              value={schedule.counterpartyType}
              options={[...COUNTERPARTY_TYPE_OPTIONS]}
            />
          </Form.Item>
          <Form.Item name="counterpartyName" label="往来对象名称">
            <Input disabled={financeLocked} />
          </Form.Item>
        </Form>
      ) : null}
    </Drawer>
  )
}
