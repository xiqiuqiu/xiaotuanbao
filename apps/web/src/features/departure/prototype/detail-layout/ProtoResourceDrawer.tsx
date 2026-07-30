/**
 * PROTOTYPE — mirrors production ResourceDrawer field set for layout review.
 * Answers: can Scheme D still host full 发团级属性录入? Yes — list + drawer.
 */
import { useEffect } from 'react'
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import type { ProtoResource } from './types'

const KIND_OPTIONS = [
  '用车',
  '酒店',
  '导游',
  '门票',
  '用餐',
  '保险',
  '拼出',
  '其他',
].map((value) => ({ value, label: value }))

const SUPPLIER_OPTIONS = [
  '新疆安途车队',
  '平安保险',
  '丝路领队工作室',
  '希尔顿花园酒店',
  '天池景区',
  '演示供应商',
].map((value) => ({ value, label: value }))

export type ProtoResourceDraft = {
  kind: string
  title: string
  supplier: string
  amountYuan: number
  notes?: string
}

type ProtoResourceDrawerProps = {
  open: boolean
  scope: 'departure' | 'segment'
  scopeLabel: string
  editing: ProtoResource | null
  onClose: () => void
  onSave: (draft: ProtoResourceDraft, options?: { generatePayable?: boolean }) => void
}

export function ProtoResourceDrawer({
  open,
  scope,
  scopeLabel,
  editing,
  onClose,
  onSave,
}: ProtoResourceDrawerProps) {
  const [form] = Form.useForm<ProtoResourceDraft>()
  const title = editing ? '编辑资源' : '添加资源'
  const contextLabel = scope === 'departure' ? '发团级资源' : scopeLabel

  useEffect(() => {
    if (!open) return
    if (editing) {
      form.setFieldsValue({
        kind: editing.kind,
        title: editing.title,
        supplier: editing.supplier,
        amountYuan: editing.amountCents / 100,
        notes: editing.notes,
      })
    } else {
      form.setFieldsValue({
        kind: scope === 'departure' ? '用车' : '酒店',
        title: undefined,
        supplier: undefined,
        amountYuan: 0,
        notes: undefined,
      })
    }
  }, [editing, form, open, scope])

  return (
    <Drawer
      title={
        <Space orientation="vertical" size={2}>
          <span>{title}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
            {contextLabel}
          </Typography.Text>
        </Space>
      }
      open={open}
      size="min(480px, 100vw)"
      destroyOnHidden
      onClose={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            onClick={() => {
              void form.validateFields().then((values) => {
                onSave(values, { generatePayable: true })
              })
            }}
          >
            保存并生成应付
          </Button>
          <Button
            type="primary"
            onClick={() => {
              void form.validateFields().then((values) => {
                onSave(values)
              })
            }}
          >
            保存
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        方案 D 只改列表与日程布局；种类 / 供应商 / 名称 / 金额 / 备注等属性仍走本抽屉（与现网一致）。后续字段可继续往下加。
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item
          name="kind"
          label="资源种类"
          rules={[{ required: true, message: '请选择资源种类' }]}
        >
          <Select options={KIND_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="supplier"
          label="供应商"
          rules={[{ required: true, message: '请选择供应商' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择供应商"
            options={SUPPLIER_OPTIONS}
          />
        </Form.Item>
        <Form.Item
          name="title"
          label="资源名称"
          rules={[{ required: true, whitespace: true, message: '请填写资源名称' }]}
        >
          <Input placeholder="如喀纳斯用车、阿勒泰拼出、贾登峪住宿" />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="资源金额（元）"
          rules={[
            { required: true, message: '请填写资源金额' },
            { type: 'number', min: 0, message: '资源金额不能小于0' },
          ]}
        >
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="备注" style={{ marginBottom: 0 }}>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="使用日期、数量、明细、特殊约定"
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
