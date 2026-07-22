import { useEffect } from 'react'
import { Card, Form, Input, InputNumber, Select, Space } from 'antd'
import { ProductStatus } from '@xiaotuanbao/shared'
import type { ProductDetail } from '@/types/api'
import type { UpdateProductPayload } from '@/services/product.service'
import { PRODUCT_STATUS_LABELS } from '../utils/product-labels'
import { ProductSectionSaveButton } from './ProductSectionSaveButton'

type BasicsForm = {
  name: string
  status: ProductStatus
  startCity?: string
  endCity?: string
  dayCount?: number | null
  tagsText?: string
}

export function ProductBasicsCard({
  product,
  canEdit,
  saving,
  onSave,
}: {
  product: ProductDetail
  canEdit: boolean
  saving: boolean
  onSave: (payload: UpdateProductPayload) => void
}) {
  const [form] = Form.useForm<BasicsForm>()

  useEffect(() => {
    form.setFieldsValue({
      name: product.name,
      status: product.status as ProductStatus,
      startCity: product.startCity ?? undefined,
      endCity: product.endCity ?? undefined,
      dayCount: product.dayCount,
      tagsText: product.tags.join(', '),
    })
  }, [product, form])

  return (
    <Card
      title="基础信息"
      extra={
        <ProductSectionSaveButton
          canEdit={canEdit}
          loading={saving}
          onSave={() =>
            void form.validateFields().then((values) =>
              onSave({
                name: values.name.trim(),
                status: values.status,
                startCity: values.startCity?.trim() || null,
                endCity: values.endCity?.trim() || null,
                dayCount: values.dayCount ?? null,
                tags: (values.tagsText ?? '')
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              }),
            )
          }
        />
      }
    >
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.Item name="name" label="产品名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="status" label="产品状态" rules={[{ required: true }]}>
          <Select
            options={Object.values(ProductStatus).map((status) => ({
              value: status,
              label: PRODUCT_STATUS_LABELS[status],
            }))}
          />
        </Form.Item>
        <Space wrap style={{ width: '100%' }}>
          <Form.Item name="startCity" label="出发城市">
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="endCity" label="结束城市">
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="dayCount" label="天数">
            <InputNumber min={1} precision={0} style={{ width: 120 }} />
          </Form.Item>
        </Space>
        <Form.Item name="tagsText" label="标签（逗号分隔，可空）">
          <Input placeholder="如：经典热卖款, A线" />
        </Form.Item>
      </Form>
    </Card>
  )
}
