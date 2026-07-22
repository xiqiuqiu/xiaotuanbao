import { useEffect } from 'react'
import { Card, Form, Input } from 'antd'
import { ProductSectionSaveButton } from './ProductSectionSaveButton'

export function ProductTextBlockCard({
  title,
  content,
  canEdit,
  saving,
  placeholder,
  rows = 3,
  onSave,
}: {
  title: string
  content: string
  canEdit: boolean
  saving: boolean
  placeholder?: string
  rows?: number
  onSave: (content: string) => void
}) {
  const [form] = Form.useForm<{ content: string }>()

  useEffect(() => {
    form.setFieldsValue({ content })
  }, [content, form])

  return (
    <Card
      title={title}
      extra={
        <ProductSectionSaveButton
          canEdit={canEdit}
          loading={saving}
          onSave={() =>
            void form.validateFields().then((values) => onSave(values.content ?? ''))
          }
        />
      }
    >
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <Form.Item name="content" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={rows} placeholder={placeholder} />
        </Form.Item>
      </Form>
    </Card>
  )
}
