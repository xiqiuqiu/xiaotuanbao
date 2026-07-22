import { useEffect } from 'react'
import { Button, Card, Form, Input, Space, Typography } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import type { ProductFeatureSummary } from '@xiaotuanbao/shared'
import { ProductSectionSaveButton } from './ProductSectionSaveButton'

export type FeatureFormItem = {
  title: string
  description: string
}

export function ProductFeaturesCard({
  features,
  canEdit,
  saving,
  onSave,
}: {
  features: ProductFeatureSummary[]
  canEdit: boolean
  saving: boolean
  onSave: (features: FeatureFormItem[]) => void
}) {
  const [form] = Form.useForm<{ features: FeatureFormItem[] }>()

  useEffect(() => {
    form.setFieldsValue({
      features:
        features.length > 0
          ? features.map((feature) => ({
              title: feature.title,
              description: feature.description,
            }))
          : [],
    })
  }, [features, form])

  return (
    <Card
      title="产品特色"
      extra={
        <ProductSectionSaveButton
          canEdit={canEdit}
          loading={saving}
          onSave={() =>
            void form.validateFields().then((values) => {
              onSave(
                (values.features ?? []).map((item) => ({
                  title: item.title?.trim() ?? '',
                  description: item.description?.trim() ?? '',
                })),
              )
            })
          }
        />
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        营销卖点条目，可空；年龄/退改等规则请写在报名须知。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.List name="features">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {fields.map((field) => (
                <Space
                  key={field.key}
                  align="start"
                  style={{ width: '100%', display: 'flex' }}
                  size={8}
                >
                  <Form.Item
                    {...field}
                    name={[field.name, 'title']}
                    style={{ marginBottom: 0, width: 160 }}
                  >
                    <Input placeholder="短标题（可空）" />
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'description']}
                    style={{ marginBottom: 0, flex: 1 }}
                  >
                    <Input.TextArea rows={2} placeholder="说明（可空）" />
                  </Form.Item>
                  {canEdit ? (
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      aria-label="删除特色条目"
                      onClick={() => remove(field.name)}
                    />
                  ) : null}
                </Space>
              ))}
              {canEdit ? (
                <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ title: '', description: '' })} block>
                  添加特色
                </Button>
              ) : null}
              {!canEdit && fields.length === 0 ? (
                <Typography.Text type="secondary">未填写特色</Typography.Text>
              ) : null}
            </Space>
          )}
        </Form.List>
      </Form>
    </Card>
  )
}
