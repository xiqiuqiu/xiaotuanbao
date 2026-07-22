import { useEffect } from 'react'
import { Button, Card, Form, Input, InputNumber, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  ProductScheduleStatus,
  type ProductScheduleSummary,
} from '@xiaotuanbao/shared'
import type { ProductDetail } from '@/types/api'
import {
  PRODUCT_SCHEDULE_STATUS_LABELS,
  centsToYuan,
} from '../utils/product-labels'
import { ProductSectionSaveButton } from './ProductSectionSaveButton'

export type SpecForm = {
  name: string
  adultPriceYuan?: number | null
  childPriceYuan?: number | null
  singleRoomSupplementYuan?: number | null
  notes?: string
}

export function ProductPricingCard({
  product,
  canEdit,
  saving,
  onSaveSpec,
  onCreateSchedule,
  onEditSchedule,
}: {
  product: ProductDetail
  canEdit: boolean
  saving: boolean
  onSaveSpec: (values: SpecForm) => void
  onCreateSchedule: () => void
  onEditSchedule: (schedule: ProductScheduleSummary) => void
}) {
  const [form] = Form.useForm<SpecForm>()

  useEffect(() => {
    form.setFieldsValue({
      name: product.spec.name,
      adultPriceYuan: centsToYuan(product.spec.adultPriceCents),
      childPriceYuan: centsToYuan(product.spec.childPriceCents),
      singleRoomSupplementYuan: centsToYuan(product.spec.singleRoomSupplementCents),
      notes: product.spec.notes ?? undefined,
    })
  }, [product, form])

  return (
    <Card
      title="报价"
      extra={
        <ProductSectionSaveButton
          canEdit={canEdit}
          loading={saving}
          onSave={() => void form.validateFields().then((values) => onSaveSpec(values))}
        />
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        单规格默认价；新建班期时复制为快照，改默认价不回写既有班期。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.Item name="name" label="规格名称" rules={[{ required: true }]}>
          <Input style={{ maxWidth: 240 }} />
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

      <Typography.Title level={5} style={{ marginTop: 8 }}>
        班期（有效 {product.activeScheduleCount}）
      </Typography.Title>
      {canEdit ? (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          onClick={onCreateSchedule}
        >
          新建班期
        </Button>
      ) : null}
      <Table<ProductScheduleSummary>
        rowKey="id"
        pagination={false}
        dataSource={product.schedules}
        columns={[
          { title: '标题', dataIndex: 'title', render: (value) => value || '-' },
          { title: '日期规则', dataIndex: 'dateRuleText', render: (value) => value || '-' },
          {
            title: '成人价',
            key: 'adult',
            render: (_, row) =>
              row.priceOnInquiry
                ? '询价'
                : row.adultPriceCents != null
                  ? `¥${centsToYuan(row.adultPriceCents)}`
                  : '-',
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: ProductScheduleStatus) => (
              <Tag>{PRODUCT_SCHEDULE_STATUS_LABELS[status]}</Tag>
            ),
          },
          ...(canEdit
            ? [
                {
                  title: '操作',
                  key: 'actions',
                  render: (_: unknown, row: ProductScheduleSummary) => (
                    <Button type="link" onClick={() => onEditSchedule(row)}>
                      编辑
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  )
}
