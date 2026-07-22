import { Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space } from 'antd'
import {
  ProductScheduleStatus,
  type ProductScheduleSummary,
} from '@xiaotuanbao/shared'
import { PRODUCT_SCHEDULE_STATUS_LABELS, centsToYuan } from '../utils/product-labels'

export type ScheduleForm = {
  title?: string
  dateRuleText?: string
  startDate?: string
  endDate?: string
  status: ProductScheduleStatus
  priceOnInquiry: boolean
  adultPriceYuan?: number | null
  childPriceYuan?: number | null
  singleRoomSupplementYuan?: number | null
  notes?: string
}

export function ProductScheduleDrawer({
  open,
  canEdit,
  saving,
  editingSchedule,
  defaultPrices,
  onClose,
  onSave,
}: {
  open: boolean
  canEdit: boolean
  saving: boolean
  editingSchedule: ProductScheduleSummary | null
  defaultPrices: {
    adultPriceCents: number | null
    childPriceCents: number | null
    singleRoomSupplementCents: number | null
  }
  onClose: () => void
  onSave: (values: ScheduleForm) => void
}) {
  const [form] = Form.useForm<ScheduleForm>()

  const fillCreateDefaults = () => {
    form.setFieldsValue({
      title: '',
      dateRuleText: '',
      startDate: undefined,
      endDate: undefined,
      status: ProductScheduleStatus.ON_SALE,
      priceOnInquiry: false,
      adultPriceYuan: centsToYuan(defaultPrices.adultPriceCents),
      childPriceYuan: centsToYuan(defaultPrices.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(defaultPrices.singleRoomSupplementCents),
      notes: undefined,
    })
  }

  const fillEditValues = (schedule: ProductScheduleSummary) => {
    form.setFieldsValue({
      title: schedule.title,
      dateRuleText: schedule.dateRuleText,
      startDate: schedule.startDate ?? undefined,
      endDate: schedule.endDate ?? undefined,
      status: schedule.status as ProductScheduleStatus,
      priceOnInquiry: schedule.priceOnInquiry,
      adultPriceYuan: centsToYuan(schedule.adultPriceCents),
      childPriceYuan: centsToYuan(schedule.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(schedule.singleRoomSupplementCents),
      notes: schedule.notes ?? undefined,
    })
  }

  return (
    <Drawer
      title={editingSchedule ? '编辑班期' : '新建班期'}
      width={480}
      open={open}
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields()
          return
        }
        if (editingSchedule) {
          fillEditValues(editingSchedule)
        } else {
          fillCreateDefaults()
        }
      }}
      onClose={onClose}
      destroyOnHidden
      extra={
        canEdit ? (
          <Button
            type="primary"
            loading={saving}
            onClick={() => void form.validateFields().then((values) => onSave(values))}
          >
            保存
          </Button>
        ) : null
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: ProductScheduleStatus.ON_SALE, priceOnInquiry: false }}
      >
        <Form.Item name="title" label="班期标题">
          <Input />
        </Form.Item>
        <Form.Item name="dateRuleText" label="日期规则原文">
          <Input placeholder="如：天天发团 / 每周一、五" />
        </Form.Item>
        <Space wrap>
          <Form.Item name="startDate" label="开始日期">
            <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="endDate" label="结束日期">
            <Input placeholder="YYYY-MM-DD" style={{ width: 140 }} />
          </Form.Item>
        </Space>
        <Form.Item name="status" label="班期状态" rules={[{ required: true }]}>
          <Select
            options={Object.values(ProductScheduleStatus).map((status) => ({
              value: status,
              label: PRODUCT_SCHEDULE_STATUS_LABELS[status],
            }))}
          />
        </Form.Item>
        <Form.Item name="priceOnInquiry" valuePropName="checked">
          <Checkbox>明确询价（可无成人价）</Checkbox>
        </Form.Item>
        <Space wrap>
          <Form.Item name="adultPriceYuan" label="成人价（元）">
            <InputNumber min={0} precision={2} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="childPriceYuan" label="儿童价（元）">
            <InputNumber min={0} precision={2} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="singleRoomSupplementYuan" label="单房差（元）">
            <InputNumber min={0} precision={2} style={{ width: 140 }} />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
