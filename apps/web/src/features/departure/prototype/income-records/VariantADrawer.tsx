/**
 * PROTOTYPE — form drawer for Variant A (extracted to keep host readable).
 */
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import type dayjs from 'dayjs'
import { formatCents } from '../../catalog'
import { MOCK_GUIDES, MOCK_PARTNERS } from './mock-data'
import {
  COMMISSION_STATUS_LABELS,
  INCOME_STATUS_LABELS,
  INCOME_TYPE_AMOUNT_HINTS,
  INCOME_TYPE_LABELS,
  type CommissionStatus,
  type IncomeStatus,
  type IncomeType,
} from './types'

export type VariantAFormValues = {
  type: IncomeType
  projectName: string
  partnerName?: string
  occurredOn: dayjs.Dayjs
  amountYuan: number
  guideName?: string
  commissionYuan: number
  incomeStatus: IncomeStatus
  commissionStatus: CommissionStatus
  remark?: string
}

const TYPE_OPTIONS = (Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((value) => ({
  value,
  label: INCOME_TYPE_LABELS[value],
}))

type VariantADrawerProps = {
  open: boolean
  editing: boolean
  form: FormInstance<VariantAFormValues>
  onClose: () => void
  onSave: () => void
}

export function VariantADrawer({
  open,
  editing,
  form,
  onClose,
  onSave,
}: VariantADrawerProps) {
  const watchedType = Form.useWatch('type', form) as IncomeType | undefined

  return (
    <Drawer
      title={editing ? '编辑增收记录' : '新增增收记录'}
      open={open}
      onClose={onClose}
      size={480}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={onSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="增收类型" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="projectName"
          label="项目名称"
          rules={[{ required: true, max: 50, message: '必填，最多 50 字' }]}
        >
          <Input placeholder="如：干果销售、游船票" maxLength={50} />
        </Form.Item>
        <Form.Item name="partnerName" label="合作方">
          <Select
            allowClear
            showSearch
            placeholder="从供应商选择（车销可空）"
            options={MOCK_PARTNERS.map((name) => ({ value: name, label: name }))}
          />
        </Form.Item>
        <Form.Item name="occurredOn" label="发生日期">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="增收金额"
          extra={watchedType ? INCOME_TYPE_AMOUNT_HINTS[watchedType] : undefined}
          rules={[{ required: true, type: 'number', min: 0 }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
        </Form.Item>
        <Form.Item name="guideName" label="导游">
          <Select
            allowClear
            placeholder="本团已安排导游"
            options={MOCK_GUIDES.map((name) => ({ value: name, label: name }))}
          />
        </Form.Item>
        <Form.Item
          name="commissionYuan"
          label="导游提成"
          rules={[{ required: true, type: 'number', min: 0 }]}
        >
          <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
        </Form.Item>
        <Form.Item
          shouldUpdate={(prev, next) =>
            prev.amountYuan !== next.amountYuan || prev.commissionYuan !== next.commissionYuan
          }
        >
          {() => {
            const amount = Number(form.getFieldValue('amountYuan') ?? 0)
            const commission = Number(form.getFieldValue('commissionYuan') ?? 0)
            return (
              <Form.Item label="公司增收">
                <Typography.Text>
                  {formatCents(Math.round((amount - commission) * 100))}
                </Typography.Text>
              </Form.Item>
            )
          }}
        </Form.Item>
        <Form.Item name="incomeStatus" label="收入状态" rules={[{ required: true }]}>
          <Select
            options={(Object.keys(INCOME_STATUS_LABELS) as IncomeStatus[]).map((value) => ({
              value,
              label: INCOME_STATUS_LABELS[value],
            }))}
          />
        </Form.Item>
        <Form.Item name="commissionStatus" label="提成状态" rules={[{ required: true }]}>
          <Select
            options={(Object.keys(COMMISSION_STATUS_LABELS) as CommissionStatus[]).map(
              (value) => ({
                value,
                label: COMMISSION_STATUS_LABELS[value],
              }),
            )}
          />
        </Form.Item>
        <Form.Item name="remark" label="备注" rules={[{ max: 200 }]}>
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
